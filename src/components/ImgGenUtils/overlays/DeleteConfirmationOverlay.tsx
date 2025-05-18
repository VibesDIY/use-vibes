import * as React from 'react';
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
      className={combineClasses('imggen-delete-message', classes.overlay)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        borderRadius: 'var(--imggen-border-radius)',
        padding: '20px',
        textAlign: 'center',
        width: '100%',
        boxSizing: 'border-box'
      }}
    >
      <p style={{ 
        color: 'white', 
        fontSize: '16px', 
        marginBottom: '20px',
        fontWeight: 'bold'
      }}>
        Are you sure you want to delete this image?
      </p>

      <div className="imggen-delete-buttons" style={{ display: 'flex', gap: '10px' }}>
        <button
          onClick={handleDeleteConfirm}
          aria-label="Confirm delete"
          className="imggen-delete-confirm"
          style={{
            backgroundColor: 'var(--imggen-error-border)',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Confirm
        </button>

        <button
          onClick={handleCancelDelete}
          aria-label="Cancel delete"
          className="imggen-delete-cancel"
          style={{
            backgroundColor: '#555',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
