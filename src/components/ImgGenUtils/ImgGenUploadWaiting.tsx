import * as React from 'react';
import type { ImageDocument } from '../../hooks/image-gen/types';
import { useFireproof } from 'use-fireproof';
import { ImgGenFileDrop } from './ImgGenFileDrop';
import { ImgGenClasses, combineClasses } from '../../utils/style-utils';

interface ImgGenUploadWaitingProps {
  /** Document with uploaded files */
  document: ImageDocument;
  /** Classname(s) to apply to the container */
  className?: string;
  /** Custom CSS classes for styling component parts */
  classes?: ImgGenClasses;
  /** Enable debugging output */
  debug?: boolean;
  /** Callback when new files are uploaded to this document */
  onFilesAdded?: () => void;
  /** Callback when prompt is set and generation should begin */
  // eslint-disable-next-line no-unused-vars
  onPromptSubmit: (prompt: string) => void;
}

/**
 * Component for displaying uploaded images and allowing users to:
 * 1. Upload more images to the same document
 * 2. Enter a prompt to start generation
 */
export function ImgGenUploadWaiting({
  document,
  className,
  classes,
  debug,
  onFilesAdded,
  onPromptSubmit,
}: ImgGenUploadWaitingProps): React.ReactElement {
  const { database: db } = useFireproof();
  const [prompt, setPrompt] = React.useState('');
  const [inputFiles, setInputFiles] = React.useState<string[]>([]);

  // Get all input files from the document
  React.useEffect(() => {
    if (document?._files) {
      const inFiles = Object.keys(document._files)
        .filter((key) => key.startsWith('in'))
        .sort();

      setInputFiles(inFiles);

      if (debug) {
        console.log('[ImgGenUploadWaiting] Found input files:', inFiles);
      }
    }
  }, [document, debug]);

  // Clean up any created object URLs when unmounting
  React.useEffect(() => {
    const objectUrls: string[] = [];

    return () => {
      // Clean up any created object URLs
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  // Handle additional file uploads to the existing document
  const handleFilesUploaded = async (files: File[]) => {
    if (!document || !document._id || !files.length) return;

    try {
      // Load existing document
      const doc = await db.get(document._id);
      if (!doc) {
        console.error('[ImgGenUploadWaiting] Document not found:', document._id);
        return;
      }

      // Find highest current input file number
      let maxInputNum = 0;
      if (doc._files) {
        Object.keys(doc._files).forEach((key) => {
          if (key.startsWith('in')) {
            const num = parseInt(key.substring(2), 10);
            if (!isNaN(num) && num > maxInputNum) {
              maxInputNum = num;
            }
          }
        });
      }

      // Add new files with incremented keys
      const updatedDoc = { ...doc };
      if (!updatedDoc._files) updatedDoc._files = {};

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileKey = `in${maxInputNum + i + 1}`;

        // Add file to document
        updatedDoc._files[fileKey] = file;

        if (debug) {
          console.log(`[ImgGenUploadWaiting] Adding file to document: ${fileKey}`, file.name);
        }
      }

      // Save updated document
      await db.put(updatedDoc);

      if (debug) {
        console.log('[ImgGenUploadWaiting] Document updated with new files:', updatedDoc._id);
      }

      // Notify parent about files added
      if (onFilesAdded) {
        onFilesAdded();
      }
    } catch (error) {
      console.error('[ImgGenUploadWaiting] Error updating document with new files:', error);
    }
  };

  // Handle prompt submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim()) {
      onPromptSubmit(prompt.trim());
    }
  };

  // Helper function to safely create object URLs from file-like objects
  const getImageUrl = React.useCallback(
    (fileLike: unknown): string | null => {
      // Check if it's a File object (directly usable with URL.createObjectURL)
      if (fileLike instanceof File) {
        const url = URL.createObjectURL(fileLike);
        return url;
      }

      // For DocFileMeta (stored file metadata), we need more complex handling
      // In a real implementation, this would load the file data from Fireproof
      if (typeof fileLike === 'object' && fileLike !== null) {
        if (debug) {
          console.log('[ImgGenUploadWaiting] Cannot display DocFileMeta directly:', fileLike);
        }
        // Return placeholder or null
        return null;
      }

      return null;
    },
    [debug]
  );

  return (
    <div
      className={combineClasses(
        'imggen-upload-waiting',
        className || '',
        classes?.uploadWaiting || ''
      )}
    >
      {/* Display thumbnails of uploaded files */}
      <div className="imggen-uploaded-previews">
        {inputFiles.length > 0 ? (
          <>
            <div className="imggen-upload-count">
              {inputFiles.length} {inputFiles.length === 1 ? 'image' : 'images'} uploaded
            </div>
            <div className="imggen-thumbnails">
              {inputFiles.slice(0, 4).map((fileKey) => (
                <div key={fileKey} className="imggen-thumbnail">
                  {document._files && document._files[fileKey] && (
                    <>
                      {getImageUrl(document._files[fileKey]) ? (
                        <img
                          src={getImageUrl(document._files[fileKey]) || ''}
                          alt={`Upload ${fileKey}`}
                          className="imggen-thumbnail-img"
                        />
                      ) : (
                        <div className="imggen-thumbnail-placeholder">Image</div>
                      )}
                    </>
                  )}
                </div>
              ))}
              {inputFiles.length > 4 && (
                <div className="imggen-more-count">+{inputFiles.length - 4} more</div>
              )}
            </div>
          </>
        ) : (
          <div className="imggen-no-uploads">No images uploaded yet</div>
        )}
      </div>

      {/* Drop zone for more files */}
      <ImgGenFileDrop
        className={classes?.dropZone || ''}
        onFilesDropped={handleFilesUploaded}
        isActive={true}
        maxFiles={10}
        debug={debug}
        addFilesMessage="Drop more images to edit (or click to browse)"
      />

      {/* Prompt input */}
      <form onSubmit={handleSubmit} className="imggen-prompt-form">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Enter a prompt to generate with these images..."
          className="imggen-prompt-input"
        />
        <button type="submit" disabled={!prompt.trim()} className="imggen-prompt-submit">
          Generate
        </button>
      </form>
    </div>
  );
}
