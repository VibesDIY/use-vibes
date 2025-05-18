import * as React from 'react';
import { combineClasses, defaultClasses, ImgGenClasses } from '../../../utils/style-utils';
import { DeleteConfirmationOverlay } from './DeleteConfirmationOverlay';
import { PromptBar } from '../../../components/PromptBar';
import { ControlsBar } from '../../../components/ControlsBar';

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
  /** Progress value for generation (0-100), shows progress bar when < 100 */
  progress?: number;
  /** Show delete button (defaults to true) */
  showDelete?: boolean;
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
  progress = 100,
  showDelete = true,
}: ImageOverlayProps) {
  if (isDeleteConfirmOpen && showDelete) {
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
    <div className={combineClasses('imggen-overlay', classes.overlay)} style={{ position: 'relative' }}>
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
        toggleDeleteConfirm={toggleDeleteConfirm}
        handlePrevVersion={handlePrevVersion}
        handleNextVersion={handleNextVersion}
        handleRefresh={handleRefresh}
        versionIndex={versionIndex}
        totalVersions={totalVersions}
        classes={classes}
        showControls={showControls}
        statusText={statusText}
        showDelete={showDelete}
        editedPrompt={editedPrompt}
        promptText={promptText}
        progress={progress}
      />
    </div>
  );
}
