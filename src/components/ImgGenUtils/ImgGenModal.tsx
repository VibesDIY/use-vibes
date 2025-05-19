import * as React from 'react';
import { ImgFile } from 'use-fireproof';
import { createPortal } from 'react-dom';
import { ImageOverlay } from './overlays/ImageOverlay';
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
  isDeleteConfirmOpen: boolean;
  handleDeleteConfirm: () => void;
  handleCancelDelete: () => void;
  handlePrevVersion: () => void;
  handleNextVersion: () => void;
  handleRegen: () => void;
  versionIndex: number;
  totalVersions: number;
  progress: number;
  /** Whether to show a flash effect on the version indicator - used when a new version is added */
  versionFlash?: boolean;
  isRegenerating?: boolean;
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
  isDeleteConfirmOpen,
  handleDeleteConfirm,
  handleCancelDelete,
  handlePrevVersion,
  handleNextVersion,
  handleRegen,
  versionIndex,
  totalVersions,
  progress,
  versionFlash = false,
  isRegenerating = false,
  classes = defaultClasses,
}: ImgGenModalProps) {
  // ESC handling while modal is open
  React.useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isDeleteConfirmOpen) {
          handleCancelDelete();
        } else {
          onClose();
        }
      }
    };
    
    if (isOpen) {
      window.addEventListener('keydown', handleEsc);
      return () => window.removeEventListener('keydown', handleEsc);
    }
  }, [isOpen, isDeleteConfirmOpen, handleCancelDelete, onClose]);

  if (!isOpen || !currentFile) {
    return null;
  }

  return createPortal(
    <div className="imggen-backdrop" onClick={onClose} role="presentation">
      <figure className="imggen-full-wrapper" onClick={(e) => e.stopPropagation()}>
        <ImgFile
          file={currentFile}
          className="imggen-backdrop-image"
          alt={alt || 'Generated image'}
        />
        {/* Overlay as caption */}
        <ImageOverlay
          promptText={promptText}
          editedPrompt={editedPrompt}
          setEditedPrompt={setEditedPrompt}
          handlePromptEdit={handlePromptEdit}
          isDeleteConfirmOpen={isDeleteConfirmOpen}
          handleDeleteConfirm={handleDeleteConfirm}
          handleCancelDelete={handleCancelDelete}
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
