import type { DocFileMeta } from 'use-fireproof';
import { ImageGenOptions, ImageResponse } from 'call-ai';

// Interface for our image documents in Fireproof
export interface ImageDocument extends Record<string, any> {
  _id: string;
  type: 'image';
  prompt: string;
  _files?: Record<string, File | DocFileMeta>;
  created?: number;
}

export interface UseImageGenOptions {
  /** Text prompt for image generation (required unless _id is provided) */
  prompt: string;

  /** Document ID to load a specific image instead of generating a new one */
  _id?: string;

  /** Options for image generation */
  options?: ImageGenOptions;

  /** Fireproof database name or instance */
  database?: string | any;
}

export interface UseImageGenResult {
  /** Base64 image data */
  imageData: string | null;

  /** Whether the image is currently loading */
  loading: boolean;

  /** Progress percentage (0-100) */
  progress: number;

  /** Error if image generation failed */
  error: Error | null;

  /** Size information parsed from options */
  size: {
    width: number;
    height: number;
  };

  /** Document for the generated image */
  document: ImageDocument | null;
}

// Module state type for tracking pending requests
export interface ModuleState {
  pendingImageGenCalls: Map<string, Promise<ImageResponse>>;
  pendingPrompts: Set<string>;
  processingRequests: Set<string>;
  requestTimestamps: Map<string, number>;
  requestCounter: number;
}
