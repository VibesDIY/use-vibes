import * as React from 'react';
import { combineClasses, defaultClasses, ImgGenClasses } from '../../../utils/style-utils';
import { DeleteConfirmationOverlay } from './DeleteConfirmationOverlay';

interface ImageOverlayProps {
  promptText: string;
  editedPrompt: string | null; // null means not in edit mode
  // eslint-disable-next-line no-unused-vars
  setEditedPrompt: (prompt: string | null) => void; // Set to null to exit edit mode
  // eslint-disable-next-line no-unused-vars
  handlePromptEdit: (prompt: string) => void;
  /** Toggle state of delete confirmation */
  toggleDeleteConfirm: () => void;
  /** Current state of delete confirmation */
  isDeleteConfirmOpen: boolean;
  handleDeleteConfirm: () => void;
  handleCancelDelete: () => void;
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
  /** Enable the delete controls (only true in fullscreen modal) */
  enableDelete?: boolean;
}

export function ImageOverlay({
  promptText,
  editedPrompt,
  setEditedPrompt,
  handlePromptEdit,
  toggleDeleteConfirm,
  isDeleteConfirmOpen,
  handleDeleteConfirm,
  handleCancelDelete,
  handlePrevVersion,
  handleNextVersion,
  handleRefresh,
  versionIndex,
  totalVersions,
  classes = defaultClasses,
  showControls = true,
  statusText,
  enableDelete = true,
}: ImageOverlayProps) {
  if (isDeleteConfirmOpen && enableDelete) {
    return (
      <div className={combineClasses('imggen-overlay', classes.overlay)}>
        <DeleteConfirmationOverlay
          handleDeleteConfirm={handleDeleteConfirm}
          handleCancelDelete={handleCancelDelete}
        />
      </div>
    );
  }

  // Normal overlay content
  return (
    <div className={combineClasses('imggen-overlay', classes.overlay)}>
      {/* Top row with prompt only */}
      <div className="imggen-top-line">
        <div className={combineClasses('imggen-prompt', classes.prompt)}>
          {editedPrompt !== null ? (
            <input
              type="text"
              value={editedPrompt}
              onChange={(e) => setEditedPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handlePromptEdit(editedPrompt);
                } else if (e.key === 'Escape') {
                  setEditedPrompt(null); // Exit edit mode
                }
              }}
              onBlur={() => setEditedPrompt(null)} // Exit edit mode
              autoFocus
              className="imggen-prompt-input imggen-edit-mode"
              aria-label="Edit prompt"
            />
          ) : (
            <div
              onClick={(e) => {
                if (e.detail === 2) {
                  setEditedPrompt(promptText);
                }
              }}
              className="imggen-prompt-text imggen-truncate"
              title="Double-click to edit prompt"
            >
              {promptText}
            </div>
          )}
        </div>
      </div>

      {/* Bottom row with controls or status */}
      <div className={combineClasses('imggen-controls', classes.controls)}>
        {showControls ? (
          <>
            {/* Left side: Delete button */}
            {enableDelete && (
              <div>
                <button
                  aria-label="Delete image"
                  onClick={toggleDeleteConfirm}
                  className={combineClasses('imggen-delete-button', classes.button)}
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
    </div>
  );
}
