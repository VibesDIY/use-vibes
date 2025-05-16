import * as React from 'react';
import { v4 as uuid } from 'uuid';
import type { ImageGenOptions } from 'call-ai';
import { useImageGen } from '../hooks/image-gen/use-image-gen';
import { useFireproof, Database } from 'use-fireproof';
import { ImageDocument } from '../hooks/image-gen/types';
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
  database?: string | Database;

  /** Callback when image load completes successfully */
  onLoad?: () => void;

  /** Callback when image load fails */
  // eslint-disable-next-line no-unused-vars
  onError?: (error: Error) => void;
  
  /** Callback when document is deleted */
  // eslint-disable-next-line no-unused-vars
  onDelete?: (id: string) => void;
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
    onDelete 
  } = props;
  
  // Get access to the Fireproof database directly
  const { database: db } = useFireproof(database || 'ImgGen');
  
  // Create state to track regeneration requests with a toggle pattern
  // We use a number as a counter - each regeneration increments it
  const [regenerateCounter, setRegenerateCounter] = React.useState(0);
  
  // Track the document ID once it's created for reuse during regeneration
  const [trackedDocId, setTrackedDocId] = React.useState<string | undefined>(_id);
  
  // Derive boolean flag from counter - odd values are true, even values are false
  // This allows us to toggle between regeneration states
  const shouldRegenerate = regenerateCounter % 2 === 1;
  
  // Calculate isPlaceholder as derived value, not state
  const isPlaceholder = React.useMemo(() => !prompt && !_id, [prompt, _id]);

  // Use the custom hook for all the image generation logic
  const { imageData, loading, error, progress, document } = useImageGen({
    // Only pass prompt if no tracked ID is available
    prompt: !trackedDocId ? (prompt || '') : undefined,
    // Use tracked ID if available, otherwise use the original _id
    _id: trackedDocId || _id,
    options,
    database,
    // Use regenerate flag to trigger regeneration
    regenerate: shouldRegenerate,
    // Skip processing if neither prompt nor _id is provided
    skip: isPlaceholder
  });
  
  // Update the tracked document ID when a document is created from a prompt
  React.useEffect(() => {
    // Only update if we have a document with an ID and we're not already tracking it
    if (document?._id && document._id !== trackedDocId) {
      console.log('[ImgGen] Updating tracked document ID:', document._id);
      setTrackedDocId(document._id);
    }
  }, [document, trackedDocId]);
  
  // Handle regeneration when the button is clicked
  const handleGenerateNewVersion = React.useCallback(() => {
    // Enhanced regeneration that uses tracked document ID for consistency
    console.log('[ImgGen] Regenerate clicked:', { 
      hasDocument: !!document, 
      documentId: document?._id,
      trackedDocId,
      prompt, 
      currentRegenerateCounter: regenerateCounter,
      shouldRegenerate: !shouldRegenerate // What it will be after increment
    });
    
    // Check for document or tracked ID first
    if (document || trackedDocId) {
      // If we have a document or tracked ID, use that for regeneration
      const idToUse = document?._id || trackedDocId;
      console.log('[ImgGen] Regenerating with document ID:', idToUse);
      // Increment counter to trigger a new image generation
      setRegenerateCounter(prev => {
        console.log('[ImgGen] Incrementing regenerateCounter:', prev, '->', prev + 1);
        return prev + 1;
      });
    } else if (prompt) {
      // If no document yet but we have a prompt, force regeneration
      console.log('[ImgGen] Regenerating with prompt only');
      // by changing the regenerateCounter to trigger a re-render
      setRegenerateCounter(prev => {
        console.log('[ImgGen] Incrementing regenerateCounter:', prev, '->', prev + 1);
        return prev + 1;
      });
    } else {
      console.log('[ImgGen] Cannot regenerate - no document, tracked ID, or prompt available');
    }
  }, [document, prompt, trackedDocId, shouldRegenerate, regenerateCounter]);
  
  // Handle delete request
  const handleDelete = React.useCallback((id: string) => {
    if (onDelete) {
      // If custom delete handler provided, use it
      onDelete(id);
    } else if (db) {
      // Otherwise use the database directly

      db.del(id)
        .then(() => {

        })
        .catch((err: Error) => {
          console.error(`Failed to delete document: ${id}`, err);
        });
    } else {
      // No database available for deletion
    }
  }, [onDelete, db]);

  // Load/error effect - always declare in the same order
  React.useEffect(() => {
    if (!loading) {
      if (error) {
        // Image generation failed
        onError?.(error); // Pass error to callback
      } else if (document && document._files) {
        // Image generation succeeded - now supports both legacy and versioned files
        onLoad?.();
      }
    }
  }, [loading, error, document, onLoad, onError]);

  // Detect completion of regeneration to prepare for next one
  React.useEffect(() => {
    // When loading finishes and we were in a regeneration state (odd counter),
    // increment the counter again to reach an even number (ready state)
    if (!loading && shouldRegenerate) {
      // Using a small delay to ensure the UI fully updates first
      const timer = setTimeout(() => {
        setRegenerateCounter(prev => prev + 1);
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [loading, shouldRegenerate]);

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
      // Ensure document has a defined _id for display
      if (!document._id) {
        console.error('Document is missing _id', document);
        return <div>Error: Invalid document</div>;
      }
      
      return (
        <div style={{ position: 'relative' }}>
          <ImgGenDisplay 
            document={document as (ImageDocument & { _id: string })} 
            className={className} 
            alt={altText}
            onDelete={handleDelete}
            onRefresh={handleGenerateNewVersion}
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
