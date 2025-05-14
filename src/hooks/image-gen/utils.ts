import { ImageGenOptions } from 'call-ai';
import { ModuleState } from './types';

// Module-level state for tracking and preventing duplicate calls
export const MODULE_STATE: ModuleState = {
  pendingImageGenCalls: new Map(),
  pendingPrompts: new Set(),
  processingRequests: new Set(),
  requestTimestamps: new Map(),
  requestCounter: 0
};

// Periodically clean up stale requests (every minute)
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of MODULE_STATE.requestTimestamps.entries()) {
    if (now - timestamp > 5 * 60 * 1000) {
      MODULE_STATE.pendingImageGenCalls.delete(key);
      MODULE_STATE.processingRequests.delete(key);
      MODULE_STATE.pendingPrompts.delete(key);
      MODULE_STATE.requestTimestamps.delete(key);
    }
  }
}, 60000); // Check every minute

/**
 * Synchronous hash function to create a key from the prompt string and options
 * @param prompt The prompt string to hash
 * @param options Optional image generation options
 * @returns A hash string for the input
 */
export function hashInput(prompt: string, options?: any): string {
  // Create a string that includes both prompt and relevant options
  const inputString = JSON.stringify({
    prompt,
    // Only include relevant options properties to avoid unnecessary regeneration
    options: options ? {
      size: options.size,
      quality: options.quality,
      model: options.model,
      style: options.style,
    } : undefined
  });
  
  // Use a fast non-crypto hash for immediate results (FNV-1a algorithm)
  let hash = 2166136261; // FNV offset basis
  for (let i = 0; i < inputString.length; i++) {
    hash ^= inputString.charCodeAt(i);
    // Multiply by the FNV prime (32-bit)
    hash = Math.imul(hash, 16777619);
  }
  
  // Convert to hex string and take first 12 chars
  const hashHex = (hash >>> 0).toString(16).padStart(8, '0');
  const requestId = hashHex.slice(0, 12);
  
  // Add a timestamp to make the ID unique even for identical requests
  return `${requestId}-${Date.now().toString(36)}`;
}

// Convert base64 to File object
export function base64ToFile(base64Data: string, filename: string): File {
  const byteString = atob(base64Data);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  
  const blob = new Blob([ab], { type: 'image/png' });
  return new File([blob], filename, { type: 'image/png' });
}

/**
 * Extract only the options properties that matter for image generation
 * to avoid unnecessary re-renders or regenerations
 */
export function getRelevantOptions(options?: ImageGenOptions): Record<string, any> {
  return options ? {
    size: options.size,
    quality: options.quality,
    model: options.model,
    style: options.style
  } : {};
}
