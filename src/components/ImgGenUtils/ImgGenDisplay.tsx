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
  loading,
  error,
}: ImgGenDisplayProps) {
  // Delete confirmation is now handled within ControlsBar

  // Use null to indicate not editing, or string for edit mode
  const [editedPrompt, setEditedPrompt] = React.useState<string | null>(null);

  // Track the prompt that's currently being generated
  const [generatingPrompt, setGeneratingPrompt] = React.useState<string | null>(null);

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

  // Explicitly track regeneration state while waiting for progress to update
  const [pendingRegeneration, setPendingRegeneration] = React.useState(false);

  // Keep track of pending regeneration requests
  const pendingRegenerationRef = React.useRef<boolean>(false);

  // Track simulated progress for regeneration
  const [simulatedProgress, setSimulatedProgress] = React.useState<number | null>(null);
  const progressTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

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
  }

  // Handle generating a new version
  function handleRegen() {
    // Set pending regeneration flag
    setPendingRegeneration(true);
    pendingRegenerationRef.current = true;

    // Reset and start simulated progress
    setSimulatedProgress(0);

    // Clear any existing timer
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }

    // Create a new progress timer that simulates progress from 0 to 99
    const timer = setInterval(() => {
      setSimulatedProgress((prev) => {
        const current = prev ?? 0;
        // Asymptotically approach 99%
        const next = current + (99 - current) * 0.05;
        return next > 99 ? 99 : next;
      });
    }, 500); // Update twice per second for smoother animation

    progressTimerRef.current = timer;

    // const { currentPrompt } = getPromptInfo(document, versionIndex);

    if (editedPrompt !== null) {
      // User has edited the prompt - always use the edited version
      // even if it happens to be the same as the current prompt
      const newPrompt = editedPrompt.trim();
      if (newPrompt) {
        // Always submit the edited prompt as a new prompt
        onPromptEdit?.(document._id, newPrompt);
      } else {
        // Empty prompt, just regenerate with existing prompt
        onRegen?.(document._id);
      }
    } else {
      // Not in edit mode → regenerate current prompt
      onRegen?.(document._id);
    }

    // Reset user selection when generating a new version
    // This will make the display automatically switch to the latest version when it returns
    setUserSelectedIndex(null);

    // Save the prompt we're generating with
    let promptToGenerate = '';
    if (editedPrompt !== null) {
      promptToGenerate = editedPrompt.trim();
    } else {
      const { currentPrompt } = getPromptInfo(document, versionIndex);
      promptToGenerate = currentPrompt;
    }

    setGeneratingPrompt(promptToGenerate);

    // Reset edited prompt since we're no longer in edit mode
    setEditedPrompt(null);
  }

  // Handle prompt editing
  function handlePromptEdit(newPrompt: string) {
    // Get the current prompt for comparison at the exact time of editing
    const { currentPrompt } = getPromptInfo(document, versionIndex);
    const trimmedPrompt = newPrompt.trim();

    if (trimmedPrompt && trimmedPrompt !== currentPrompt) {
      // Set the edited prompt to the new trimmed value
      setEditedPrompt(trimmedPrompt);

      // Now use handleRegen to handle the regeneration process
      // This ensures the regeneration logic is consistent
      handleRegen();
    } else {
      // If the prompt hasn't changed, just exit edit mode
      setEditedPrompt(null);
    }
  }

  // We're not using document.progress as it's always 100
  // Just track the document loading state
  const documentLoading: boolean = (document as { loading?: boolean }).loading ?? false;

  // Reset regeneration state when loading state changes
  React.useEffect(() => {
    if (!documentLoading && pendingRegenerationRef.current) {
      pendingRegenerationRef.current = false;
      setPendingRegeneration(false);

      // Clear the simulated progress timer
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }

      // Set simulated progress to 100% to complete the progress bar
      setSimulatedProgress(100);

      // Then clear it after a short delay to hide the progress bar
      setTimeout(() => {
        setSimulatedProgress(null);
        // Also clear the generating prompt
        setGeneratingPrompt(null);
      }, 500);
    }
  }, [documentLoading]);

  // Additional check for document updates to detect version changes
  const documentIdRef = React.useRef(document?._id);
  const versionsLengthRef = React.useRef(versions?.length || 0);

  React.useEffect(() => {
    // Check if a new version was added (version count increased)
    if (versions?.length > versionsLengthRef.current) {
      pendingRegenerationRef.current = false;
      setPendingRegeneration(false);

      // Clear the simulated progress timer
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }

      // Set simulated progress to 100% to complete the progress bar
      setSimulatedProgress(100);

      // Then clear it after a short delay to hide the progress bar
      setTimeout(() => {
        setSimulatedProgress(null);
      }, 500);
    }

    // Update refs
    versionsLengthRef.current = versions?.length || 0;
    documentIdRef.current = document?._id;
  }, [document?._id, versions?.length]);

  // Clean up timer on unmount
  React.useEffect(() => {
    return () => {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
    };
  }, []);

  // Calculate the effective progress - use simulated progress during regeneration if available
  const effectiveProgress = simulatedProgress ?? 100;

  // Is regeneration in progress - either from loading state or pending state
  const isRegenerating = pendingRegeneration || documentLoading === true || loading === true;

  if (!document._files || (!fileKey && !document._files.image)) {
    return <ImgGenError message="Missing image file" />;
  }

  // Determine which prompt to display:
  // 1. If in edit mode, show the edited prompt
  // 2. If generating, show the generating prompt
  // 3. Otherwise, show the document's prompt
  const displayPrompt =
    editedPrompt !== null
      ? editedPrompt
      : pendingRegeneration && generatingPrompt !== null
        ? generatingPrompt
        : promptText;

  return (
    <div className={combineClasses('imggen-root', className, classes.root)} title={displayPrompt}>
      <div className="imggen-image-container" style={{ position: 'relative', width: '100%' }}>
        <button
          className="imggen-expand-button"
          onClick={openFullscreen}
          title="Expand image"
          aria-label="Expand image"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="24"
            height="24"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15,5 20,5 20,10" />
            <polyline points="9,19 4,19 4,14" />
            <line x1="20" y1="5" x2="14" y2="11" />
            <line x1="4" y1="19" x2="10" y2="13" />
          </svg>
        </button>
        <ImgFile
          file={currentFile}
          className={combineClasses('imggen-image', classes.image)}
          alt={alt || 'Generated image'}
          style={{ width: '100%' }}
        />
      </div>

      {/* Use the new ImgGenModal component */}
      <ImgGenModal
        isOpen={isFullscreen}
        onClose={closeFullscreen}
        currentFile={currentFile}
        alt={alt}
        promptText={displayPrompt}
        editedPrompt={editedPrompt}
        setEditedPrompt={setEditedPrompt}
        handlePromptEdit={handlePromptEdit}
        handleDeleteConfirm={handleDeleteConfirm}
        handlePrevVersion={handlePrevVersion}
        handleNextVersion={handleNextVersion}
        handleRegen={handleRegen}
        versionIndex={versionIndex}
        totalVersions={totalVersions}
        progress={effectiveProgress}
        classes={classes}
        versionFlash={versionFlash}
        isRegenerating={isRegenerating}
        error={error}
      />
    </div>
  );
}
