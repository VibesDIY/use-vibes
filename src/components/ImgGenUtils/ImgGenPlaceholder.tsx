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
                    }}
                  >
                    {title}
                  </h3>
                  <p style={{ margin: 0, color: '#ffffff', fontSize: '14px' }}>{body}</p>
                </>
              );
            })()}
          </div>
        ) : (
          <>
            {/* Loading spinner and progress indicator */}
            <div
              style={{
                width: '60px',
                height: '60px',
                margin: '0 auto 15px',
                border: '4px solid rgba(255, 255, 255, 0.3)',
                borderTop: '4px solid #ffffff',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            />
            <style>
              {`
                @keyframes spin {
                  0% { transform: rotate(0deg); }
                  100% { transform: rotate(360deg); }
                }
              `}
            </style>
            <div
              style={{
                fontSize: '14px',
                color: 'white',
                fontWeight: 'bold',
                marginBottom: '10px',
              }}
            >
              Generating image...
              {progress > 0 && ` ${Math.round(progress * 100)}%`}
            </div>
            {prompt && (
              <div
                style={{
                  fontSize: '14px',
                  color: 'rgba(255, 255, 255, 0.7)',
                  maxWidth: '80%',
                  margin: '0 auto',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {prompt}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
