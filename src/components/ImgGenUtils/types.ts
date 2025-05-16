import { ImageDocument } from '../../hooks/image-gen/types';

// Props for the placeholder component
export interface ImgGenPlaceholderProps {
  className?: string;
  alt?: string;
  prompt?: string;
  progress: number;
  error: Error | null;
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
}
