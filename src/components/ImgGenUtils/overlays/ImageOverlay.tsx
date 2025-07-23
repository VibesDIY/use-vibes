import * as React from 'react';
import { combineClasses, defaultClasses, ImgGenClasses } from '../../../utils/style-utils';
import { PromptBar } from '../../../components/PromptBar';
import { ControlsBar } from '../../../components/ControlsBar';

interface ImageOverlayProps {
  promptText: string;
  editedPrompt: string | null; // null means not in edit mode

  setEditedPrompt: (prompt: string | null) => void; // Set to null to exit edit mode

  handlePromptEdit: (prompt: string) => void;
  /** Function to handle deletion confirmation */
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
  /** Progress value for generation (0-100), shows progress bar when < 100 */
  progress?: number;
  /** Show delete button (defaults to true) */
  showDelete?: boolean;
  /** Whether to show a flash effect on the version indicator - used when a new version is added */
  versionFlash?: boolean;
  /** Whether regeneration is currently in progress */
  isRegenerating?: boolean;
}

export function ImageOverlay({
  promptText,
  editedPrompt,
  setEditedPrompt,
  handlePromptEdit,
  handleDeleteConfirm,
  handlePrevVersion,
  handleNextVersion,
  handleRegen,
  versionIndex,
  totalVersions,
  classes = defaultClasses,
  showControls = true,
  progress = 100,
  showDelete = true,
  versionFlash = false,
  isRegenerating = false,
}: ImageOverlayProps) {
  // Normal overlay content regardless of delete confirmation state
  return (
    <div
      className={combineClasses('imggen-overlay', classes.overlay)}
      style={{ position: 'relative' }}
    >
      {
        <>
          {/* Prompt bar component */}
          <PromptBar
            promptText={promptText}
            editedPrompt={editedPrompt}
            setEditedPrompt={setEditedPrompt}
            handlePromptEdit={handlePromptEdit}
            classes={classes}
          />

          {/* Controls bar component */}
          <ControlsBar
            handleDeleteConfirm={handleDeleteConfirm}
            handlePrevVersion={handlePrevVersion}
            handleNextVersion={handleNextVersion}
            handleRegen={handleRegen}
            versionIndex={versionIndex}
            totalVersions={totalVersions}
            classes={classes}
            showControls={showControls}
            showDelete={showDelete}
            editedPrompt={editedPrompt}
            promptText={promptText}
            progress={progress}
            versionFlash={versionFlash}
            isRegenerating={isRegenerating}
          />
        </>
      }
    </div>
  );
}
