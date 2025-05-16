// Type definitions for ImgGen components
import type { ImageDocument } from '../../hooks/image-gen/types';
import { ImgGenClasses } from '../../utils/style-utils';

// Props for the placeholder component
export interface ImgGenPlaceholderProps {
  className?: string;
  alt?: string;
  prompt?: string;
  progress: number;
  error?: Error | null;
  classes?: ImgGenClasses;
}

// Props for the image display component
export interface ImgGenDisplayProps {
  document: ImageDocument & { _id: string }; // Ensure _id is required for display
  className?: string;
  alt?: string;
  /** Whether to show the overlay info button and controls (default: true) */
  showOverlay?: boolean;
  /** Callback when delete is confirmed - receives document ID */
  // eslint-disable-next-line no-unused-vars
  onDelete?: (id: string) => void;
  /** Callback when refresh is requested - receives document ID */
  // eslint-disable-next-line no-unused-vars
  onRefresh?: (id: string) => void;
  /** Callback when prompt is edited - receives document ID and new prompt */
  // eslint-disable-next-line no-unused-vars
  onPromptEdit?: (id: string, newPrompt: string) => void;
  /** Custom CSS classes for styling component parts */
  classes?: ImgGenClasses;
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
