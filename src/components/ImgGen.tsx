import * as React from 'react';
import type { ImageGenOptions, ImageResponse } from 'call-ai';
import { useEffect } from 'react';
import { useImageGen } from '../hooks/use-image-gen';
import {
  ImgGenPromptWaiting,
  ImgGenPlaceholder,
  ImgGenDisplay,
  ImgGenError
} from './ImgGenUtils';

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
 * Main component for generating images with call-ai's imageGen
 * Provides automatic caching, reactive updates, and placeholder handling
 */
export function ImgGen(props: ImgGenProps): React.ReactElement {
  // Destructure the props for cleaner code
  const { prompt, _id, className, alt, options, database, onLoad, onError } = props;
  
  // Validate that either prompt or _id is provided
  if (!prompt && !_id) {
    return <ImgGenPromptWaiting className={className} />;
  }
  
  // Use the custom hook for all the image generation logic
  const {
    imageData,
    loading,
    error,
    progress,
    document,
  } = useImageGen({ prompt: prompt || '', _id, options, database });
  
  // Call onLoad/onError callbacks when status changes
  useEffect(() => {
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
      <ImgGenPlaceholder
        className={className}
        alt={alt}
        prompt={prompt}
        progress={progress}
        error={error}
      />
    );
  }

  // Render using ImgFile component when document is available
  if (document && document._files && document._files.image) {
    return (
      <ImgGenDisplay
        document={document}
        className={className}
        alt={alt || prompt || ''}
      />
    );
  }
  
  // This should never happen but added as a failsafe
  return <ImgGenError />;
}

// Simple export - no memoization or complex structure
export default ImgGen;
