import { useState, useEffect, useRef, useMemo } from 'react';
import { imageGen } from 'call-ai';
import type { ImageGenOptions, ImageResponse } from 'call-ai';
import { useFireproof } from 'use-fireproof';

// For tracking render/effect cycles
let renderCount = 0;
let effectRunCount = 0;
let imageGenCallCount = 0;
import type { DocFileMeta } from 'use-fireproof';

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

  // Track renders for debugging
  renderCount++;
  console.log(`[ImgGen Debug] Render #${renderCount}, prompt: ${prompt}, _id: ${_id}`);
  
  // Reset state when prompt, _id, or options change
  useEffect(() => {
    console.log(`[ImgGen Debug] Reset effect running, prompt: ${prompt}, _id: ${_id}`);
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
    effectRunCount++;
    console.log(`[ImgGen Debug] Generate image effect #${effectRunCount}, prompt: ${prompt}, _id: ${_id}`);
    
    let isMounted = true;

    // Don't generate image if both prompt and _id are falsy
    if (!prompt && !_id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setProgress(0);
    setError(null);

    const generateImage = async () => {
      imageGenCallCount++;
      console.log(`[ImgGen Debug] imageGen called #${imageGenCallCount}, prompt: ${prompt}, _id: ${_id}`);
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

        // Try to get from Fireproof cache first
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
                data: [{ b64_json: base64Data }]
              } as ImageResponse;
            }
          }
        } catch (err) {
          console.error('Error retrieving from Fireproof:', err);
        }

        // If no data in cache and no _id provided, generate new image
        if (!data && !_id) {
          // Use the actual imageGen function from call-ai
          data = await imageGen(prompt, options);
          
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
              
              // Save to Fireproof
              await db.put(imgDoc);
              const savedDoc = await db.get(docId);
              setDocument(savedDoc as unknown as ImageDocument);
            } catch (err) {
              console.error('Error saving to Fireproof:', err);
            }
          }
        }
        // If it was just a load by ID request and we have a document, we're done
        else if (_id && document) {
          // No need to generate, just finish loading
          setProgress(100);
        }

        // Update state with the image data
        if (isMounted && data) {
          setImageData(data.data[0].b64_json);
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

    generateImage();

    return () => {
      isMounted = false;
      console.log(`[ImgGen Debug] Effect cleanup, prompt: ${prompt}, _id: ${_id}`);
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
