import * as React from 'react';
import type { DocFileMeta } from 'use-fireproof';
import { ImgFile } from 'use-fireproof';

// Component for when neither prompt nor _id is provided
export function ImgGenPromptWaiting({ className }: { className?: string }) {
  return <div className={`img-gen ${className || ''}`}>Waiting for prompt</div>;
}

// Component for displaying errors
export function ImgGenError({ message }: { message?: string }) {
  return (
    <div className="img-gen-error">
      {message ? <p>Error: {message}</p> : 'Failed to render image'}
    </div>
  );
}

// Props for the placeholder component
export interface ImgGenPlaceholderProps {
  className?: string;
  alt?: string;
  prompt?: string;
  progress: number;
  error: Error | null;
}

// Component for loading/placeholder state
export function ImgGenPlaceholder({
  className,
  alt,
  prompt,
  progress,
  error,
}: ImgGenPlaceholderProps) {
  // Extract error information from the error object
  const parseErrorInfo = (error: Error) => {
    const errorMsg = error.message;
    let title = 'Image Generation Failed';
    let body = errorMsg;
    let code = '';

    // Try to parse JSON error details if present
    if (errorMsg.includes('{')) {
      try {
        const jsonStart = errorMsg.indexOf('{');
        const jsonStr = errorMsg.substring(jsonStart);
        const jsonObj = JSON.parse(jsonStr);

        // Get error code if it exists
        if (errorMsg.match(/\d{3}/)) {
          code = errorMsg.match(/\d{3}/)?.[0] || '';
        }

        // Special handling for moderation blocked errors
        if (
          jsonObj.details?.error?.code === 'moderation_blocked' ||
          jsonObj.code === 'moderation_blocked'
        ) {
          // Include error code in title but avoid duplication
          title = code ? `${code} - Failed to generate image` : 'Failed to generate image';
          body =
            'Your request was rejected as a result of our safety system. Your request may contain content that is not allowed by our safety system.';
          return { title, body, code };
        }

        // Set the title from the main error message
        if (jsonObj.error) {
          title = jsonObj.error;
        }

        // Set the body from the detailed error message
        if (jsonObj.details?.error?.message) {
          body = jsonObj.details.error.message;
        } else if (jsonObj.error?.details?.error?.message) {
          body = jsonObj.error.details.error.message;
        }
      } catch (e) {
        // If parsing fails, just return the original message
        console.warn('Error parsing error message JSON:', e);
      }
    }

    return { title, body, code };
  };

  return (
    <div
      className={`img-gen-placeholder ${className || ''}`}
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: '#333333',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
      }}
      aria-label={alt || prompt || 'Image placeholder'}
      role="img"
    >
      <div style={{ textAlign: 'center', padding: '10px', width: '100%', wordWrap: 'break-word' }}>
        {error ? (
          <div
            className="img-gen-error"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              padding: '20px',
              borderRadius: '8px',
              margin: '15px',
              border: '1px solid #ff6666',
              boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)',
              maxWidth: '90%',
              maxHeight: '80%',
              overflow: 'auto',
            }}
          >
            {(() => {
              const { title, body } = parseErrorInfo(error);
              return (
                <>
                  <h3
                    style={{
                      color: '#ff6666',
                      marginTop: 0,
                      fontWeight: 'bold',
                      fontSize: '18px',
                      marginBottom: '12px',
                      textAlign: 'center',
                    }}
                  >
                    {title}
                  </h3>
                  <p
                    style={{
                      whiteSpace: 'pre-wrap',
                      color: '#ffffff',
                      fontSize: '14px',
                      lineHeight: '1.5',
                      textAlign: 'left',
                      fontFamily: 'monospace, sans-serif',
                      marginBottom: 0,
                    }}
                  >
                    {body}
                  </p>
                </>
              );
            })()}
          </div>
        ) : !prompt ? (
          <div>Waiting for prompt</div>
        ) : (
          // When generating with a prompt, don't show anything here
          // as we'll display the info in the overlay
          null
        )}
      </div>

      {/* When prompt exists and we have no error, show the overlay with the prompt */}
      {prompt && !error && (
        <>
          {/* Thicker progress bar at the top of the overlay */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              height: '8px',
              width: `${progress}%`,
              backgroundColor: '#0066cc',
              transition: 'width 0.3s ease-in-out',
              zIndex: 11, // Ensure it appears above the overlay
            }}
            aria-hidden="true"
          />
          
          {/* Use the same overlay style as in ImgGenDisplay */}
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
              {/* Prompt text on top row */}
              <div 
                className="text-gray-700 truncate mb-2"
                style={{
                  color: '#333',
                  width: '100%', 
                  textAlign: 'center',
                  fontWeight: 'bold',
                  padding: '8px'
                }}
              >
                {/* Display the prompt */}
                {prompt}
              </div>

              {/* Info section - centered 'Generating...' text */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '100%',
                  padding: '4px 0',
                }}
              >
                <span
                  style={{
                    fontSize: '14px',
                    color: '#333',
                    opacity: 0.7,
                  }}
                >
                  Generating...
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Props for the image display component
export interface ImgGenDisplayProps {
  document: {
    _id: string;
    _files?: Record<string, File | DocFileMeta>;
    // Legacy field
    prompt?: string;
    // New prompt structure
    prompts?: Record<string, { text: string; created: number }>;
    currentPromptKey?: string;
    // Version tracking (now 0-based index)
    currentVersion?: number;
    versions?: Array<{ id: string; created: number; promptKey?: string }>;
    created?: number;
  };
  className?: string;
  alt?: string;
  /** Callback when delete is confirmed - receives document ID */
  onDelete?: (id: string) => void;
  /** Callback when refresh is requested - receives document ID */
  onRefresh?: (id: string) => void;
}

