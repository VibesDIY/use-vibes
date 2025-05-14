import { useState, useEffect, useRef, useMemo } from 'react';
import { imageGen as originalImageGen } from 'call-ai';
import type { ImageGenOptions, ImageResponse } from 'call-ai';
import { useFireproof } from 'use-fireproof';
import type { DocFileMeta } from 'use-fireproof';

// Module-level state for tracking and preventing duplicate calls
const MODULE_STATE = {
  // Keep track of ongoing image generation calls to prevent duplicates
  pendingImageGenCalls: new Map<string, Promise<ImageResponse>>(),
  // Track requests that are currently being processed (prevents race conditions)
  processingRequests: new Set<string>(),
  // Track request timestamps to avoid reusing stale promises
  requestTimestamps: new Map<string, number>(),
  // Timeout duration for cleaning up stale requests (5 minutes)
  STALE_TIMEOUT_MS: 5 * 60 * 1000,
};

// Periodically clean up stale requests (every minute)
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of MODULE_STATE.requestTimestamps.entries()) {
    if (now - timestamp > MODULE_STATE.STALE_TIMEOUT_MS) {
      MODULE_STATE.pendingImageGenCalls.delete(key);
      MODULE_STATE.processingRequests.delete(key);
      MODULE_STATE.requestTimestamps.delete(key);
    }
  }
}, 60 * 1000);

// Wrapper for imageGen that prevents duplicate calls
function imageGen(prompt: string, options?: ImageGenOptions): Promise<ImageResponse> {
  // Create a unique key for this request
  const key = `${prompt}-${JSON.stringify(options || {})}`;
  
  // If this exact request is already in progress, return the existing promise
  if (MODULE_STATE.pendingImageGenCalls.has(key) && !MODULE_STATE.processingRequests.has(key)) {
    console.log(`[ImgGen Debug] Using existing imageGen call for: ${prompt}`);
    return MODULE_STATE.pendingImageGenCalls.get(key)!;
  }
  
  // If we're already processing this request (potential race condition), 
  // wait a bit and try again
  if (MODULE_STATE.processingRequests.has(key)) {
    return new Promise((resolve) => {
      // Wait 50ms and check again
      setTimeout(() => {
        resolve(imageGen(prompt, options));
      }, 50);
    });
  }
  
  // Mark this request as being processed
  MODULE_STATE.processingRequests.add(key);
  MODULE_STATE.requestTimestamps.set(key, Date.now());
  
  console.log(`[ImgGen Debug] New imageGen call for: ${prompt}`);
  let promise: Promise<ImageResponse>;
  
  try {
    promise = originalImageGen(prompt, options);
  } catch (error) {
    // If synchronous error occurs, clean up and rethrow
    MODULE_STATE.processingRequests.delete(key);
    throw error;
  }
  
  // Only store and track the promise if it's a real Promise object
  if (promise && typeof promise.then === 'function') {
    MODULE_STATE.pendingImageGenCalls.set(key, promise);
    
    // Add completion log when the promise resolves
    promise.then(() => {
      console.log('Image generation completed!');
    }).catch(() => {});
    
    // Clean up after the promise resolves or rejects
    promise.finally(() => {
      MODULE_STATE.pendingImageGenCalls.delete(key);
      MODULE_STATE.processingRequests.delete(key);
      // Keep the timestamp a bit longer for diagnostics
      setTimeout(() => {
        MODULE_STATE.requestTimestamps.delete(key);
      }, 30000);
    }).catch(() => {});
  } else {
    // If we somehow didn't get a promise, clean up immediately
    MODULE_STATE.processingRequests.delete(key);
  }
  
  return promise;
}

/**
 * Hash function to create a key from the prompt string
 * @param prompt The prompt string to hash
 * @returns A string hash of the prompt
 */
