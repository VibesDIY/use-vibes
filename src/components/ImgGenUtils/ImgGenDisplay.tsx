import * as React from 'react';
import { ImgFile } from 'use-fireproof';
import { ImgGenError } from './ImgGenError';
import { ImgGenDisplayProps } from './types';
import { getCurrentFileKey, getPromptInfo, getVersionInfo } from './ImgGenDisplayUtils';
import { DeleteConfirmationOverlay } from './overlays/DeleteConfirmationOverlay';
import { ImageOverlay } from './overlays/ImageOverlay';
import { combineClasses, defaultClasses } from '../../utils/style-utils';
import { createPortal } from 'react-dom';

// Component for displaying the generated image
export function ImgGenDisplay({
  document,
  className,
  alt,
  showOverlay = true,
  onDelete,
  onRefresh,
  onPromptEdit,
  classes = defaultClasses,
}: ImgGenDisplayProps) {
  const [isOverlayOpen, setIsOverlayOpen] = React.useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = React.useState(false);

  // Use null to indicate not editing, or string for edit mode
  const [editedPrompt, setEditedPrompt] = React.useState<string | null>(null);

  // Get version information directly at render time
  const { versions, currentVersion } = getVersionInfo(document);

  // Calculate the initial version index based on document state
  const initialVersionIndex = React.useMemo(() => {
    return typeof currentVersion === 'number'
      ? currentVersion
      : versions?.length
        ? versions.length - 1
        : 0;
  }, [currentVersion, versions]);

  // Only track user-selected version index as state
  const [userSelectedIndex, setUserSelectedIndex] = React.useState<number | null>(null);

  // Derive the final version index - use user selection if available, otherwise use the document's current version
  const versionIndex = userSelectedIndex !== null ? userSelectedIndex : initialVersionIndex;

  // Custom setter function that manages user selections
  const setVersionIndex = React.useCallback((index: number) => {
    setUserSelectedIndex(index);
  }, []);

  const fileKey = getCurrentFileKey(document, versionIndex, versions);
  const totalVersions = versions ? versions.length : 0;

  // We now use getPromptInfo directly at render time as a pure function

  // Navigation handlers
  const handlePrevVersion = () => {
    if (versionIndex > 0) {
      setVersionIndex(versionIndex - 1);
      // Exit edit mode when changing versions
      setEditedPrompt(null);
    }
  };

  const handleNextVersion = () => {
    if (versionIndex < totalVersions - 1) {
      setVersionIndex(versionIndex + 1);
      // Exit edit mode when changing versions
      setEditedPrompt(null);
    }
  };

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
    const { currentPrompt } = getPromptInfo(document, versionIndex);

    if (editedPrompt !== null) {
      const newPrompt = editedPrompt.trim();
      if (newPrompt && newPrompt !== currentPrompt) {
        // Persist new prompt; assume backend regenerates
        onPromptEdit?.(document._id, newPrompt);
      } else {
        // No change, just regenerate explicitly
        onRefresh?.(document._id);
      }
    } else {
      // Not in edit mode → regenerate current prompt
      onRefresh?.(document._id);
    }

    setEditedPrompt(null);
  };

  // Handle prompt editing
  const handlePromptEdit = (newPrompt: string) => {
    // Get the current prompt for comparison at the exact time of editing
    const { currentPrompt } = getPromptInfo(document, versionIndex);

    if (onPromptEdit && newPrompt.trim() && newPrompt !== currentPrompt) {
      onPromptEdit(document._id, newPrompt.trim());
    }
    setEditedPrompt(null); // Exit edit mode
  };

  // Determine which file to use - either the versioned file or the legacy 'image' file
  const currentFile =
    fileKey && document._files
      ? (document._files[fileKey] as File)
      : (document._files?.image as File);

  // --- Fullscreen backdrop state (simple) ---
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const openFullscreen = () => {
    setIsFullscreen(true);
  };
  const closeFullscreen = () => setIsFullscreen(false);

  // Get prompt text early (moved before portal)
  const promptInfo = getPromptInfo(document, versionIndex);
  const promptText = promptInfo.currentPrompt || alt || 'Generated image';

  // Build portal element for fullscreen backdrop
  const fullscreenBackdrop = isFullscreen
    ? createPortal(
        <div className="imggen-backdrop" onClick={closeFullscreen} role="presentation">
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
              handleDelete={toggleDeleteConfirm}
              handlePrevVersion={handlePrevVersion}
              handleNextVersion={handleNextVersion}
              handleRefresh={handleRefresh}
              versionIndex={versionIndex}
              totalVersions={totalVersions}
              classes={classes}
            />
          </figure>
        </div>,
        globalThis.document.body
      )
    : null;

  // Handle Escape key to close fullscreen
  React.useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeFullscreen();
      }
    };
    if (isFullscreen) {
      window.addEventListener('keydown', handleEsc);
      return () => window.removeEventListener('keydown', handleEsc);
    }
  }, [isFullscreen]);

  if (!document._files || (!fileKey && !document._files.image)) {
    return <ImgGenError message="Missing image file" />;
  }

  return (
    <div className={combineClasses('imggen-root', className, classes.root)} title={promptText}>
      <ImgFile
        file={currentFile}
        className={combineClasses('imggen-image', classes.image)}
        alt={alt || 'Generated image'}
        style={{ width: '100%', cursor: 'pointer' }}
        onClick={openFullscreen}
      />

      {/* Image Overlay - shows prompt and controls */}
      {isOverlayOpen && showOverlay && (
        <ImageOverlay
          promptText={promptText}
          editedPrompt={editedPrompt}
          setEditedPrompt={setEditedPrompt}
          handlePromptEdit={handlePromptEdit}
          handleDelete={toggleDeleteConfirm}
          handlePrevVersion={handlePrevVersion}
          handleNextVersion={handleNextVersion}
          handleRefresh={handleRefresh}
          versionIndex={versionIndex}
          totalVersions={totalVersions}
          classes={classes}
        />
      )}

      {/* Delete confirmation overlay */}
      {isDeleteConfirmOpen && (
        <DeleteConfirmationOverlay
          handleDeleteConfirm={handleDeleteConfirm}
          handleCancelDelete={handleCancelDelete}
        />
      )}

      {fullscreenBackdrop}
    </div>
  );
}
