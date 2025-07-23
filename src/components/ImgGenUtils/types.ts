// Type definitions for ImgGen components
import type { ImageDocument } from '../../hooks/image-gen/types';
import { ImgGenClasses } from '../../utils/style-utils';

// Props for the placeholder component
export interface ImgGenPlaceholderProps {
  className?: string;
  alt?: string;
  prompt?: string;
  progress: number;
  /** Whether the component is currently loading */
  loading?: boolean;
  error?: Error | null;
  classes?: ImgGenClasses;
}

// Props for the image display component
export interface ImgGenDisplayProps {
  document: ImageDocument & { _id: string }; // Ensure _id is required for display
  className?: string;
  alt?: string;
  /** Callback when delete is confirmed - receives document ID */

  onDelete?: (id: string) => void;
  /** Callback when regeneration is requested - receives document ID */

  onRegen?: (id: string) => void;
  /** Callback when prompt is edited - receives document ID and new prompt */

  onPromptEdit?: (id: string, newPrompt: string) => void;
  /** Custom CSS classes for styling component parts */
  classes?: ImgGenClasses;
  /** Whether the component is currently loading */
  loading: boolean;
  /** Generation progress as a number between 0-100 */
  progress: number;
  /** Error if image generation failed */
  error?: Error | null;
  /** Enable debug logging */
  debug?: boolean;
}

// Props for the error component
export interface ImgGenErrorProps {
  /** Optional error message to display */
  message?: string;
  /** Optional CSS class name */
  className?: string;
  /** Custom CSS classes for styling component parts */
  classes?: ImgGenClasses;
}
