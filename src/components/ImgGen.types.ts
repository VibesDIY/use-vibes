import type { ImageGenOptions } from 'call-ai';
import type { Database } from 'use-fireproof';
import type { ImgGenClasses } from '../utils/style-utils';

export interface ImgGenProps {
  /** Text prompt for image generation (required unless _id is provided) */
  prompt?: string;

  /** Document ID to load a specific image instead of generating a new one */
  _id?: string;

  /** Classname(s) to apply to the image */
  className?: string;

  /** Alt text for the image */
  alt?: string;

  /** Array of images to edit or combine with AI */
  images?: File[];

  /** Image generation options */
  options?: ImageGenOptions;

  /** Database name or instance to use for storing images */
  database?: string | Database;

  /** Callback when image load completes successfully */
  onComplete?: () => void;

  /** Callback when image load fails */
  // eslint-disable-next-line no-unused-vars
  onError?: (error: Error) => void;

  /** Callback when document is deleted */
  // eslint-disable-next-line no-unused-vars
  onDelete?: (id: string) => void;

  /** Callback when prompt is edited */
  // eslint-disable-next-line no-unused-vars
  onPromptEdit?: (id: string, newPrompt: string) => void;

  /** Custom CSS classes for styling component parts */
  classes?: ImgGenClasses;

  /** Callback when a new document is created via drop or file picker */
  // eslint-disable-next-line no-unused-vars
  onDocumentCreated?: (docId: string) => void;

  /** Enable debug logging */
  debug?: boolean;
}

