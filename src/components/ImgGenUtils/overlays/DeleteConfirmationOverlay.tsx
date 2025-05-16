import * as React from 'react';
import '../../ImgGen.css';
import { combineClasses, defaultClasses, ImgGenClasses } from '../../../utils/style-utils';

interface DeleteConfirmationOverlayProps {
  handleDeleteConfirm: () => void;
  handleCancelDelete: () => void;
  /** Custom CSS classes for styling component parts */
  classes?: ImgGenClasses;
}

export function DeleteConfirmationOverlay({
  handleDeleteConfirm,
  handleCancelDelete,
  classes = defaultClasses,
}: DeleteConfirmationOverlayProps) {
  return (
    <div
      className={combineClasses('imggen-delete-overlay', classes.deleteOverlay)}
    >
      <div className="imggen-delete-message">
        <h3 className="imggen-error-title">
          Are you sure you want to delete this image?
        </h3>

        <div className="imggen-delete-buttons">
          <button
            onClick={handleDeleteConfirm}
            aria-label="Confirm delete"
            className="imggen-delete-confirm"
          >
            Confirm
          </button>

          <button
            onClick={handleCancelDelete}
            aria-label="Cancel delete"
            className="imggen-delete-cancel"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
