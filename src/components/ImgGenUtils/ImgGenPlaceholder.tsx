import * as React from 'react';
import { ImgGenPlaceholderProps } from './types';

// Component for loading/placeholder state
export function ImgGenPlaceholder({
  className,
  alt,
  prompt,
  progress,
  error,
}: ImgGenPlaceholderProps) {
  // State to track the visible progress width for animation
  const [visibleProgress, setVisibleProgress] = React.useState(0);

  // Animate progress bar when component mounts or progress changes
  React.useEffect(() => {
    // Start at zero
    setVisibleProgress(0);

    // After a tiny delay, animate to the actual progress (or minimum 5%)
    const timer = setTimeout(() => {
      setVisibleProgress(Math.max(5, progress));
    }, 50); // Small delay to ensure animation runs

    return () => clearTimeout(timer);
  }, [progress]);
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
        ) : // When generating with a prompt, don't show anything here
        // as we'll display the info in the overlay
        null}
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
              width: `${visibleProgress}%`,
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
                  padding: '8px',
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
