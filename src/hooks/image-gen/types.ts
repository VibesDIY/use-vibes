import type { DocFileMeta } from 'use-fireproof';
import { ImageGenOptions, ImageResponse } from 'call-ai';

// Interface for our image documents in Fireproof
// Interface for prompt entry
export interface PromptEntry {
  text: string;      // The prompt text content
  created: number;   // Timestamp when this prompt was created
}

export interface ImageDocument extends Record<string, any> {
  _id: string;
  type: 'image';
  prompt?: string;   // Legacy field, superseded by prompts/currentPromptKey
  _files?: Record<string, File | DocFileMeta>; // Files keyed by version ID (v1, v2, etc.)
  created?: number;
  currentVersion?: number; // The currently active version index (0-based)
  versions?: VersionInfo[]; // Array of version metadata
  prompts?: Record<string, PromptEntry>; // Prompts keyed by ID (p1, p2, etc.)
  currentPromptKey?: string; // The currently active prompt key
}

// Interface for version information
export interface VersionInfo {
  id: string; // Version identifier (e.g. "v1", "v2")
  created: number; // Timestamp when this version was created
  promptKey?: string; // Reference to the prompt used for this version (e.g. "p1")
}

export interface UseImageGenOptions {
  /** Text prompt for image generation (required unless _id is provided) */
  prompt?: string;

  /** Document ID to load a specific image instead of generating a new one */
  _id?: string;

  /** Options for image generation */
  options?: ImageGenOptions;

  /** Fireproof database name or instance */
  database?: string | any;
  
  /** Flag to force regeneration of the image */
  regenerate?: boolean;
  
  /** Flag to skip processing when neither prompt nor _id is valid */
  skip?: boolean;
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

// Module state type for tracking pending requests and their results
export interface ModuleState {
  pendingImageGenCalls: Map<string, Promise<ImageResponse>>;
  pendingPrompts: Set<string>;
  processingRequests: Set<string>;
  requestTimestamps: Map<string, number>;
  requestCounter: number;
  // Track which image generation requests have already created documents
  // Map from prompt+options hash to document ID
  createdDocuments: Map<string, string>;
  // Track pending document creation promises to deduplicate db.put operations
  pendingDocumentCreations: Map<string, Promise<{id: string, doc: ImageDocument}>>;
}
