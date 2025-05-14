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
      {/* Always show progress bar, but with 0% width if in error state */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          height: '4px',
          width: error ? '0%' : `${progress}%`,
          backgroundColor: '#0066cc',
          transition: 'width 0.3s ease-in-out',
        }}
        aria-hidden="true"
      />
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
              const { title, body, code } = parseErrorInfo(error);
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
          <div>Generating image...</div>
        )}
      </div>
    </div>
  );
}

// Props for the image display component
export interface ImgGenDisplayProps {
  document: {
    _id: string;
    _files?: Record<string, File | DocFileMeta>;
    prompt?: string; // Add prompt property to the document type
  };
  className?: string;
  alt?: string;
}

// Component for displaying the generated image
export function ImgGenDisplay({ document, className, alt }: ImgGenDisplayProps) {
  const [isOverlayOpen, setIsOverlayOpen] = React.useState(false);

  if (!document._files || !document._files.image) {
    return <ImgGenError message="Missing image file" />;
  }

  // The prompt might be stored in the document itself
  const promptText = document.prompt || alt || 'Generated image';

  // Toggle overlay visibility
  const toggleOverlay = () => {
    setIsOverlayOpen(!isOverlayOpen);
  };

  return (
    <div className="img-gen-container" style={{ 
      position: 'relative', 
      width: '100%', 
      height: '100%',
      overflow: 'hidden',
      borderRadius: 'inherit'
    }}>
      <ImgFile
        file={document._files.image}
        className={`img-gen ${className || ''}`}
        alt={alt || ''}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
        }}
        loading="lazy"
      />
      
      {/* Minimalist info icon with opacity change on hover */}
      <button 
        className="img-gen-info-button"
        onClick={toggleOverlay}
        aria-label="Image information"
        aria-expanded={isOverlayOpen}
        style={{
          position: 'absolute',
          bottom: '10px',
          left: '10px',
          zIndex: 5,
          background: 'none',
          border: 'none',
          fontSize: '24px',
          color: 'white',
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
      
      {/* Delete button only visible when overlay is open - positioned at the top right of the image */}
      {isOverlayOpen && (
        <button 
          aria-label="Delete image"
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
          
          {/* Prompt text */}
          <div 
            className="text-gray-700 truncate mb-1"
            style={{
              color: '#333',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              marginBottom: '4px',
            }}
          >
            {promptText}
          </div>
          
          {/* Controls */}
          <div 
            className="flex items-center justify-between text-gray-600"
            style={{ 
              display: 'flex', 
              justifyContent: 'space-between',
              alignItems: 'center',
              color: '#666',
            }}
          >
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
            
            <div className="flex items-center gap-3" style={{ alignItems: 'center' }}>
              {/* Previous button */}
              <button 
                aria-label="Previous version" 
                disabled={true}
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
                onMouseEnter={(e) => !e.currentTarget.disabled && (e.currentTarget.style.opacity = '1')}
                onMouseLeave={(e) => !e.currentTarget.disabled && (e.currentTarget.style.opacity = '0.5')}
              >
                ◀︎
              </button>
              
              {/* Version indicator */}
              <span 
                className="version-indicator" 
                aria-live="polite"
                style={{ 
                  fontSize: '14px',
                  color: '#333',
                  margin: '0 2px'
                }}
              >
                1 of 1
              </span>
              
              {/* Next button */}
              <button 
                aria-label="Next version" 
                disabled={true}
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
                onMouseEnter={(e) => !e.currentTarget.disabled && (e.currentTarget.style.opacity = '1')}
                onMouseLeave={(e) => !e.currentTarget.disabled && (e.currentTarget.style.opacity = '0.5')}
              >
                ▶︎
              </button>
              
              {/* Refresh button */}
              <button 
                aria-label="Generate new version"
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
                  marginLeft: '4px'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.5')}
              >
                ⟳
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
