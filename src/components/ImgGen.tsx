import * as React from 'react';
import { v4 as uuid } from 'uuid';
import type { ImageGenOptions } from 'call-ai';
import { useImageGen } from '../hooks/image-gen/use-image-gen';
import { useFireproof, Database } from 'use-fireproof';
import { ImageDocument } from '../hooks/image-gen/types';
import { ImgGenPromptWaiting, ImgGenPlaceholder, ImgGenDisplay, ImgGenError } from './ImgGenUtils';
import { ImgGenClasses, defaultClasses, combineClasses } from '../utils/style-utils';

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

  /** Callback when prompt is edited */
  // eslint-disable-next-line no-unused-vars
  onPromptEdit?: (id: string, newPrompt: string) => void;

  /** Custom CSS classes for styling component parts */
  classes?: ImgGenClasses;
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
    onPromptEdit,
    classes = defaultClasses,
  } = props;

  // Get access to the Fireproof database directly
  const { database: db } = useFireproof(database || 'ImgGen');

  // Use a ref to track regeneration state instead of a state variable
  // This avoids unnecessary re-renders when toggling regeneration state
  const regenerateRef = React.useRef(false);

  // Store the counter in state for triggering re-renders when needed
  const [regenerateCounter, setRegenerateCounter] = React.useState(0);

  // Calculate isPlaceholder as a pure expression instead of using useMemo
  // This is simple enough that React doesn't need to track dependencies or cache the result
  const isPlaceholder = !prompt && !_id;

  // Use the custom hook for all the image generation logic
  const { imageData, loading, error, progress, document } = useImageGen({
    // Always use the original props, no need for state tracking
    prompt: _id ? undefined : prompt || '',
    _id: _id,
    options,
    database,
    // Use the ref value for regeneration flag
    regenerate: regenerateRef.current,
    // Skip processing if neither prompt nor _id is provided
    skip: isPlaceholder,
  });

  // When document is generated, use its ID for subsequent operations
  // This is done through the parent component's remounting logic with uuid()

  // Handle regeneration when the button is clicked
  const handleRegen = React.useCallback(() => {
    if (document?._id || _id || prompt) {
      // Toggle regeneration flag
      regenerateRef.current = !regenerateRef.current;

      // Increment counter to trigger a re-render
      setRegenerateCounter((prev) => prev + 1);
    }
  }, [document, _id, prompt]);

  // Handle prompt editing
  const handlePromptEdit = React.useCallback(
    async (id: string, newPrompt: string) => {
      try {
        // First, update the document in the database with the new prompt
        const docToUpdate = (await db.get(id)) as unknown as ImageDocument;

        if (docToUpdate) {
          // Create a type-safe update object
          const baseUpdate = {
            ...docToUpdate,
            prompt: newPrompt, // Update the legacy prompt field
          };

          // Check if the document has the prompts structure and update it if it exists
          if (
            'prompts' in docToUpdate &&
            'currentPromptKey' in docToUpdate &&
            docToUpdate.prompts &&
            docToUpdate.currentPromptKey
          ) {
            // Instead of updating the existing prompt, create a new prompt entry
            const updatedPrompts = { ...docToUpdate.prompts };

            // Create a new prompt key
            const promptCount = Object.keys(updatedPrompts).length + 1;
            const newPromptKey = `p${promptCount}`;

            // Add new prompt entry
            updatedPrompts[newPromptKey] = {
              text: newPrompt,
              created: Date.now(),
            };

            // Update currentPromptKey to point to the new prompt
            Object.assign(baseUpdate, { currentPromptKey: newPromptKey });

            // Don't modify the existing version's promptKey
            // This ensures that each version keeps its original prompt association
            // The new prompt will be used for the next version that gets generated
            // No need to update versions array here

            // Add the updated prompts to our update object
            Object.assign(baseUpdate, { prompts: updatedPrompts });
          }

          // Save the updated document back to the database
          await db.put(baseUpdate);
        }

        // Call the user-provided onPromptEdit callback if it exists
        if (onPromptEdit) {
          onPromptEdit(id, newPrompt);
        }

        // Now trigger regeneration with the updated prompt
        handleRegen();
      } catch (error) {
        console.error('Error updating prompt:', error);
      }
    },
    [db, onPromptEdit, handleRegen]
  );

  // Handle delete request
  const handleDelete = React.useCallback(
    (id: string) => {
      if (onDelete) {
        // If custom delete handler provided, use it
        onDelete(id);
      } else if (db) {
        // Otherwise use the database directly

        db.del(id)
          .then(() => {})
          .catch((err: Error) => {
            console.error(`Failed to delete document: ${id}`, err);
          });
      } else {
        // No database available for deletion
      }
    },
    [onDelete, db]
  );

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
    // When loading finishes and regeneration flag is on, reset it
    if (!loading && regenerateRef.current) {
      // Using a small delay to ensure the UI fully updates first
      const timer = setTimeout(() => {
        setRegenerateCounter((prev) => prev + 1);
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [loading, regenerateCounter]);

  // Render function that determines what to show
  const renderContent = () => {
    // If we don't have a prompt or ID, show the waiting component
    if (isPlaceholder) {
      return <ImgGenPromptWaiting className={className} classes={classes} />;
    }

    // Check if we have a document, even if we're still loading (for regeneration case)
    if (document && document._files) {
      // Get the alt text from either:
      // 1. Explicitly provided alt prop
      // 2. Current prompt from the document's prompt structure
      // 3. Legacy prompt field
      // 4. Empty string as fallback
      const altText =
        alt ||
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
        <div className="imggen-container">
          <ImgGenDisplay
            document={document as ImageDocument & { _id: string }}
            className={className}
            alt={altText}
            onDelete={handleDelete}
            onRegen={handleRegen}
            onPromptEdit={handlePromptEdit}
            classes={classes}
          />

          {/* Show progress overlay during regeneration */}
          {loading && regenerateRef.current && (
            <div className="imggen-progress-container">
              {/* Progress bar */}
              <div
                className={combineClasses('imggen-progress', classes.progress)}
                style={{ width: `${progress}%` }}
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
          classes={classes}
        />
      );
    }

    // Fallback for any other unexpected state
    return <ImgGenError classes={classes} />;
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
  // Destructure key props for identity-change tracking
  // classes prop is used via the props spread to ImgGenCore
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
