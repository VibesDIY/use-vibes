import React, { useState, useEffect } from 'react';
import type { ImageGenOptions, ImageResponse } from 'call-ai';
import { useImageGen } from '../hooks/use-image-gen';
import { ImgFile } from 'use-fireproof';

export interface ImgGenProps {
  /** Text prompt for image generation (required) */
  prompt: string;

  /** Options for image generation (optional) */
  options?: ImageGenOptions;

  /** CSS class name for the image element (optional) */
  className?: string;

  /** Alt text for the image (defaults to prompt) */
  alt?: string;
  
  /** Database name or Fireproof database instance (defaults to "ImgGen") */
  database?: string | any;
}

/**
 * React component for generating images with call-ai's imageGen
 * Provides automatic caching, reactive updates, and placeholder handling
 */
export const ImgGen: React.FC<ImgGenProps> = ({
  prompt,
  options = {},
  className = '',
  alt,
  database,
}) => {
  // Use the custom hook for all the image generation logic
  const { imageData, loading, progress, error, size, document } = useImageGen({
    prompt,
    options,
    database,
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

  // No longer need fileUrl state since ImgFile component handles file rendering
  
  // No longer need the effect to create object URLs since ImgFile handles this for us
  
  // Render using ImgFile component from Fireproof when document is available
  if (document && document._files && document._files.image) {
    return (
      <ImgFile
        file={document._files.image}
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
  }
  
  // This should never happen but added as a failsafe
  return null;
};

export default ImgGen;
