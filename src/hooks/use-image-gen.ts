import { useState, useEffect, useRef, useMemo } from 'react';
import { imageGen as originalImageGen } from 'call-ai';
import type { ImageGenOptions, ImageResponse } from 'call-ai';
import { useFireproof } from 'use-fireproof';
import type { DocFileMeta } from 'use-fireproof';

// Keep track of ongoing image generation calls to prevent duplicates
const pendingImageGenCalls: Record<string, Promise<ImageResponse>> = {};

// Wrapper for imageGen that prevents duplicate calls
function imageGen(prompt: string, options?: ImageGenOptions): Promise<ImageResponse> {
  const key = `${prompt}-${JSON.stringify(options || {})}`;
  
  if (key in pendingImageGenCalls) {
    console.log(`[ImgGen Debug] Using existing imageGen call for: ${prompt}`);
    return pendingImageGenCalls[key];
  }
  
  console.log(`[ImgGen Debug] New imageGen call for: ${prompt}`);
  const promise = originalImageGen(prompt, options);
  
  // Only store and track the promise if it's a real Promise object
  if (promise && typeof promise.then === 'function') {
    pendingImageGenCalls[key] = promise;
    
    // Add completion log when the promise resolves
    promise.then(() => {
      console.log('Image generation completed!');
    }).catch(() => {});
    
    // Clean up after the promise resolves or rejects
    promise.finally(() => {
      delete pendingImageGenCalls[key];
    }).catch(() => {});
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
  const promptKey = hashPrompt(prompt);
  
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
        // If _id is provided, use that directly, otherwise use the promptKey
        const docId = _id || `img:${promptKey}`;
        
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
          console.error('Error retrieving from Fireproof:', error);
          
          // If we have a prompt, try direct generation as fallback
          if (prompt && !data) {
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
  }, [prompt, _id, memoizedOptions, promptKey, database]); // Using memoizedOptions

  return {
    imageData,
    loading,
    progress,
    error,
    size: { width, height },
    document
  };
}
