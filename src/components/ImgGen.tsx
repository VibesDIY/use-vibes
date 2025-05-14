import React, { useEffect, useState, useRef } from 'react';
import { imageGen } from 'call-ai';
import type { ImageGenOptions, ImageResponse } from 'call-ai';

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

interface CacheImplementation {
  get: (key: string) => ImageResponse | null;
  set: (key: string, value: ImageResponse) => void;
}

// Default cache implementation using localStorage
const defaultCacheImpl: CacheImplementation = {
  get: (key: string): ImageResponse | null => {
    try {
      const data = localStorage.getItem(`imggen-${key}`);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.error('Error retrieving from ImgGen cache', e);
      return null;
    }
  },
  set: (key: string, value: ImageResponse): void => {
    try {
      localStorage.setItem(`imggen-${key}`, JSON.stringify(value));
    } catch (e) {
      console.error('Error storing in ImgGen cache', e);
    }
  },
};

export interface ImgGenProps {
  /** Text prompt for image generation (required) */
  prompt: string;

  /** Options for image generation (optional) */
  options?: ImageGenOptions;

  /** Callback to retrieve cached data before load (optional) */
  beforeLoad?: (key: string) => ImageResponse | null | Promise<ImageResponse | null>;

  /** Callback when image data is loaded (optional) */
  onLoad?: (response: ImageResponse) => void;

  /** CSS class name for the image element (optional) */
  className?: string;

  /** Alt text for the image (defaults to prompt) */
  alt?: string;
}

/**
 * React component for generating images with call-ai's imageGen
 * Provides automatic caching, reactive updates, and placeholder handling
 */
export const ImgGen: React.FC<ImgGenProps> = ({
  prompt,
  options = {},
  beforeLoad,
  onLoad,
  className = '',
  alt,
}) => {
  const [imageData, setImageData] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [error, setError] = useState<Error | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  const promptKey = hashPrompt(prompt);

  const size = options?.size || '1024x1024';
  const [width, height] = size.split('x').map(Number);

  // Reset state when prompt or options change
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
  }, [prompt, JSON.stringify(options)]);

  // Generate the image when prompt or options change
  useEffect(() => {
    let isMounted = true;

    // Don't generate image if prompt is falsy
    if (!prompt) {
      setLoading(false);
      return;
    }

    const generateImage = async (): Promise<void> => {
      try {
        setLoading(true);
        
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

        // Try to get from cache via the beforeLoad callback if provided
        let data: ImageResponse | null = null;

        if (beforeLoad) {
          data = await beforeLoad(promptKey);
        } else {
          // Use default cache implementation
          data = defaultCacheImpl.get(promptKey);
        }

        // If no data in cache, generate new image
        if (!data) {
          // Use the actual imageGen function from call-ai
          data = await imageGen(prompt, options);

          // Cache the result using default implementation
          // if beforeLoad wasn't provided
          if (!beforeLoad) {
            defaultCacheImpl.set(promptKey, data);
          }
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

          // Call onLoad callback if provided
          if (onLoad) {
            onLoad(data);
          }
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
    };
  }, [prompt, JSON.stringify(options), promptKey, beforeLoad, onLoad]);

  // Common styles for aspect ratio and container fitting
  const containerStyle = {
    maxWidth: '100%',
    aspectRatio: `${width} / ${height}`,
    width: 'auto', // Allow container to be sized by parent
    height: 'auto', // Allow container to be sized by parent
    display: 'block',
  };

  // Render placeholder while loading
  if (loading || !imageData) {
    return (
      <div
        className={`img-gen-placeholder ${className}`}
        style={{
          ...containerStyle,
          backgroundColor: '#f0f0f0',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        aria-label={alt || prompt || 'Image placeholder'}
        role="img"
      >
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            height: '4px',
            width: `${progress}%`,
            backgroundColor: '#0066cc',
            transition: 'width 0.3s ease-in-out',
          }}
          aria-hidden="true"
        />
        <div style={{ textAlign: 'center', padding: '10px' }}>
          {error ? (
            <div className="img-gen-error">
              <p>Error: {error.message}</p>
            </div>
          ) : !prompt ? (
            <div>Waiting for prompt</div>
          ) : (
            <div>Generating image...</div>
          )}
        </div>
      </div>
    );
  }

  // Render the generated image
  return (
    <img
      src={`data:image/png;base64,${imageData}`}
      className={`img-gen ${className}`}
      alt={alt || prompt}
      style={containerStyle}
      loading="lazy"
    />
  );
};

export default ImgGen;
