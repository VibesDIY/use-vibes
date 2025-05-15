import { ImageGenOptions as BaseImageGenOptions, ImageResponse, imageGen as originalImageGen } from 'call-ai';
import { MODULE_STATE, getRelevantOptions } from './utils';

// Extend the ImageGenOptions type to include our regeneration ID
interface ImageGenOptions extends BaseImageGenOptions {
  _regenerationId?: number;
}

/**
 * Wrapper for imageGen that prevents duplicate calls
 * This function maintains a module-level cache to prevent duplicate API calls
 */
export function imageGen(prompt: string, options?: ImageGenOptions): Promise<ImageResponse> {
  // Get the relevant options to form a stable key
  const relevantOptions = getRelevantOptions(options);

  // Log regeneration parameters if present (for debugging)
  if (options?._regenerationId) {
    console.log(`[ImgGen Debug] Processing regeneration request with ID: ${options._regenerationId}`);
  }

  // Create a stable key for the request cache
  // Include regeneration ID if present to ensure unique keys for regeneration requests
  const stableKey = options?._regenerationId 
    ? `${prompt}-${JSON.stringify(relevantOptions)}-regen-${options._regenerationId}` 
    : `${prompt}-${JSON.stringify(relevantOptions)}`;
  
  console.log(`[ImgGen Debug] Generated cache key: ${stableKey.slice(0, 20)}...`);

  // Create a unique ID for this specific request instance (for logging)
  const requestId = ++MODULE_STATE.requestCounter;

  // Check if this prompt+options combination is already being processed
  if (MODULE_STATE.pendingPrompts.has(stableKey)) {
    console.log(
      `[ImgGen Debug] DUPLICATE REQUEST #${requestId} DETECTED - Using existing imageGen call [key:${stableKey.slice(0, 12)}...] for: ${prompt}`
    );

    // Return the existing promise for this prompt+options combination
    if (MODULE_STATE.pendingImageGenCalls.has(stableKey)) {
      return MODULE_STATE.pendingImageGenCalls.get(stableKey)!;
    }
  }

  // Mark this prompt+options as being processed
  MODULE_STATE.pendingPrompts.add(stableKey);
  MODULE_STATE.processingRequests.add(stableKey);
  MODULE_STATE.requestTimestamps.set(stableKey, Date.now());

  console.log(
    `[ImgGen Debug] NEW REQUEST #${requestId} - Starting imageGen call [key:${stableKey.slice(0, 12)}...] for: ${prompt}`
  );
  let promise: Promise<ImageResponse>;

  try {
    // Direct import from call-ai - this works consistently with test mocks
    promise = originalImageGen(prompt, options);
  } catch (e) {
    console.error(`[ImgGen Debug] Error with imageGen for request #${requestId}:`, e);
    promise = Promise.reject(e);
  }

  // Store the promise so other requests for the same prompt+options can use it
  MODULE_STATE.pendingImageGenCalls.set(stableKey, promise);

  // Clean up after the promise resolves or rejects
  promise
    .then((response) => {
      console.log(
        `[ImgGen Debug] Request #${requestId} succeeded [key:${stableKey.slice(0, 12)}...]`
      );
      // Remove from processing set but KEEP in pendingPrompts to ensure deduplication persists
      // until page reload
      MODULE_STATE.processingRequests.delete(stableKey);
      return response;
    })
    .catch((error) => {
      console.error(
        `[ImgGen Debug] Request #${requestId} failed [key:${stableKey.slice(0, 12)}...]: ${error}`
      );
      // Even on failure, we'll keep the key in pendingPrompts to prevent repeated failures
      // but remove it from processing to allow potential retries after page reload
      MODULE_STATE.processingRequests.delete(stableKey);
      return Promise.reject(error);
    });

  return promise;
}

/**
 * Create a wrapper function for generating images with logging and tracking
 */
export function createImageGenerator(requestHash: string) {
  return async (promptText: string, genOptions?: ImageGenOptions): Promise<ImageResponse> => {
    // Create a key string based on the options to help identify duplicate calls
    const optionsKey = JSON.stringify(getRelevantOptions(genOptions));

    // Log detailed information about this request - including request hash and options
    console.log(`[ImgGen Debug] imageGen call [ID:${requestHash}] for prompt: ${promptText}`);
    console.log(`[ImgGen Debug] Request options [ID:${requestHash}]: ${optionsKey}`);

    // Track the time it takes to generate the image
    const startTime = Date.now();

    try {
      const response = await imageGen(promptText, genOptions);
      const duration = Date.now() - startTime;
      console.log(`[ImgGen Debug] Completed request [ID:${requestHash}] in ${duration}ms`);
      return response;
    } catch (error) {
      console.error(`[ImgGen Debug] Failed request [ID:${requestHash}]: ${error}`);
      throw error;
    }
  };
}
