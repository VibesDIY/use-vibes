import * as React from 'react';
import { v4 as uuid } from 'uuid';
import { useImageGen } from '../hooks/image-gen/use-image-gen';
import { useFireproof } from 'use-fireproof';
import type { ImageDocument } from '../hooks/image-gen/types';
import {
  ImgGenPromptWaiting,
  ImgGenDisplayPlaceholder,
  ImgGenDisplay,
  ImgGenError,
} from './ImgGenUtils';
import { ImgGenUploadWaiting } from './ImgGenUtils/ImgGenUploadWaiting';
import { getImgGenMode } from './ImgGenUtils/ImgGenModeUtils';
import { defaultClasses } from '../utils/style-utils';
import type { ImgGenProps } from './ImgGen.types';

/**
 * Core implementation of ImgGen component
 * This is the component that gets remounted when the document ID or prompt changes
 */
export function ImgGenCore(props: ImgGenProps): React.ReactElement {
  // Destructure the props for cleaner code
  const {
    prompt,
    _id,
    className,
    alt,
    images,
    options,
    database,
    onComplete,
    onError,
    onDelete,
    onPromptEdit,
    classes = defaultClasses,
    onDocumentCreated,
    debug,
  } = props;

  // Get access to the Fireproof database directly
  const { database: db } = useFireproof(database || 'ImgGen');

  // Use a unique generationId to trigger regeneration
  const [generationId, setGenerationId] = React.useState<string | undefined>(undefined);

  // Track the edited prompt to pass to the image generator and show in UI
  const [currentEditedPrompt, setCurrentEditedPrompt] = React.useState<string | undefined>(undefined);

  // Track the document for image generation - use ImageDocument type or Record
  const [imageGenDocument, setImageGenDocument] = React.useState<ImageDocument | null>(null);

  // Merge options with images into a single options object for the hook
  const mergedOptions = React.useMemo(() => (images ? { ...options, images } : options), [options, images]);

  // Determine the effective prompt to use - either from form submission or props
  const effectivePrompt = currentEditedPrompt || prompt || '';

  // Check if we should skip image generation
  const shouldSkipGeneration = !effectivePrompt && !_id;

  // Use the custom hook for all the image generation logic
  const { imageData, loading, error, progress, document } = useImageGen({
    prompt: effectivePrompt,
    _id,
    options: {
      ...mergedOptions,
      ...(imageGenDocument ? { document: imageGenDocument } : {}),
    },
    database,
    generationId,
    skip: shouldSkipGeneration,
  });

  // Determine the current display mode based on document state
  const mode = React.useMemo(() => {
    return getImgGenMode({
      document,
      prompt: effectivePrompt,
      loading,
      error: error || undefined,
      debug,
    });
  }, [document, effectivePrompt, loading, error, debug]);

  if (debug) {
    console.log('[ImgGenCore] Current mode:', mode, {
      document: !!document,
      documentId: document?._id,
      prompt: !!prompt,
      loading,
      error: !!error,
    });
  }

  React.useEffect(() => {
    if (onComplete && imageData && !loading && !error) {
      onComplete();
    }
  }, [onComplete, imageData, loading, error]);

  React.useEffect(() => {
    if (onError && error) {
      onError(error);
    }
  }, [onError, error]);

  const handleRegen = React.useCallback(() => {
    if (document?._id || _id || prompt) {
      const newGenId = crypto.randomUUID();
      setGenerationId(newGenId);
    }
  }, [document, _id, prompt]);

  const handlePromptEdit = React.useCallback(
    async (id: string, newPrompt: string) => {
      setCurrentEditedPrompt(newPrompt);

      try {
        const doc = await db.get(id);
        if (!doc) {
          console.error('Document not found:', id);
          return;
        }

        const updatedDoc: Record<string, unknown> = { ...doc };

        if (updatedDoc.prompts) {
          const promptKey = `p${Date.now()}`;
          updatedDoc.prompts = {
            ...updatedDoc.prompts,
            [promptKey]: { text: newPrompt },
          };
          updatedDoc.currentPromptKey = promptKey;
        } else {
          updatedDoc.prompt = newPrompt;
        }

        await db.put(updatedDoc);
        const refreshed = await db.get(id);
        setImageGenDocument(refreshed as unknown as ImageDocument);
      } catch (e) {
        console.error('Error updating prompt:', e);
      }
    },
    [db]
  );

  const handleDelete = React.useCallback(
    async (id: string) => {
      if (!id) return;
      try {
        const doc = await db.get(id);
        await db.remove(doc._id, doc._rev);
        if (onDelete) onDelete(id);
      } catch (e) {
        console.error('Error deleting document:', e);
      }
    },
    [db, onDelete]
  );

  const handleFilesAdded = React.useCallback(
    async (files: File[], id?: string) => {
      const targetId = id || document?._id;
      if (!targetId) return;

      try {
        const doc = await db.get(targetId);
        const updatedDoc = { ...doc } as ImageDocument;

        files.forEach((file, index) => {
          const fileKey = `v${Date.now()}-${index}`;
          if (!updatedDoc._files) updatedDoc._files = {};
          updatedDoc._files[fileKey] = file;
          if (!updatedDoc.versions) updatedDoc.versions = [];
          updatedDoc.versions.push({ id: fileKey, created: Date.now() });
          updatedDoc.currentVersion = updatedDoc.versions.length - 1;
        });

        await db.put(updatedDoc);
        const refreshed = await db.get(targetId);
        setImageGenDocument(refreshed as unknown as ImageDocument);
      } catch (e) {
        console.error('Error adding files:', e);
      }
    },
    [db, document]
  );

  function renderContent() {
    if (debug) {
      console.log('[ImgGen Debug] Render state:', {
        mode,
        document: document?._id,
        loading,
        error: error?.message,
        currentEditedPrompt: currentEditedPrompt || null,
        imageData: !!imageData,
      });
    }

    switch (mode) {
      case 'placeholder': {
        return (
          <ImgGenUploadWaiting
            className={className}
            classes={classes}
            debug={debug}
            database={database}
            onDocumentCreated={onDocumentCreated}
            onPromptSubmit={(newPrompt: string) => {
              if (debug) {
                console.log('[ImgGenCore] Prompt submitted from initial view:', newPrompt);
              }
              setCurrentEditedPrompt(newPrompt);
              setGenerationId(uuid());
            }}
          />
        );
      }

      case 'uploadWaiting': {
        if (!document || !document._id) {
          return <ImgGenPromptWaiting className={className} classes={classes} />;
        }

        if (loading) {
          const displayPrompt = currentEditedPrompt || prompt;
          return (
            <ImgGenDisplayPlaceholder
              prompt={displayPrompt || ''}
              loading={loading}
              progress={progress}
              error={error}
              className={className}
              classes={classes}
            />
          );
        }

        return (
          <>
            <ImgGenUploadWaiting
              document={document}
              className={className}
              classes={classes}
              debug={debug}
              database={database}
              onFilesAdded={handleFilesAdded}
              onPromptSubmit={(newPrompt: string, docId?: string) => {
                const targetDocId = docId || (document && document._id);

                if (debug) {
                  console.log('[ImgGenCore] Prompt submitted for existing uploads:', newPrompt);
                  console.log('[ImgGenCore] Using document ID:', targetDocId);
                }

                if (targetDocId) {
                  handlePromptEdit(targetDocId, newPrompt);
                }
              }}
            />
          </>
        );
      }

      case 'generating': {
        let displayPrompt = currentEditedPrompt || prompt;

        if (
          !displayPrompt &&
          document &&
          'prompt' in document &&
          typeof document.prompt === 'string'
        ) {
          displayPrompt = document.prompt;
        }

        if (debug) {
          console.log('[ImgGen Debug] Generating state prompt sources:', {
            currentEditedPrompt: currentEditedPrompt || null,
            propPrompt: prompt || null,
            documentPrompt: document?.prompt || null,
            finalDisplayPrompt: displayPrompt || null,
          });
        }

        return (
          <ImgGenDisplayPlaceholder
            prompt={displayPrompt || ''}
            loading={loading}
            progress={progress}
            error={error}
            className={className}
            classes={classes}
          />
        );
      }

      case 'display': {
        if (!document || !document._id) {
          return <ImgGenError message="Missing document" />;
        }

        return (
          <>
            <ImgGenDisplay
              document={document as ImageDocument & { _id: string }}
              loading={loading}
              progress={progress}
              onPromptEdit={handlePromptEdit}
              onDelete={handleDelete}
              onRegen={handleRegen}
              alt={alt || ''}
              className={className}
              classes={classes}
              debug={debug}
              error={error}
            />
          </>
        );
      }

      case 'error': {
        return <ImgGenError message={error ? error.message : 'Unknown error'} className={className} />;
      }

      default: {
        return <ImgGenError message="Unknown state" />;
      }
    }
  }

  return renderContent();
}

