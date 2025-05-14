import * as React from 'react';
import type { ImageGenOptions, ImageResponse } from 'call-ai';
import { useState, useEffect } from 'react';
import { useImageGen } from '../hooks/use-image-gen';
import { ImgFile } from 'use-fireproof';

export interface ImgGenProps {
  /** Text prompt for image generation (required unless _id is provided) */
  prompt?: string;
  
  /** Document ID to load a specific image instead of generating a new one */
  _id?: string;
  
  /** Classname(s) to apply to the image */
  className?: string;
  
  /** Alt text for the image */
  alt?: string;
  
  /** Image generation options */
  options?: ImageGenOptions;
  
  /** Database name or instance to use for storing images */
  database?: string | any;
  
  /** Callback when image load completes successfully */
  onLoad?: () => void;
  
  /** Callback when image load fails */
  onError?: (error: Error) => void;
}

/**
 * React component for generating images with call-ai's imageGen
 * Provides automatic caching, reactive updates, and placeholder handling
 */
export const ImgGen = React.memo(function ImgGen({
  prompt = '',
  _id,
  className = '',
  alt,
  options,
  database,
  onLoad,
  onError,
}: ImgGenProps): React.ReactElement {
  // Validate that either prompt or _id is provided
  if (!prompt && !_id) {
    return <div className={`img-gen ${className}`}>Waiting for prompt</div>;
  }
  
  // Use the custom hook for all the image generation logic
  const {
    imageData,
    loading,
    error,
    progress,
    document,
  } = useImageGen({ prompt, _id, options, database });
  
  // Call onLoad/onError callbacks when status changes
  React.useEffect(() => {
    if (!loading) {
      if (error) {
        // Image generation failed
        onError?.(error);
      } else if (document && document._files && document._files.image) {
        // Image generation succeeded
        onLoad?.();
      }
    }
  }, [loading, error, document, onLoad, onError]);
  
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
  return <div className="img-gen-error">Failed to render image</div>;
});


// Add static displayName to help with React DevTools and error reporting
ImgGen.displayName = 'ImgGen';

export default ImgGen;
