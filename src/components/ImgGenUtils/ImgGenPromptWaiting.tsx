import * as React from 'react';

// Component for when neither prompt nor _id is provided
export function ImgGenPromptWaiting({ className }: { className?: string }) {
  return <div className={`img-gen ${className || ''}`}>Waiting for prompt</div>;
}
