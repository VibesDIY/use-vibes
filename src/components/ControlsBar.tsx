import * as React from 'react';
import { combineClasses, defaultClasses, ImgGenClasses } from '../utils/style-utils';

interface ControlsBarProps {
  /** Handle delete confirmation */
  handleDeleteConfirm: () => void;
  handlePrevVersion: () => void;
  handleNextVersion: () => void;
  handleRegen: () => void;
  versionIndex: number;
  totalVersions: number;
  /** Custom CSS classes for styling component parts */
  classes?: ImgGenClasses;
  /** Show control buttons (defaults to true) */
  showControls?: boolean;
  /** Edited prompt for highlighting regenerate button */
  editedPrompt: string | null;
  /** Original prompt text for comparison */
  promptText: string;
  /** Progress value for generation (0-100), shows progress bar when < 100 */
  progress?: number;
  /** Show delete button (defaults to true) */
  showDelete?: boolean;
  /** Whether delete confirmation is being shown */
  isDeleteConfirmOpen?: boolean;
  /** Whether to flash the version indicator when a new version is added */
  versionFlash?: boolean;
  /** Whether the regeneration is currently in progress */
  isRegenerating?: boolean;
}

/**
 * ControlsBar component - Displays controls for deleting, navigating between versions, and regenerating
 */
export function ControlsBar({
  handleDeleteConfirm,
  handlePrevVersion,
  handleNextVersion,
  handleRegen,
  versionIndex,
  totalVersions,
  classes = defaultClasses,
  showControls = true,
  editedPrompt,
  promptText,
  progress = 100,
  showDelete = true,
  isDeleteConfirmOpen = false,
  versionFlash = false,
  isRegenerating = false,
}: ControlsBarProps) {
  // State for managing delete confirmation
  const [showConfirmation, setShowConfirmation] = React.useState(false);

  // Timer ref for automatic cancellation
  const cancelTimerRef = React.useRef<number | null>(null);

  // Use external state if provided
  const isConfirming = isDeleteConfirmOpen || showConfirmation;

  // Handle delete click
  const onDeleteClick = () => {
    if (isConfirming) {
      // User clicked delete while confirmation is showing - confirm the delete
      handleDeleteConfirm();
      setShowConfirmation(false);
      if (cancelTimerRef.current) {
        window.clearTimeout(cancelTimerRef.current);
        cancelTimerRef.current = null;
      }
    } else {
      // Show confirmation
      setShowConfirmation(true);

      // Set timer to auto-hide confirmation after 3 seconds
      cancelTimerRef.current = window.setTimeout(() => {
        setShowConfirmation(false);
      }, 3000);
    }
  };

  // Clean up timer on unmount
  React.useEffect(() => {
    return () => {
      if (cancelTimerRef.current) {
        window.clearTimeout(cancelTimerRef.current);
      }
    };
  }, []);

  return (
    <>
      {/* Progress bar for generation progress - explicitly positioned at the top */}
      {progress < 100 && (
        <div
          className="imggen-progress"
          style={{
            width: `${progress}%`,
            position: 'absolute',
            top: 0,
            left: 0,
            height: 'var(--imggen-progress-height)',
            zIndex: 20,
          }}
        />
      )}

      {/* Bottom row with controls or status */}
      <div className={combineClasses('imggen-controls', classes.controls)}>
        {showControls ? (
          <>
            {/* Left side: Delete button */}
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flex: 1 }}>
              {showDelete && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    aria-label="Delete image"
                    onClick={onDeleteClick}
                    className={combineClasses('imggen-button imggen-delete-button', classes.button)}
                    style={{
                      position: 'static',
                      width: 'var(--imggen-button-size)',
                      height: 'var(--imggen-button-size)',
                      backgroundColor: isConfirming ? 'var(--imggen-error-border)' : undefined,
                      color: isConfirming ? 'white' : undefined,
                      opacity: isConfirming ? 1 : undefined,
                    }}
                  >
                    ✕
                  </button>
                  {isConfirming && (
                    <span
                      style={{
                        fontSize: 'var(--imggen-font-size)',
                        fontWeight: 'bold',
                        fontStyle: 'italic',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Confirm delete, are you sure?
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Right side: Version controls */}
            <div className="imggen-control-group">
              {/* Previous version button - only when multiple versions */}
              {totalVersions > 1 && (
                <button
                  aria-label="Previous version"
                  disabled={versionIndex === 0}
                  onClick={handlePrevVersion}
                  className={combineClasses('imggen-button', classes.button)}
                >
                  ◀︎
                </button>
              )}

              {/* Version indicator - only display if we have versions */}
              {totalVersions > 1 && (
                <span
                  className={`imggen-version-indicator version-indicator ${versionFlash ? 'imggen-version-flash' : ''}`}
                  aria-live="polite"
                >
                  {versionIndex + 1} / {totalVersions}
                </span>
              )}

              {/* Next version button - only when multiple versions */}
              {totalVersions > 1 && (
                <button
                  aria-label="Next version"
                  disabled={versionIndex >= totalVersions - 1}
                  onClick={handleNextVersion}
                  className={combineClasses('imggen-button', classes.button)}
                >
                  ▶︎
                </button>
              )}

              {/* Regenerate button - always visible */}
              {/* Debug logs moved to useEffect */}
              <button
                aria-label="Regenerate image"
                onClick={() => {
                  handleRegen();
                }}
                disabled={isRegenerating}
                className={combineClasses(
                  'imggen-button',
                  classes.button,
                  editedPrompt !== null && editedPrompt.trim() !== promptText
                    ? 'imggen-button-highlight'
                    : '',
                  isRegenerating ? 'imggen-button-disabled' : ''
                )}
              >
                <span className={isRegenerating ? 'imggen-regen-spinning' : ''}>⟳</span>
              </button>
            </div>
          </>
        ) : progress < 100 ? (
          <div className="imggen-status-text">Generating...</div>
        ) : null}
      </div>
    </>
  );
}
