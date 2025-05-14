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
      <div style={{ textAlign: 'center', padding: '10px', width: '100%', wordWrap: 'break-word' }}>
        {error ? (
          <div className="img-gen-error">
            <p>Error: {error.message}</p>
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