function hashPrompt(prompt: string): string {
  let hash = 0;
  for (let i = 0; i < prompt.length; i++) {
    const char = prompt.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(16);
}

// Interface for our image documents in Fireproof
interface ImageDocument extends Record<string, any> {
  _id: string;
  type: 'image';
  prompt: string;
  _files?: Record<string, File | DocFileMeta>;
  created?: number;
}

// Convert base64 to File object
function base64ToFile(base64Data: string, filename: string): File {
  const byteString = atob(base64Data);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  
  const blob = new Blob([ab], { type: 'image/png' });
  return new File([blob], filename, { type: 'image/png' });
}

export interface UseImageGenOptions {
  /** Text prompt for image generation (required unless _id is provided) */
  prompt: string;
  
  /** Document ID to load a specific image instead of generating a new one */
  _id?: string;
  
  /** Options for image generation */
  options?: ImageGenOptions;
  
  /** Fireproof database name or instance */
  database?: string | any;
}

export interface UseImageGenResult {
  /** Base64 image data */
  imageData: string | null;
  
  /** Whether the image is currently loading */
  loading: boolean;
  
  /** Progress percentage (0-100) */
  progress: number;
  
  /** Error if image generation failed */
  error: Error | null;
  
  /** Size information parsed from options */
  size: {
    width: number;
    height: number;
  };
  
  /** Document for the generated image */
  document: ImageDocument | null;
}

/**
 * Hook for generating images with call-ai's imageGen
 * Provides automatic caching, reactive updates, and progress handling
 */
export function useImageGen({
  prompt,
  _id,
  options = {},
  database = "ImgGen",
}: UseImageGenOptions): UseImageGenResult {
  const [imageData, setImageData] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [error, setError] = useState<Error | null>(null);
  const [document, setDocument] = useState<ImageDocument | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Initialize Fireproof database
  const { database: db } = useFireproof(database);
  
  const size = options?.size || '1024x1024';
  const [width, height] = size.split('x').map(Number);

  // Memoize the options object to prevent unnecessary re-renders
  const memoizedOptions = useMemo(() => options, [
    // Only include specific option properties that should trigger regeneration
    options?.quality,
    options?.size,
    options?.model,
    options?.style
    // Add any other properties from options that matter for image generation
  ]);
  
  // Memoize the promptKey to prevent recalculation on each render
  const memoizedPromptKey = useMemo(() => hashPrompt(prompt), [prompt]);

  // No debug tracking for renders
  
  // Reset state when prompt, _id, or options change
  useEffect(() => {
    setImageData(null);
    setError(null);
    setProgress(0);

    // Clear any existing progress timer
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }

    // Cleanup on unmount or when dependencies change
    return () => {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
      }
    };
  }, [prompt, _id, memoizedOptions]); // Using memoizedOptions instead of JSON.stringify

  // Generate the image when prompt or options change or load by ID
  useEffect(() => {
    
    let isMounted = true;

    // Don't generate image if both prompt and _id are falsy
    if (!prompt && !_id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setProgress(0);
    setError(null);

    // Function that handles the actual image generation call
    const callImageGeneration = async (promptText: string, genOptions?: ImageGenOptions): Promise<ImageResponse> => {
      console.log(`[ImgGen Debug] imageGen call for prompt: ${promptText}`);
      
      return imageGen(promptText, genOptions);
    };

    // Main function that handles the image loading/generation process
    const loadOrGenerateImage = async () => {
      try {
        // Start the progress animation only when loading starts
        // Set up progress timer simulation (45 seconds to completion)
        // This is just for visual feedback and doesn't reflect actual progress
        const timer = setInterval(() => {
          setProgress((prev: number) => {
            const next = prev + (100 - prev) * 0.05;
            return next > 99 ? 99 : next;
          });
        }, 1000);
        progressTimerRef.current = timer;

        let data: ImageResponse | null = null;
        // If _id is provided, use that directly, otherwise use the memoizedPromptKey
        const docId = _id || `img:${memoizedPromptKey}`;
        
        try {
          // Try to get from Fireproof first
          const existingDoc = await db.get(docId).catch(() => null);
          
          if (existingDoc && existingDoc._files) {
            // Document exists, set it
            setDocument(existingDoc as unknown as ImageDocument);
            
            // If we have a file in the document, read it for backward compatibility with our state
            if (existingDoc._files.image && 'file' in existingDoc._files.image && typeof existingDoc._files.image.file === 'function') {
              const fileObj = await existingDoc._files.image.file();
              // Read the file as base64
              const reader = new FileReader();
              const base64Promise = new Promise<string>((resolve, reject) => {
                reader.onload = () => {
                  const base64 = reader.result as string;
                  // Strip the data URL prefix if present
                  const base64Data = base64.split(',')[1] || base64;
                  resolve(base64Data);
                };
                reader.onerror = reject;
              });
              reader.readAsDataURL(fileObj);
              const base64Data = await base64Promise;
              
              // Create a response-like object
              data = {
                created: Date.now(),
                data: [{
                  b64_json: base64Data,
                  url: undefined,
                  revised_prompt: prompt,
                }],
              };

              setImageData(base64Data);
            }
          } else if (prompt) {
            // Document doesn't exist, generate new image
            data = await callImageGeneration(prompt, options);
            
            // Store in Fireproof
            if (data && data.data && data.data[0] && data.data[0].b64_json) {
              try {
                // Create a File object from the base64 data
                const imageFile = base64ToFile(data.data[0].b64_json, 'image.png');
                
                // Create or update the document
                const imgDoc: ImageDocument = {
                  _id: docId,
                  type: 'image',
                  prompt,
                  options,
                  created: Date.now(),
                  _files: {
                    image: imageFile
                  }
                };
                const result = await db.put(imgDoc);
                
                // Get the document with the file attached
                const doc = await db.get(result.id);
                setDocument(doc as unknown as ImageDocument);
                
                setImageData(data.data[0].b64_json);
              } catch (e) {
                console.error('Error saving to Fireproof:', e);
                // Even if we fail to save to Fireproof, we still have the image data so don't throw
                setImageData(data.data[0].b64_json);
              }
            }
          } else {
            throw new Error('Document not found and no prompt provided for generation');
          }
        } catch (error) {
          // Log but don't attempt a second generation if we already tried once
          console.error('Error retrieving from Fireproof:', error);
          
          // Only try image generation as fallback if we haven't already done it
          // and we have a prompt to use
          if (prompt && !data && !docId.startsWith('img:')) {
            // This is likely for a document lookup that failed, so try generation as last resort
            data = await callImageGeneration(prompt, options);
            if (data && data.data && data.data[0] && data.data[0].b64_json) {
              setImageData(data.data[0].b64_json);
            }
          } else {
            throw error;
          }
        }

        // Update state with the image data
        if (isMounted && data) {
          setProgress(100);

          // Clear progress timer
          if (progressTimerRef.current) {
            clearInterval(progressTimerRef.current);
            progressTimerRef.current = null;
          }

          // All done successfully
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (isMounted) {
          // Clear progress timer if it's still running
          if (progressTimerRef.current) {
            clearInterval(progressTimerRef.current);
            progressTimerRef.current = null;
          }
          setLoading(false);
        }
      }
    };

    // Always call the function since it handles both prompt-based generation and ID-based retrieval
    loadOrGenerateImage();

    return () => {
      isMounted = false;
    };
  }, [prompt, _id, memoizedOptions, memoizedPromptKey, database]); // Using memoizedOptions and memoizedPromptKey

  return {
    imageData,
    loading,
    progress,
    error,
    size: { width, height },
    document
  };
}
