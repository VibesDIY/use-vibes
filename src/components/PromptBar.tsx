import * as React from 'react';
import { combineClasses, defaultClasses, ImgGenClasses } from '../utils/style-utils';

interface PromptBarProps {
  promptText: string;
  editedPrompt: string | null; // null means not in edit mode
  // eslint-disable-next-line no-unused-vars
  setEditedPrompt: (prompt: string | null) => void; // Set to null to exit edit mode
  // eslint-disable-next-line no-unused-vars
  handlePromptEdit: (prompt: string) => void;
  /** Custom CSS classes for styling component parts */
  classes?: ImgGenClasses;
}

/**
 * PromptBar component - Displays and allows editing of the prompt text
 */
export function PromptBar({
  promptText,
  editedPrompt,
  setEditedPrompt,
  handlePromptEdit,
  classes = defaultClasses,
}: PromptBarProps) {
  return (
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
  );
}
