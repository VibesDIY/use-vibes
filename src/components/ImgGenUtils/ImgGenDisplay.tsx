import * as React from 'react';
import { ImgFile } from 'use-fireproof';
import { ImgGenError } from './ImgGenError';
import { ImgGenDisplayProps } from './types';
import { combineClasses, defaultClasses } from '../../utils/style-utils';
import { getCurrentFileKey, getPromptInfo, getVersionInfo } from './ImgGenDisplayUtils';
import { ImgGenModal } from './ImgGenModal';

// Component for displaying the generated image
export function ImgGenDisplay({
  document,
  className,
  alt,
  onDelete,
  onRegen,
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
  
  // Track previous version count to detect when new versions are added
  const prevVersionsCountRef = React.useRef(versions.length);
  
  // Set flash effect when new version is added
  React.useEffect(() => {
    // If we have more versions than before, it means a new version was added
    if (versions.length > prevVersionsCountRef.current) {
      // Trigger the flash effect
      setVersionFlash(true);
      
      // Auto-reset flash after animation completes
      const timer = setTimeout(() => {
        setVersionFlash(false);
      }, 2000); // Match the animation duration in CSS
      
      return () => clearTimeout(timer);
    }
    
    // Update ref for next comparison
    prevVersionsCountRef.current = versions.length;
  }, [versions.length]);

  // Only track user-selected version index as state
  const [userSelectedIndex, setUserSelectedIndex] = React.useState<number | null>(null);
  
  // Track when a new version has been added to enable flash effect
  const [versionFlash, setVersionFlash] = React.useState(false);
  
  // Explicitly track regeneration state
  const [isRegeneratingState, setIsRegeneratingState] = React.useState(false);

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

  // ESC handling moved to ImgGenModal component

  // Determine which file to use - either the versioned file or the legacy 'image' file
  const currentFile: File | undefined =
    fileKey && document._files
      ? (document._files[fileKey] as File)
      : (document._files?.image as File);

  // Get prompt text early (moved before portal)
  const promptInfo = getPromptInfo(document, versionIndex);
  const promptText = promptInfo.currentPrompt || alt || 'Generated image';

  // State for delete confirmation is managed directly

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
  function handleRegen() {
    console.log(`[ImgGenDisplay] handleRegen called, starting regeneration...`);
    
    // Set regenerating state to true when starting regeneration
    setIsRegeneratingState(true);
    
    const { currentPrompt } = getPromptInfo(document, versionIndex);

    if (editedPrompt !== null) {
      const newPrompt = editedPrompt.trim();
      if (newPrompt && newPrompt !== currentPrompt) {
        // Persist new prompt; assume backend regenerates
        onPromptEdit?.(document._id, newPrompt);
      } else {
        // No change, just regenerate explicitly
        onRegen?.(document._id);
      }
    } else {
      // Not in edit mode → regenerate current prompt
      onRegen?.(document._id);
    }

    // Reset user selection when generating a new version
    // This will make the display automatically switch to the latest version when it returns
    setUserSelectedIndex(null);
    
    setEditedPrompt(null);
    
    // Reset regenerating state after a short delay to simulate processing time
    // In a real implementation, this would be reset when the new image arrives
    setTimeout(() => {
      setIsRegeneratingState(false);
      console.log('[ImgGenDisplay] Regeneration completed');
    }, 2000); // 2 seconds to match the animation duration
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

  // Get progress from document
  const progress: number = (document as { progress?: number }).progress ?? 100;
  
  // Is regeneration in progress - either from progress or our explicit state
  const isRegenerating = progress < 100 || isRegeneratingState;
  
  // Debug logs for regeneration state
  console.log(`[ImgGenDisplay] progress: ${progress}, isRegenerating: ${isRegenerating}, isRegeneratingState: ${isRegeneratingState}`);

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

      {/* Use the new ImgGenModal component */}
      <ImgGenModal
        isOpen={isFullscreen}
        onClose={closeFullscreen}
        currentFile={currentFile}
        alt={alt}
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
        classes={classes}
        versionFlash={versionFlash}
        isRegenerating={isRegenerating}
      />
    </div>
  );
}
