import * as React from 'react';
import { ImgFile } from 'use-fireproof';
import { createPortal } from 'react-dom';
import { ImageOverlay } from './overlays/ImageOverlay';
import { ImgGenError } from './ImgGenError';
import { defaultClasses } from '../../utils/style-utils';
import { ImageDocument } from '../../hooks/image-gen/types';

export interface ImgGenModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentFile: File | undefined; // File object
  alt?: string;
  promptText: string;
  editedPrompt: string | null;
  document?: Partial<ImageDocument> & { _id?: string }; // Document containing image metadata
  // eslint-disable-next-line no-unused-vars
  setEditedPrompt: (_editedPrompt: string | null) => void;
  // eslint-disable-next-line no-unused-vars
  handlePromptEdit: (_newPrompt: string) => void;
  handleDeleteConfirm: () => void;
  handlePrevVersion: () => void;
  handleNextVersion: () => void;
  handleRegen: () => void;
  versionIndex: number;
  totalVersions: number;
  progress: number;
  /** Whether to show a flash effect on the version indicator - used when a new version is added */
  versionFlash?: boolean;
  isRegenerating?: boolean;
  /** Error if image generation failed */
  error?: Error | null;
  classes?: {
    root?: string;
    image?: string;
    controls?: string;
    overlay?: string;
    modal?: string;
  };
}

export function ImgGenModal({
  isOpen,
  onClose,
  currentFile,
  alt,
  promptText,
  editedPrompt,
  document,
  setEditedPrompt,
  handlePromptEdit,
  handleDeleteConfirm,
  handlePrevVersion,
  handleNextVersion,
  handleRegen,
  versionIndex,
  totalVersions,
  progress,
  versionFlash = false,
  isRegenerating = false,
  error = null,
  classes = defaultClasses,
}: ImgGenModalProps) {
  // Log when modal opens or changes content
  React.useEffect(() => {
    if (isOpen) {
      // Log simple summary info
      console.log('[ImgGenModal] Modal opened or updated:', { 
        hasFile: !!currentFile, 
        fileName: currentFile?.name,
        fileSize: currentFile?.size,
        fileType: currentFile?.type,
        promptText,
        editedPrompt,
        versionIndex,
        totalVersions,
        hasError: !!error,
        errorMessage: error?.message
      });
      
      // Log the plain old whole document as requested
      if (document) {
        console.log('[ImgGenModal] Full document:', document);
      }
    }
  }, [isOpen, currentFile, promptText, editedPrompt, versionIndex, error, document]);
  
  // ESC handling while modal is open
  React.useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleEsc);
      return () => window.removeEventListener('keydown', handleEsc);
    }
  }, [isOpen, onClose]);

  if (!isOpen || !currentFile) {
    return null;
  }

  // Determine what prompt to show in the modal
  // This looks redundant but it's added for the logging - removing this would
  // make the debugging more difficult
  const effectivePromptText = promptText;

  return createPortal(
    <div className="imggen-backdrop" onClick={onClose} role="presentation">
      <figure className="imggen-full-wrapper" onClick={(e) => e.stopPropagation()}>
        {error ? (
          <div className="imggen-backdrop-error">
            <ImgGenError message={error.message} />
          </div>
        ) : (
          <ImgFile
            file={currentFile}
            className="imggen-backdrop-image"
            alt={alt || 'Generated image'}
          />
        )}
        {/* Overlay as caption */}
        <ImageOverlay
          promptText={effectivePromptText}
          editedPrompt={editedPrompt}
          setEditedPrompt={setEditedPrompt}
          handlePromptEdit={handlePromptEdit}
          handleDeleteConfirm={handleDeleteConfirm}
          handlePrevVersion={handlePrevVersion}
          handleNextVersion={handleNextVersion}
          handleRegen={handleRegen}
          versionIndex={versionIndex}
          totalVersions={totalVersions}
          progress={progress}
          versionFlash={versionFlash}
          isRegenerating={isRegenerating}
          classes={classes}
          showDelete={true}
        />
      </figure>
    </div>,
    globalThis.document.body
  );
}
