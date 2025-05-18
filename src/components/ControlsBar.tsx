import * as React from 'react';
import { combineClasses, defaultClasses, ImgGenClasses } from '../utils/style-utils';

interface ControlsBarProps {
  /** Toggle state of delete confirmation */
  toggleDeleteConfirm: () => void;
  handlePrevVersion: () => void;
  handleNextVersion: () => void;
  handleRefresh: () => void;
  versionIndex: number;
  totalVersions: number;
  /** Custom CSS classes for styling component parts */
  classes?: ImgGenClasses;
  /** Show control buttons (defaults to true) */
  showControls?: boolean;
  /** Optional status text to display (e.g. "Generating...") */
  statusText?: string;
  /** Whether this overlay is inside the fullscreen modal (enables delete) */
  insideModal?: boolean;
  /** Edited prompt for highlighting refresh button */
  editedPrompt: string | null;
  /** Original prompt text for comparison */
  promptText: string;
  /** Progress value for generation (0-100), shows progress bar when < 100 */
  progress?: number;
}

/**
 * ControlsBar component - Displays controls for deleting, navigating between versions, and refreshing
 */
export function ControlsBar({
  toggleDeleteConfirm,
  handlePrevVersion,
  handleNextVersion,
  handleRefresh,
  versionIndex,
  totalVersions,
  classes = defaultClasses,
  showControls = true,
  statusText,
  insideModal = true,
  editedPrompt,
  promptText,
  progress = 100,
}: ControlsBarProps) {
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
            zIndex: 20
          }}
        />
      )}
      
      {/* Bottom row with controls or status */}
      <div className={combineClasses('imggen-controls', classes.controls)}>
        {showControls ? (
          <>
            {/* Left side: Delete button */}
            {insideModal && (
              <div>
                <button
                  aria-label="Delete image"
                  onClick={toggleDeleteConfirm}
                  className={combineClasses('imggen-button imggen-delete-button', classes.button)}
                >
                  ✕
                </button>
              </div>
            )}

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
                <span className="imggen-version-indicator version-indicator" aria-live="polite">
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

              {/* Refresh button - always visible */}
              <button
                aria-label="Generate new version"
                onClick={handleRefresh}
                className={combineClasses(
                  'imggen-button',
                  classes.button,
                  editedPrompt !== null && editedPrompt.trim() !== promptText ? 'imggen-button-highlight' : ''
                )}
              >
                ⟳
              </button>
            </div>
          </>
        ) : statusText ? (
          // Status text centered when controls are hidden
          <div className="imggen-status-text">{statusText}</div>
        ) : null}
      </div>
    </>
  );
}