// Component for displaying the generated image
export function ImgGenDisplay({ document, className, alt, onDelete, onRefresh }: ImgGenDisplayProps) {
  const [isOverlayOpen, setIsOverlayOpen] = React.useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = React.useState(false);

  // Get version information from document or create defaults
  const getVersionInfo = () => {
    // Check if document has proper version structure
    if (document?.versions && document.versions.length > 0) {
      return {
        versions: document.versions,
        // Use currentVersion directly (now 0-based) or default to last version
        currentVersion: typeof document.currentVersion === 'number'
          ? document.currentVersion
          : document.versions.length - 1
      };
    }

    // Legacy document with just an 'image' file - treat as single version
    if (document?._files && document._files.image) {
      return {
        versions: [{ id: 'image', created: document.created || Date.now() }],
        currentVersion: 0 // Now 0-based
      };
    }

    // No versions found
    return { versions: [], currentVersion: 0 };
  };

  // Get prompt information from the document
  const getPromptInfo = () => {
    // If we have the new prompts structure
    if (document?.prompts && document.currentPromptKey) {
      return {
        currentPrompt: document.prompts[document.currentPromptKey]?.text || '',
        prompts: document.prompts,
        currentPromptKey: document.currentPromptKey
      };
    }

    // Legacy document with just a prompt field
    if (document?.prompt) {
      return {
        currentPrompt: document.prompt,
        prompts: { p1: { text: document.prompt, created: document.created || Date.now() } },
        currentPromptKey: 'p1'
      };
    }

    // No prompt found
    return { currentPrompt: '', prompts: {}, currentPromptKey: '' };
  };

  const { versions, currentVersion } = getVersionInfo();
  const { currentPrompt } = getPromptInfo();
  const [versionIndex, setVersionIndex] = React.useState(currentVersion);
  
  // Update versionIndex when the document changes and has new versions
  React.useEffect(() => {
    // Get the latest version information
    const { versions: newVersions, currentVersion: newCurrentVersion } = getVersionInfo();
    
    // If the document has been updated with a new version, show the latest
    if (newVersions?.length > 0) {
      // Use the document's current version if available, otherwise show the last version
      const latestVersionIndex = typeof newCurrentVersion === 'number' 
        ? newCurrentVersion
        : newVersions.length - 1;
        
      setVersionIndex(latestVersionIndex);
    }
  }, [document, document?._id, document?.versions?.length]);

  // Get the current version file key
  const getCurrentFileKey = () => {
    if (!versions || versions.length === 0) return null;

    // If we have versions, use the ID from the current version index
    if (versions.length > versionIndex) {
      const versionId = versions[versionIndex].id;
      if (document._files && document._files[versionId]) {
        return versionId;
      }
    }

    // Fallback to 'image' for legacy docs
    if (document._files && document._files.image) {
      return 'image';
    }

    return null;
  };

  const fileKey = getCurrentFileKey();
  const totalVersions = versions ? versions.length : 0;

  // Navigation handlers
  const handlePrevVersion = () => {
    if (versionIndex > 0) {
      setVersionIndex(versionIndex - 1);
    }
  };

  const handleNextVersion = () => {
    if (versionIndex < totalVersions - 1) {
      setVersionIndex(versionIndex + 1);
    }
  };

  // Keyboard navigation for versions
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOverlayOpen) return;

      if (e.key === 'ArrowLeft') {
        handlePrevVersion();
      } else if (e.key === 'ArrowRight') {
        handleNextVersion();
      } else if (e.key === 'Escape') {
        if (isDeleteConfirmOpen) {
          handleCancelDelete();
        } else {
          toggleOverlay();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOverlayOpen, isDeleteConfirmOpen, versionIndex, totalVersions]);

  // Toggle overlay visibility
  const toggleOverlay = () => {
    setIsOverlayOpen(!isOverlayOpen);
  };

  // Toggle delete confirmation
  const toggleDeleteConfirm = () => {
    setIsDeleteConfirmOpen(!isDeleteConfirmOpen);
  };

  // Handle delete confirmation
  const handleDeleteConfirm = () => {
    if (onDelete) {
      onDelete(document._id);
    }
    setIsDeleteConfirmOpen(false);
  };

  // Handle cancel delete
  const handleCancelDelete = () => {
    setIsDeleteConfirmOpen(false);
  };

  // Handle generating a new version
  const handleRefresh = () => {
    // Call the onRefresh callback if provided
    if (onRefresh) {
      onRefresh(document._id);
    }
  };

  if (!document._files || (!fileKey && !document._files.image)) {
    return <ImgGenError message="Missing image file" />;
  }

  // The prompt might be stored in the document itself
  const promptText = currentPrompt || alt || 'Generated image';

  // Determine which file to use - either the versioned file or the legacy 'image' file
  const currentFile = fileKey && document._files
    ? document._files[fileKey] as File
    : (document._files?.image as File);

  return (
    <div className="img-gen-container" style={{
      position: 'relative',
      maxWidth: '100%',
      borderRadius: '8px',
      overflow: 'hidden',
    }}>
      <ImgFile
        file={currentFile}
        className={`img-gen-image ${className || ''}`.trim()}
        alt={alt || 'Generated image'}
        style={{
          width: '100%',
          height: 'auto',
          display: 'block',
          borderRadius: '8px',
        }}
      />

      {/* Info button - visible when overlay is closed */}
      {!isOverlayOpen && (
        <button
          aria-label="Image information"
          onClick={toggleOverlay}
          style={{
            position: 'absolute',
            bottom: '10px',
            left: '10px',
            background: 'none',
            border: 'none',
            fontSize: '24px',
            color: '#fff',
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
      )}

      {/* Delete button - visible when the overlay is open */}
      {isOverlayOpen && (
        <button
          aria-label="Delete image"
          onClick={toggleDeleteConfirm}
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            zIndex: 20,
            backgroundColor: 'rgba(255, 255, 255, 0.7)',
            borderRadius: '50%',
            width: '30px',
            height: '30px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            border: 'none',
            fontSize: '16px',
            opacity: 0.5,
            transition: 'opacity 0.2s ease',
            padding: 0,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.5')}
        >
          ✕
        </button>
      )}

      {/* Overlay with image information and controls */}
      {isOverlayOpen && (
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
            {/* Prompt text on top row */}
            <div 
              className="text-gray-700 truncate mb-2"
              style={{
                color: '#333',
                width: '100%', 
                textAlign: 'center',
                fontWeight: 'bold',
                padding: '8px'
              }}
            >
              {/* Display prompt from either new structure or legacy field */}
              {promptText}
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
                    onMouseEnter={(e) => !e.currentTarget.disabled && (e.currentTarget.style.opacity = '1')}
                    onMouseLeave={(e) => !e.currentTarget.disabled && (e.currentTarget.style.opacity = versionIndex === 0 ? '0.3' : '0.5')}
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
                      <span style={{ marginLeft: '5px', opacity: 0.7 }}>
                        (Custom prompt)
                      </span>
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
                    onMouseEnter={(e) => !e.currentTarget.disabled && (e.currentTarget.style.opacity = '1')}
                    onMouseLeave={(e) => !e.currentTarget.disabled && (e.currentTarget.style.opacity = versionIndex >= totalVersions - 1 ? '0.3' : '0.5')}
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
      )}
      
      {/* Delete confirmation overlay */}
      {isDeleteConfirmOpen && (
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
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)')}
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
      )}
    </div>
  );
}
