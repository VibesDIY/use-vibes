import * as React from 'react';

interface DeleteConfirmationOverlayProps {
  handleDeleteConfirm: () => void;
  handleCancelDelete: () => void;
}

export function DeleteConfirmationOverlay({
  handleDeleteConfirm,
  handleCancelDelete,
}: DeleteConfirmationOverlayProps) {
  return (
    <div
      className="delete-confirmation-overlay"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        zIndex: 20,
        color: 'white',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: '80%' }}>
        <h3 style={{ marginBottom: '15px', fontSize: '18px' }}>
          Are you sure you want to delete this image?
        </h3>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
          <button
            onClick={handleDeleteConfirm}
            aria-label="Confirm delete"
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              color: 'white',
              border: '1px solid white',
              borderRadius: '4px',
              padding: '6px 14px',
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'background 0.2s ease',
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)')
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)')
            }
          >
            Confirm
          </button>

          <button
            onClick={handleCancelDelete}
            aria-label="Cancel delete"
            style={{
              background: 'rgba(255, 255, 255, 0.8)',
              color: '#333',
              border: 'none',
              borderRadius: '4px',
              padding: '6px 14px',
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'opacity 0.2s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
