import * as React from 'react';

// Import the EnhancedVersionInfo type or define it inline
type EnhancedVersionInfo = {
  id: string;
  created?: number;
  promptKey?: string;
  prompt?: string;
};

interface ImageOverlayProps {
  promptText: string;
  isEditingPrompt: boolean;
  editedPrompt: string;
  // eslint-disable-next-line no-unused-vars
  setEditedPrompt: (prompt: string) => void;
  // eslint-disable-next-line no-unused-vars
  setIsEditingPrompt: (editing: boolean) => void;
  // eslint-disable-next-line no-unused-vars
  handlePromptEdit: (prompt: string) => void;
  toggleOverlay: () => void;
  handlePrevVersion: () => void;
  handleNextVersion: () => void;
  handleRefresh: () => void;
  versionIndex: number;
  totalVersions: number;
  versions: EnhancedVersionInfo[];
}

export function ImageOverlay({
  promptText,
  isEditingPrompt,
  editedPrompt,
  setEditedPrompt,
  setIsEditingPrompt,
  handlePromptEdit,
  toggleOverlay,
  handlePrevVersion,
  handleNextVersion,
  handleRefresh,
  versionIndex,
  totalVersions,
  versions,
}: ImageOverlayProps) {
  return (
    <div
      className="img-gen-overlay"
      style={{
        position: 'absolute',
        bottom: '0',
        left: '0',
        right: '0',
        padding: '8px 12px',
        backgroundColor: 'rgba(255, 255, 255, 0.5)',
        backdropFilter: 'blur(4px)',
        transition: 'opacity 0.2s ease',
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Two row layout with prompt on top and controls below */}
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
        {/* Prompt text on top row - double-clickable for editing */}
        <div className="text-gray-700 mb-2" style={{ width: '100%', padding: '4px' }}>
          {isEditingPrompt ? (
            <input
              type="text"
              value={editedPrompt}
              onChange={(e) => setEditedPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handlePromptEdit(editedPrompt);
                } else if (e.key === 'Escape') {
                  setIsEditingPrompt(false);
                }
              }}
              onBlur={() => setIsEditingPrompt(false)}
              autoFocus
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '6px 8px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                fontSize: '14px',
                fontWeight: 'bold',
                color: '#333',
                backgroundColor: 'white',
              }}
              aria-label="Edit prompt"
            />
          ) : (
            <div
              onClick={(e) => {
                // Handle both single and double click
                if (e.detail === 2) {
                  console.log('Double click detected on prompt: ', promptText);
                  setEditedPrompt(promptText);
                  setIsEditingPrompt(true);
                }
              }}
              style={{
                color: '#333',
                width: '100%',
                textAlign: 'center',
                fontWeight: 'bold',
                padding: '8px',
                cursor: 'pointer',
              }}
              title="Double-click to edit prompt"
              className="truncate"
            >
              {/* Display prompt from either new structure or legacy field */}
              {promptText}
            </div>
          )}
        </div>

        {/* Controls on bottom row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
          }}
        >
          {/* Left side: Info button */}
          <button
            aria-label="Close info panel"
            onClick={toggleOverlay}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              color: '#333',
              opacity: 0.5,
              cursor: 'pointer',
              padding: 0,
              transition: 'opacity 0.2s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.5')}
          >
            ⓘ
          </button>

          {/* Right side: Version controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Show version arrows only when there are multiple versions */}
            {totalVersions > 1 && (
              <button
                aria-label="Previous version"
                disabled={versionIndex === 0}
                onClick={handlePrevVersion}
                style={{
                  background: 'rgba(255, 255, 255, 0.7)',
                  borderRadius: '50%',
                  width: '28px',
                  height: '28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: 'none',
                  cursor: versionIndex === 0 ? 'default' : 'pointer',
                  opacity: versionIndex === 0 ? 0.3 : 0.5,
                  transition: 'opacity 0.2s ease',
                  padding: 0,
                  fontSize: '14px',
                }}
                onMouseEnter={(e) =>
                  !e.currentTarget.disabled && (e.currentTarget.style.opacity = '1')
                }
                onMouseLeave={(e) =>
                  !e.currentTarget.disabled &&
                  (e.currentTarget.style.opacity = versionIndex === 0 ? '0.3' : '0.5')
                }
              >
                ◀︎
              </button>
            )}

            {/* Version indicator - only display if we have versions */}
            <span
              className="version-indicator"
              aria-live="polite"
              style={{
                fontSize: '14px',
                color: '#333',
              }}
            >
              <span style={{ fontSize: '14px' }}>
                {versionIndex + 1} / {totalVersions}
                {/* Show prompt version if it exists */}
                {versions[versionIndex]?.promptKey && versions[versionIndex].promptKey !== 'p1' && (
                  <span style={{ marginLeft: '5px', opacity: 0.7 }}>(Custom prompt)</span>
                )}
              </span>
            </span>

            {/* Show version arrows only when there are multiple versions */}
            {totalVersions > 1 && (
              <button
                aria-label="Next version"
                disabled={versionIndex >= totalVersions - 1}
                onClick={handleNextVersion}
                style={{
                  background: 'rgba(255, 255, 255, 0.7)',
                  borderRadius: '50%',
                  width: '28px',
                  height: '28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: 'none',
                  cursor: versionIndex >= totalVersions - 1 ? 'default' : 'pointer',
                  opacity: versionIndex >= totalVersions - 1 ? 0.3 : 0.5,
                  transition: 'opacity 0.2s ease',
                  padding: 0,
                  fontSize: '14px',
                }}
                onMouseEnter={(e) =>
                  !e.currentTarget.disabled && (e.currentTarget.style.opacity = '1')
                }
                onMouseLeave={(e) =>
                  !e.currentTarget.disabled &&
                  (e.currentTarget.style.opacity =
                    versionIndex >= totalVersions - 1 ? '0.3' : '0.5')
                }
              >
                ▶︎
              </button>
            )}

            {/* Refresh button - always visible */}
            <button
              aria-label="Generate new version"
              onClick={handleRefresh}
              style={{
                background: 'rgba(255, 255, 255, 0.7)',
                borderRadius: '50%',
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                cursor: 'pointer',
                opacity: 0.5,
                transition: 'opacity 0.2s ease',
                padding: 0,
                fontSize: '14px',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.5')}
            >
              ⟳
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
