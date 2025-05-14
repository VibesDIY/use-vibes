import React from 'react';
import type { ImageGenOptions, ImageResponse } from 'call-ai';
import { useImageGen } from '../hooks/use-image-gen';

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
  // Use the custom hook for all the image generation logic
  const { imageData, loading, progress, error, size } = useImageGen({
    prompt,
    options,
    beforeLoad,
    onLoad,
  });
  
  // Render placeholder while loading
  if (loading || !imageData) {
    return (
      <div
        className={`img-gen-placeholder ${className}`}
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: '#333333',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxSizing: 'border-box',
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
        <div style={{ textAlign: 'center', padding: '10px', width: '100%', wordWrap: 'break-word' }}>
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
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        display: 'block',
      }}
      loading="lazy"
    />
  );
};

export default ImgGen;
