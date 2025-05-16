import * as React from 'react';
import { ImgFile } from 'use-fireproof';
import { ImgGenError } from './ImgGenError';
import { ImgGenDisplayProps } from './types';
import { getCurrentFileKey, getPromptInfo, getVersionInfo } from './ImgGenDisplayUtils';
import { DeleteConfirmationOverlay } from './overlays/DeleteConfirmationOverlay';
import { ImageOverlay } from './overlays/ImageOverlay';

// Component for displaying the generated image
export function ImgGenDisplay({
  document,
  className,
  alt,
  showOverlay = true,
  onDelete,
  onRefresh,
  onPromptEdit,
}: ImgGenDisplayProps) {
  const [isOverlayOpen, setIsOverlayOpen] = React.useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = React.useState(false);
  const [isEditingPrompt, setIsEditingPrompt] = React.useState(false);

  const { versions, currentVersion } = getVersionInfo(document);
  const [versionIndex, setVersionIndex] = React.useState(currentVersion);
  
  // Get the prompt specific to the current version
  const { currentPrompt } = getPromptInfo(document, versionIndex);
  const [editedPrompt, setEditedPrompt] = React.useState(currentPrompt || '');

  // Update versionIndex when the document changes and has new versions
  React.useEffect(() => {
    // Get the latest version information
    const { versions: newVersions, currentVersion: newCurrentVersion } = getVersionInfo(document);

    // If the document has been updated with a new version, show the latest
    if (newVersions?.length > 0) {
      // Use the document's current version if available, otherwise show the last version
      const latestVersionIndex =
        typeof newCurrentVersion === 'number' ? newCurrentVersion : newVersions.length - 1;

      setVersionIndex(latestVersionIndex);
    }
  }, [document, document?._id, document?.versions?.length]);

  const fileKey = getCurrentFileKey(document, versionIndex, versions);
  const totalVersions = versions ? versions.length : 0;

  // Navigation handlers
  const handlePrevVersion = () => {
    if (versionIndex > 0) {
      console.log(`Switching to previous version: ${versionIndex} → ${versionIndex - 1}`);
      setVersionIndex(versionIndex - 1);
      // Reset editing state when changing versions
      setIsEditingPrompt(false);
    }
  };

  const handleNextVersion = () => {
    if (versionIndex < totalVersions - 1) {
      console.log(`Switching to next version: ${versionIndex} → ${versionIndex + 1}`);
      setVersionIndex(versionIndex + 1);
      // Reset editing state when changing versions
      setIsEditingPrompt(false);
    }
  };
  
  // Update editedPrompt when versionIndex changes
  React.useEffect(() => {
    // Get the prompt for the current version
    const { currentPrompt } = getPromptInfo(document, versionIndex);
    if (currentPrompt) {
      setEditedPrompt(currentPrompt);
    }
  }, [document, versionIndex]);

  // Keyboard handler for escape key only
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOverlayOpen) return;

      if (e.key === 'Escape') {
        if (isDeleteConfirmOpen) {
          handleCancelDelete();
        } else {
          toggleOverlay();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOverlayOpen, isDeleteConfirmOpen]);

  // Toggle overlay visibility
  const toggleOverlay = () => {
    setIsOverlayOpen(!isOverlayOpen);
  };

  // Toggle delete confirmation
  const toggleDeleteConfirm = () => {
    setIsDeleteConfirmOpen(!isDeleteConfirmOpen);
  };

  // Handle delete confirmation
  const handleDeleteConfirm = () => {
    if (onDelete) {
      onDelete(document._id);
    }
    setIsDeleteConfirmOpen(false);
  };

  // Handle cancel delete
  const handleCancelDelete = () => {
    setIsDeleteConfirmOpen(false);
  };

  // Handle generating a new version
  const handleRefresh = () => {
    // Get the prompt for the current version and use it for regeneration
    const { currentPrompt } = getPromptInfo(document, versionIndex);
    
    // If we have an onPromptEdit callback, use it to update the prompt
    // This ensures that regeneration uses the prompt from the currently displayed version
    if (onPromptEdit && currentPrompt) {
      onPromptEdit(document._id, currentPrompt);
    }
    // Fall back to standard refresh if needed
    else if (onRefresh) {
      onRefresh(document._id);
    }
  };

  // Handle prompt editing
  const handlePromptEdit = (newPrompt: string) => {
    if (onPromptEdit && newPrompt.trim() && newPrompt !== currentPrompt) {
      onPromptEdit(document._id, newPrompt.trim());
    }
    setIsEditingPrompt(false);
  };

  if (!document._files || (!fileKey && !document._files.image)) {
    return <ImgGenError message="Missing image file" />;
  }

  // The prompt might be stored in the document itself
  const promptText = currentPrompt || alt || 'Generated image';

  // Determine which file to use - either the versioned file or the legacy 'image' file
  const currentFile =
    fileKey && document._files
      ? (document._files[fileKey] as File)
      : (document._files?.image as File);

  return (
    <div
      className="img-gen-container"
      style={{
        position: 'relative',
        maxWidth: '100%',
        borderRadius: '8px',
        overflow: 'hidden',
      }}
    >
      <ImgFile
        file={currentFile}
        className={`img-gen-image ${className || ''}`.trim()}
        alt={alt || 'Generated image'}
        style={{
          width: '100%',
          height: 'auto',
          display: 'block',
          borderRadius: '8px',
        }}
      />

      {/* Info button - visible when overlay is closed and showOverlay is true */}
      {!isOverlayOpen && showOverlay && (
        <button
          aria-label="Image information"
          onClick={toggleOverlay}
          style={{
            position: 'absolute',
            bottom: '10px',
            left: '10px',
            background: 'none',
            border: 'none',
            fontSize: '24px',
            color: '#fff',
            opacity: 0.5,
            cursor: 'pointer',
            padding: 0,
            transition: 'opacity 0.2s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.5')}
        >
          ⓘ
        </button>
      )}

      {/* Delete button - visible when the overlay is open */}
      {isOverlayOpen && (
        <button
          aria-label="Delete image"
          onClick={toggleDeleteConfirm}
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            zIndex: 20,
            backgroundColor: 'rgba(255, 255, 255, 0.7)',
            borderRadius: '50%',
            width: '30px',
            height: '30px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            border: 'none',
            fontSize: '16px',
            opacity: 0.5,
            transition: 'opacity 0.2s ease',
            padding: 0,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.5')}
        >
          ✕
        </button>
      )}

      {/* Image Overlay - shows prompt and controls */}
      {isOverlayOpen && showOverlay && (
        <ImageOverlay
          promptText={promptText}
          isEditingPrompt={isEditingPrompt}
          editedPrompt={editedPrompt}
          setEditedPrompt={setEditedPrompt}
          setIsEditingPrompt={setIsEditingPrompt}
          handlePromptEdit={handlePromptEdit}
          toggleOverlay={toggleOverlay}
          handlePrevVersion={handlePrevVersion}
          handleNextVersion={handleNextVersion}
          handleRefresh={handleRefresh}
          versionIndex={versionIndex}
          totalVersions={totalVersions}
          versions={versions}
        />
      )}

      {/* Delete confirmation overlay */}
      {isDeleteConfirmOpen && (
        <DeleteConfirmationOverlay
          handleDeleteConfirm={handleDeleteConfirm}
          handleCancelDelete={handleCancelDelete}
        />
      )}
    </div>
  );
}
