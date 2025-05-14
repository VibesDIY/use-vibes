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
  error 
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
          (jsonObj.details?.error?.code === 'moderation_blocked') || 
          (jsonObj.code === 'moderation_blocked')
        ) {
          // Include error code in title but avoid duplication
          title = code ? `${code} - Failed to generate image` : 'Failed to generate image';
          body = "Your request was rejected as a result of our safety system. Your request may contain content that is not allowed by our safety system.";
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
      {/* Only show progress bar if not in error state */}
      {!error && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            height: '4px',
            width: `${progress}%`,
            backgroundColor: '#0066cc',
            transition: 'width 0.3s ease-in-out',
          }}
          aria-hidden="true"
        />
      )}
      <div style={{ textAlign: 'center', padding: '10px', width: '100%', wordWrap: 'break-word' }}>
        {error ? (
          <div className="img-gen-error" style={{ 
            backgroundColor: 'rgba(0, 0, 0, 0.7)', 
            padding: '20px', 
            borderRadius: '8px', 
            margin: '15px',
            border: '1px solid #ff6666',
            boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)',
            maxWidth: '90%',
            maxHeight: '80%',
            overflow: 'auto'
          }}>
            {(() => {
              const { title, body, code } = parseErrorInfo(error);
              return (
                <>
                  <h3 style={{ 
                    color: '#ff6666', 
                    marginTop: 0, 
                    fontWeight: 'bold',
                    fontSize: '18px',
                    marginBottom: '12px',
                    textAlign: 'center'
                  }}>
                    {title}
                  </h3>
                  <p style={{ 
                    whiteSpace: 'pre-wrap', 
                    color: '#ffffff',
                    fontSize: '14px',
                    lineHeight: '1.5',
                    textAlign: 'left',
                    fontFamily: 'monospace, sans-serif',
                    marginBottom: 0
                  }}>{body}</p>
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
  };
  className?: string;
  alt?: string;
}

// Component for displaying the generated image
export function ImgGenDisplay({ document, className, alt }: ImgGenDisplayProps) {
  if (!document._files || !document._files.image) {
    return <ImgGenError message="Missing image file" />;
  }
  
  return (
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
  );
}
