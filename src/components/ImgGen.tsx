import * as React from 'react';
import { v4 as uuid } from 'uuid';
import type { ImageGenOptions, ImageResponse } from 'call-ai';
import { useImageGen } from '../hooks/image-gen/use-image-gen';
import { ImgGenPromptWaiting, ImgGenPlaceholder, ImgGenDisplay, ImgGenError } from './ImgGenUtils';

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
  
  /** Callback when document is deleted */
  onDelete?: (docId: string) => void;
  
  /** Callback when a new version should be generated */
  onGenerateNewVersion?: (docId: string, prompt: string) => void;
}

/**
 * Core implementation of ImgGen component
 * This is the component that gets remounted when the document ID or prompt changes
 */
function ImgGenCore(props: ImgGenProps): React.ReactElement {
  // Destructure the props for cleaner code
  const { 
    prompt, 
    _id, 
    className, 
    alt, 
    options, 
    database, 
    onLoad, 
    onError,
    onDelete,
    onGenerateNewVersion 
  } = props;
  
  // Create state to track when we need to regenerate an image
  const [shouldRegenerate, setShouldRegenerate] = React.useState(false);
  
  // Calculate isPlaceholder as derived value, not state
  const isPlaceholder = React.useMemo(() => !prompt && !_id, [prompt, _id]);

  // Use the custom hook for all the image generation logic
  const { imageData, loading, error, progress, document } = useImageGen({
    // Only pass prompt if _id is not provided
    prompt: !_id ? (prompt || '') : undefined,
    _id,
    options,
    database,
    // Use regenerate flag to trigger regeneration
    regenerate: shouldRegenerate,
    // Skip processing if neither prompt nor _id is provided
    skip: isPlaceholder
  });
  
  // Handle refresh/regenerate request
  const handleRefresh = React.useCallback((docId: string) => {
    console.log(`Regenerating image for document ${docId}`);
    // If user provided a callback, use that
    if (onGenerateNewVersion && document) {
      // Get current prompt from document's prompt structure
      const currentPrompt = document.prompts && document.currentPromptKey
        ? document.prompts[document.currentPromptKey]?.text
        : document.prompt || ''; // Fallback for legacy documents
      
      onGenerateNewVersion(docId, currentPrompt);
      return;
    }
    
    // Otherwise, use the current document to generate a new version
    if (document) {
      // Set regenerate flag to true to trigger a new image generation
      setShouldRegenerate(true);
    }
  }, [document, onGenerateNewVersion]);
  
  // Handle delete request
  const handleDelete = React.useCallback((docId: string) => {
    if (onDelete) {
      onDelete(docId);
    } else {
      console.log(`Document ${docId} would be deleted (no onDelete handler provided)`);
    }
  }, [onDelete]);

  // Load/error effect - always declare in the same order
  React.useEffect(() => {
    if (!loading) {
      if (error) {
        // Image generation failed
        onError?.(error);
      } else if (document && document._files) {
        // Image generation succeeded - now supports both legacy and versioned files
        onLoad?.();
      }
    }
  }, [loading, error, document, onLoad, onError]);
  
  // Render function that determines what to show
  const renderContent = () => {
    // If we don't have a prompt or ID, show the waiting component
    if (isPlaceholder) {
      return <ImgGenPromptWaiting className={className} />;
    }
    
    // Check if we have a document, even if we're still loading (for regeneration case)
    if (document && document._files) {
      // Get the alt text from either:
      // 1. Explicitly provided alt prop
      // 2. Current prompt from the document's prompt structure
      // 3. Legacy prompt field
      // 4. Empty string as fallback
      const altText = alt || 
        (document.prompts && document.currentPromptKey
          ? document.prompts[document.currentPromptKey]?.text
          : document.prompt || '');
      
      // Show the document display with regeneration state if applicable
      return (
        <div style={{ position: 'relative' }}>
          <ImgGenDisplay 
            document={document} 
            className={className} 
            alt={altText}
            onDelete={handleDelete}
            onRefresh={handleRefresh}
          />
          
          {/* Show progress overlay during regeneration */}
          {loading && shouldRegenerate && (
            <div 
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                zIndex: 50
              }}
            >
              {/* Progress bar */}
              <div
                style={{
                  height: '8px',
                  width: `${progress}%`,
                  backgroundColor: '#0066cc',
                  transition: 'width 0.3s ease-in-out',
                }}
                aria-hidden="true"
              />
            </div>
          )}
        </div>
      );
    }
    
    // Otherwise, for initial load or error states, show the placeholder
    if (loading || !imageData || error) {
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

    // Fallback for any other unexpected state
    return <ImgGenError />;
  };

  // Always render through the render function - no conditional returns in the main component body
  return renderContent();
}

/**
 * Main component for generating images with call-ai's imageGen
 * Provides automatic caching, reactive updates, and placeholder handling
 * Uses a mountKey to ensure clean state when switching documents
 */
export function ImgGen(props: ImgGenProps): React.ReactElement {
  const { _id, prompt } = props;
  
  // Generate a unique mountKey for this instance
  const [mountKey, setMountKey] = React.useState(() => uuid());
  
  // Track previous props to detect identity changes
  const prevIdRef = React.useRef<string | undefined>(_id);
  const prevPromptRef = React.useRef<string | undefined>(prompt);
  
  // Update mountKey when document identity changes
  React.useEffect(() => {
    const idChanged = _id !== prevIdRef.current;
    const promptChanged = prompt && prompt !== prevPromptRef.current;
    
    // Reset mountKey if we switched documents, or if we're showing a new prompt
    // with no document ID (which means a brand new generation)
    if (idChanged || (!_id && promptChanged)) {
      setMountKey(uuid()); // Force a remount of ImgGenCore
    }
    
    // Update refs for next comparison
    prevIdRef.current = _id;
    prevPromptRef.current = prompt;
  }, [_id, prompt]);
  
  // Render the core component with a key to force remount when identity changes
  return <ImgGenCore {...props} key={mountKey} />;
}

// Simple export - no memoization or complex structure
export default ImgGen;
