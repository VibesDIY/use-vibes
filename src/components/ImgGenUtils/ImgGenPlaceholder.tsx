import * as React from 'react';
import { ImgGenPlaceholderProps } from './types';
import { combineClasses, defaultClasses } from '../../utils/style-utils';
import { ImgGenError } from './ImgGenError';
import { ImageOverlay } from './overlays/ImageOverlay';

// Component for loading/placeholder state
export function ImgGenPlaceholder({
  className,
  alt,
  prompt,
  progress,
  error,
  classes = defaultClasses,
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
      className={combineClasses('imggen-placeholder', className, classes.placeholder)}
      aria-label={alt || prompt || 'Image placeholder'}
      role="img"
    >
      {/* Progress bar at the very top */}
      {prompt && !error && (
        <div 
          className={combineClasses('imggen-progress', classes.progress)} 
          style={{ width: `${visibleProgress}%` }}
          aria-hidden="true"
        />
      )}
      <div style={{ textAlign: 'center', padding: '10px', width: '100%', wordWrap: 'break-word' }}>
        {error ? (
          <div className={combineClasses('imggen-error', classes.error)}>
            {(() => {
              const { title, body } = parseErrorInfo(error);
              return (
                <>
                  <h3 className="imggen-error-title">{title}</h3>
                  <p className="imggen-error-message">{body}</p>
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
        <ImageOverlay
          promptText={prompt}
          editedPrompt={null}
          setEditedPrompt={() => {}}
          handlePromptEdit={() => {}}
          toggleOverlay={() => {}}
          handlePrevVersion={() => {}}
          handleNextVersion={() => {}}
          handleRefresh={() => {}}
          versionIndex={0}
          totalVersions={1}
          classes={classes}
          showControls={false}
          statusText="Generating..."
        />
      )}
    </div>
  );
}
