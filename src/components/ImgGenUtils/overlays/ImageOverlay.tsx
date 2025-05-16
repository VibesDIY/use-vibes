import * as React from 'react';
import { combineClasses, defaultClasses, ImgGenClasses } from '../../../utils/style-utils';

interface ImageOverlayProps {
  promptText: string;
  editedPrompt: string | null; // null means not in edit mode
  // eslint-disable-next-line no-unused-vars
  setEditedPrompt: (prompt: string | null) => void; // Set to null to exit edit mode
  // eslint-disable-next-line no-unused-vars
  handlePromptEdit: (prompt: string) => void;
  toggleOverlay: () => void;
  handlePrevVersion: () => void;
  handleNextVersion: () => void;
  handleRefresh: () => void;
  versionIndex: number;
  totalVersions: number;
  /** Custom CSS classes for styling component parts */
  classes?: ImgGenClasses;
}

export function ImageOverlay({
  promptText,
  editedPrompt,
  setEditedPrompt,
  handlePromptEdit,
  toggleOverlay,
  handlePrevVersion,
  handleNextVersion,
  handleRefresh,
  versionIndex,
  totalVersions,
  classes = defaultClasses,
}: ImageOverlayProps) {
  return (
    <div className={combineClasses('imggen-overlay', classes.overlay)}>
      {/* Two row layout with prompt on top and controls below */}
      <div className="imggen-controls">
        {/* Prompt text on top row - double-clickable for editing */}
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
              className="imggen-prompt-input"
              aria-label="Edit prompt"
            />
          ) : (
            <div
              onClick={(e) => {
                // Handle both single and double click
                if (e.detail === 2) {
                  console.log('Double click detected on prompt: ', promptText);
                  // Enter edit mode with current text
                  setEditedPrompt(promptText);
                }
              }}
              className="imggen-prompt-text imggen-truncate"
              title="Double-click to edit prompt"
            >
              {/* Display prompt from either new structure or legacy field */}
              {promptText}
            </div>
          )}
        </div>

        {/* Controls on bottom row */}
        <div className={combineClasses('imggen-controls', classes.controls)}>
          {/* Left side: Info button */}
          <button
            aria-label="Close info panel"
            onClick={toggleOverlay}
            className={combineClasses('imggen-info-button', classes.button)}
            style={{ color: 'var(--imggen-text-color)' }}
          >
            ⓘ
          </button>

          {/* Right side: Version controls */}
          <div className="imggen-control-group">
            {/* Show version arrows only when there are multiple versions */}
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
            <span
              className="imggen-version-indicator version-indicator"
              aria-live="polite"
            >
              {versionIndex + 1} / {totalVersions}
            </span>

            {/* Show version arrows only when there are multiple versions */}
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
              className={combineClasses('imggen-button', classes.button)}
            >
              ⟳
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
