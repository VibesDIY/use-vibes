import * as React from 'react';
import { ImgFile } from 'use-fireproof';
import { createPortal } from 'react-dom';
import { ImageOverlay } from './overlays/ImageOverlay';
import { ImgGenError } from './ImgGenError';
import { defaultClasses } from '../../utils/style-utils';

export interface ImgGenModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentFile: File | undefined; // File object
  alt?: string;
  promptText: string;
  editedPrompt: string | null;
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
