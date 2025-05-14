import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useFireproof } from 'use-fireproof';
import { ImageGenOptions, ImageResponse, imageGen as originalImageGen } from 'call-ai';
import type { DocFileMeta } from 'use-fireproof';

// Module-level state for tracking and preventing duplicate calls
const MODULE_STATE = {
  pendingImageGenCalls: new Map<string, Promise<ImageResponse>>(),
  pendingPrompts: new Set<string>(), // Track uniqueness by prompt+options hash
  processingRequests: new Set<string>(),
  requestTimestamps: new Map<string, number>(),
  requestCounter: 0 // To track total requests for debugging
};

// Periodically clean up stale requests (every minute)
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of MODULE_STATE.requestTimestamps.entries()) {
    if (now - timestamp > 5 * 60 * 1000) {
      MODULE_STATE.pendingImageGenCalls.delete(key);
      MODULE_STATE.processingRequests.delete(key);
      MODULE_STATE.pendingPrompts.delete(key);
      MODULE_STATE.requestTimestamps.delete(key);
    }
  }
}, 60000); // Check every minute

// Wrapper for imageGen that prevents duplicate calls
function imageGen(prompt: string, options?: ImageGenOptions): Promise<ImageResponse> {
  // Only include specific option properties that matter for image generation
  const relevantOptions = options ? {
    size: options.size,
    quality: options.quality,
    model: options.model,
    style: options.style
  } : {};
  
  // Create a stable key for the request cache
  const stableKey = `${prompt}-${JSON.stringify(relevantOptions)}`;
  
  // Create a unique ID for this specific request instance (for logging)
  const requestId = ++MODULE_STATE.requestCounter;
  
  // Check if this prompt+options combination is already being processed
  if (MODULE_STATE.pendingPrompts.has(stableKey)) {
    console.log(`[ImgGen Debug] DUPLICATE REQUEST #${requestId} DETECTED - Using existing imageGen call [key:${stableKey.slice(0, 12)}...] for: ${prompt}`);
    
    // Return the existing promise for this prompt+options combination
    if (MODULE_STATE.pendingImageGenCalls.has(stableKey)) {
      return MODULE_STATE.pendingImageGenCalls.get(stableKey)!;
    }
  }
  
  // Mark this prompt+options as being processed
  MODULE_STATE.pendingPrompts.add(stableKey);
  MODULE_STATE.processingRequests.add(stableKey);
  MODULE_STATE.requestTimestamps.set(stableKey, Date.now());
  
  console.log(`[ImgGen Debug] NEW REQUEST #${requestId} - Starting imageGen call [key:${stableKey.slice(0, 12)}...] for: ${prompt}`);
  let promise: Promise<ImageResponse>;
  
  try {
    // Direct import from call-ai - this works consistently with test mocks
    // We imported this at the top of the file
    promise = originalImageGen(prompt, options);
  } catch (e) {
    console.error(`[ImgGen Debug] Error with imageGen for request #${requestId}:`, e);
    promise = Promise.reject(e);
  }
  
  // Store the promise so other requests for the same prompt+options can use it
  MODULE_STATE.pendingImageGenCalls.set(stableKey, promise);
  
  // Clean up after the promise resolves or rejects
  promise
    .then(response => {
      console.log(`[ImgGen Debug] Request #${requestId} succeeded [key:${stableKey.slice(0, 12)}...]`);
      return response; 
    })
    .catch(error => {
      console.error(`[ImgGen Debug] Request #${requestId} failed [key:${stableKey.slice(0, 12)}...]: ${error}`);
      return Promise.reject(error);
    })
    .finally(() => {
      // After request completes, wait a short time before allowing new requests with the same key
      // This prevents immediate duplicate requests during React's render cycles
      setTimeout(() => {
        MODULE_STATE.processingRequests.delete(stableKey);
        MODULE_STATE.pendingPrompts.delete(stableKey); 
        MODULE_STATE.pendingImageGenCalls.delete(stableKey);
      }, 500); // Short delay to prevent new requests during render cycles
    });
  
  return promise;
}

/**
 * Synchronous hash function to create a key from the prompt string and options
 * @param prompt The prompt string to hash
 * @param options Optional image generation options
 * @returns A hash string for the input
 */
function hashInput(prompt: string, options?: any): string {
  // Create a string that includes both prompt and relevant options
  const inputString = JSON.stringify({
    prompt,
    // Only include relevant options properties to avoid unnecessary regeneration
    options: options ? {
      size: options.size,
      quality: options.quality,
      model: options.model,
      style: options.style,
    } : undefined
  });
  
  // Use a fast non-crypto hash for immediate results (FNV-1a algorithm)
  let hash = 2166136261; // FNV offset basis
  for (let i = 0; i < inputString.length; i++) {
    hash ^= inputString.charCodeAt(i);
    // Multiply by the FNV prime (32-bit)
    hash = Math.imul(hash, 16777619);
  }
  
  // Convert to hex string and take first 12 chars
  const hashHex = (hash >>> 0).toString(16).padStart(8, '0');
  const requestId = hashHex.slice(0, 12);
  
  // Add a timestamp to make the ID unique even for identical requests
  return `${requestId}-${Date.now().toString(36)}`;
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
  
  // Memoize the request hash to prevent recalculation on each render
  const requestHash = useMemo(() => {
    // Generate a unique hash based on prompt and options
    return hashInput(prompt, options);
  }, [prompt, options?.size, options?.quality, options?.model, options?.style]);

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
      // Create a key string based on the options to help identify duplicate calls
      const optionsKey = JSON.stringify({
        size: genOptions?.size,
        quality: genOptions?.quality,
        model: genOptions?.model,
        style: genOptions?.style
      });
      
      // Log detailed information about this request - including request hash and options
      console.log(`[ImgGen Debug] imageGen call [ID:${requestHash}] for prompt: ${promptText}`);
      console.log(`[ImgGen Debug] Request options [ID:${requestHash}]: ${optionsKey}`);
      
      // Track the time it takes to generate the image
      const startTime = Date.now();
      
      try {
        const response = await imageGen(promptText, genOptions);
        const duration = Date.now() - startTime;
        console.log(`[ImgGen Debug] Completed request [ID:${requestHash}] in ${duration}ms`);
        return response;
      } catch (error) {
        console.error(`[ImgGen Debug] Failed request [ID:${requestHash}]: ${error}`);
        throw error;
      }
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
        // If _id is provided, use that directly, otherwise use the requestHash
        const docId = _id || `img:${requestHash}`;
        
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
  }, [prompt, _id, memoizedOptions, requestHash, database]); // Using memoizedOptions and requestHash

  return {
    imageData,
    loading,
    progress,
    error,
    size: { width, height },
    document
  };
}
