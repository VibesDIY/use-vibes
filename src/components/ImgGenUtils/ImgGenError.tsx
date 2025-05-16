import * as React from 'react';

// Component for displaying errors
export function ImgGenError({ message }: { message?: string }) {
  return (
    <div className="img-gen-error">
      {message ? <p>Error: {message}</p> : 'Failed to render image'}
    </div>
  );
}
