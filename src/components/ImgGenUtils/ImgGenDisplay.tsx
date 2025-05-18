import * as React from 'react';
import { ImgFile } from 'use-fireproof';
import { ImgGenError } from './ImgGenError';
import { ImgGenDisplayProps } from './types';
import { combineClasses, defaultClasses } from '../../utils/style-utils';
import { createPortal } from 'react-dom';
import { getCurrentFileKey, getPromptInfo, getVersionInfo } from './ImgGenDisplayUtils';
import { ImageOverlay } from './overlays/ImageOverlay';

// Component for displaying the generated image
export function ImgGenDisplay({
  document,
  className,
  alt,
  onDelete,
  onRefresh,
  onPromptEdit,
  classes = defaultClasses,
}: ImgGenDisplayProps) {
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = React.useState(false);

  // Use null to indicate not editing, or string for edit mode
  const [editedPrompt, setEditedPrompt] = React.useState<string | null>(null);

  // --- Fullscreen backdrop state ---
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const openFullscreen = () => setIsFullscreen(true);
  const closeFullscreen = () => setIsFullscreen(false);

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
  function handlePrevVersion() {
    if (versionIndex > 0) {
      setVersionIndex(versionIndex - 1);
      // Exit edit mode when changing versions
      setEditedPrompt(null);
    }
  }

  function handleNextVersion() {
    if (versionIndex < totalVersions - 1) {
      setVersionIndex(versionIndex + 1);
      // Exit edit mode when changing versions
      setEditedPrompt(null);
    }
  }

  // ESC handling while fullscreen
  React.useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isDeleteConfirmOpen) {
          handleCancelDelete();
        } else {
          closeFullscreen();
        }
      }
    };
    if (isFullscreen) {
      window.addEventListener('keydown', handleEsc);
      return () => window.removeEventListener('keydown', handleEsc);
    }
  }, [isFullscreen, isDeleteConfirmOpen]);

  // Determine which file to use - either the versioned file or the legacy 'image' file
  const currentFile: File | undefined =
    fileKey && document._files
      ? (document._files[fileKey] as File)
      : (document._files?.image as File);

  // Get prompt text early (moved before portal)
  const promptInfo = getPromptInfo(document, versionIndex);
  const promptText = promptInfo.currentPrompt || alt || 'Generated image';

  // Toggle delete confirmation
  function toggleDeleteConfirm() {
    setIsDeleteConfirmOpen((prev) => !prev);
  }

  // Handle delete confirmation
  function handleDeleteConfirm() {
    if (onDelete) {
      onDelete(document._id);
    }
    setIsDeleteConfirmOpen(false);
  }

  // Handle cancel delete
  function handleCancelDelete() {
    setIsDeleteConfirmOpen(false);
  }

  // Handle generating a new version
  function handleRefresh() {
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
  }

  // Handle prompt editing
  function handlePromptEdit(newPrompt: string) {
    // Get the current prompt for comparison at the exact time of editing
    const { currentPrompt } = getPromptInfo(document, versionIndex);

    if (onPromptEdit && newPrompt.trim() && newPrompt !== currentPrompt) {
      onPromptEdit(document._id, newPrompt.trim());
    }
    setEditedPrompt(null); // Exit edit mode
  }

  // Build portal element for fullscreen backdrop
  const progress: number = (document as { progress?: number }).progress ?? 100;
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
              toggleDeleteConfirm={toggleDeleteConfirm}
              isDeleteConfirmOpen={isDeleteConfirmOpen}
              handleDeleteConfirm={handleDeleteConfirm}
              handleCancelDelete={handleCancelDelete}
              handlePrevVersion={handlePrevVersion}
              handleNextVersion={handleNextVersion}
              handleRefresh={handleRefresh}
              versionIndex={versionIndex}
              totalVersions={totalVersions}
              progress={progress}
              classes={classes}
              enableDelete={true}
            />
          </figure>
        </div>,
        globalThis.document.body
      )
    : null;

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

      {fullscreenBackdrop}
    </div>
  );
}
