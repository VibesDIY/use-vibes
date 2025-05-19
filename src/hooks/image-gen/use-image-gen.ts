import { useState, useEffect, useMemo, useRef } from 'react';
import { useFireproof } from 'use-fireproof';
import { ImageResponse } from 'call-ai';
import { UseImageGenOptions, UseImageGenResult, ImageDocument } from './types';

// We now use generationId instead of a boolean regenerate flag
// When the generationId changes, we know a new generation request was made
import {
  hashInput,
  base64ToFile,
  addNewVersion,
  getVersionsFromDocument,
  getPromptsFromDocument,
  MODULE_STATE,
  cleanupRequestKey,
  getRelevantOptions,
} from './utils';
import { createImageGenerator } from './image-generator';

/**
 * Hook for generating images with call-ai's imageGen
 * Provides automatic caching, reactive updates, and progress handling
 *
 * The hook allows for two modes of operation:
 * 1. Generate a new image with a prompt (no _id provided)
 * 2. Load or update an existing image document (_id provided)
 */
export function useImageGen({
  prompt,
  _id,
  options = {},
  database = 'ImgGen',
  skip = false, // Skip processing flag
  generationId, // Unique ID that changes for each new generation request
}: UseImageGenOptions): UseImageGenResult {
  // If both are provided, _id takes precedence
  // This silently prioritizes the document's internal prompt
  const [imageData, setImageData] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [error, setError] = useState<Error | null>(null);
  const [document, setDocument] = useState<ImageDocument | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initialize Fireproof database
  const { database: db } = useFireproof(database);

  const size = options?.size || '1024x1024';
  const [width, height] = size.split('x').map(Number);

  // Memoize the options object to prevent unnecessary re-renders
  const memoizedOptions = useMemo(
    () => options,
    [
      // Only include specific option properties that should trigger regeneration
      options?.quality,
      options?.size,
      options?.model,
      options?.style,
      // Add any other properties from options that matter for image generation
    ]
  );

  // Create a unique request ID for logging/debugging only (not for document ID generation)
  const requestId = useMemo(() => {
    return hashInput(prompt || _id || 'unknown', options);
  }, [prompt, _id, options?.size, options?.quality, options?.model, options?.style]);

  // Track ID and regeneration state changes
  const previousIdRef = useRef<string | undefined>(_id);
  const previousGenerationIdRef = useRef<string | undefined>(generationId);

  // Reset state when prompt, _id, or generationId changes
  useEffect(() => {
    // Keep track of whether _id has changed
    const idChanged = _id !== previousIdRef.current;

    // Detect when generationId changes - this indicates a request for regeneration
    const generationRequested = generationId !== previousGenerationIdRef.current;

    // Update refs for next check
    previousIdRef.current = _id;
    previousGenerationIdRef.current = generationId;

    // Only proceed with state resets when needed
    if (idChanged || generationRequested) {
      // Reset all state when inputs change
      setImageData(null);
      setError(null);
      setProgress(0);

      // Clear document state when ID changes
      // This ensures a clean start when navigating to a new document
      if (idChanged) {
        setDocument(null);
      }
    }

    // Clear any existing progress timer
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }

    // Cleanup on unmount or when dependencies change
    return () => {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
      }
    };
  }, [prompt, _id, memoizedOptions]); // Dependencies that require state reset

  // Generate the image when prompt or options change or load by ID
  useEffect(() => {
    let isMounted = true;

    // Skip processing if explicitly told to or if both prompt and _id are falsy
    if (skip || (!prompt && !_id)) {
      setLoading(false);
      if (!skip) {
        setError(new Error('Either prompt or _id must be provided'));
      }
      return;
    }

    setLoading(true);
    setProgress(0);
    setError(null);

    // Create a generator function with the current request ID
    const callImageGeneration = createImageGenerator(requestId);

    // Main function that handles the image loading/generation process
    const loadOrGenerateImage = async () => {
      try {
        // Start the progress animation only when loading starts
        // Set up progress timer simulation (45 seconds to completion)
        // This is just for visual feedback and doesn't reflect actual progress
        const timer = setInterval(() => {
          setProgress((prev: number) => {
            const next = prev + (100 - prev) * 0.05;
            return next > 99 ? 99 : next;
          });
        }, 1000);
        progressTimerRef.current = timer;

        let data: ImageResponse | null = null;

        // Log the request for debugging

        try {
          // If we have a document ID and not regenerating, load the existing document
          // We're regenerating if a generationId is provided
          const isLoadingExisting = _id && !generationId;

          if (isLoadingExisting) {
            const existingDoc = await db.get(_id).catch(() => null);

            if (existingDoc && existingDoc._files) {
              // Document exists, set it
              setDocument(existingDoc as unknown as ImageDocument);

              // Extract prompt information from the document
              const { prompts, currentPromptKey } = getPromptsFromDocument(existingDoc);
              const currentPromptText =
                (currentPromptKey && prompts[currentPromptKey]?.text) ||
                (existingDoc as unknown as ImageDocument).prompt ||
                '';

              // If generationId is provided, we're creating a new version
              // Only attempt if we have a document with a prompt
              if (generationId && currentPromptText) {
                // Create a completely unique key for the regeneration request to avoid deduplication
                // at the image generation API call level (not just the document level)
                const timestamp = Date.now();
                const regenerationOptions = {
                  ...options,
                  _regenerationId: timestamp, // Add timestamp for uniqueness
                };

                // Clear any existing request with the same prompt from the cache
                // This ensures we don't get a cached result
                const requestKey = `${currentPromptText}-${JSON.stringify(getRelevantOptions(options))}`;

                cleanupRequestKey(requestKey);

                // Generate a new image using the document's prompt
                data = await callImageGeneration(currentPromptText, regenerationOptions);

                if (data?.data?.[0]?.b64_json) {
                  // Create a File object from the base64 data
                  const newImageFile = base64ToFile(data.data[0].b64_json, 'image.png');

                  // Ensure we preserve the original document ID
                  const originalDocId = _id;

                  // Add the new version to the document
                  const updatedDoc = addNewVersion(existingDoc, newImageFile, currentPromptText);

                  // Make sure the _id is preserved exactly
                  updatedDoc._id = originalDocId;

                  // Save the updated document
                  await db.put(updatedDoc);

                  // Get the updated document with the new version using the original ID
                  const refreshedDoc = await db.get(originalDocId);
                  setDocument(refreshedDoc as unknown as ImageDocument);

                  // Set the image data from the new version
                  const reader = new FileReader();
                  reader.readAsDataURL(newImageFile);
                  await new Promise<void>((resolve) => {
                    reader.onloadend = () => {
                      if (typeof reader.result === 'string') {
                        setImageData(reader.result);
                      }
                      resolve();
                    };
                  });

                  // Set progress to 100%
                  setProgress(100);
                  return;
                }
              }

              try {
                // Select the current version's file - extract directly instead of storing in state
                // This ensures we always have the latest version info straight from the document
                const { versions, currentVersion } = getVersionsFromDocument(existingDoc);

                if (versions.length > 0) {
                  // Use the current version ID to get the file
                  const versionId = versions[currentVersion]?.id || versions[0]?.id;
                  if (!versionId || !existingDoc._files[versionId]) {
                    throw new Error(`Version ${versionId} not found in document files`);
                  }

                  const imageFile = existingDoc._files[versionId];
                  let fileObj: Blob;

                  // Handle different file access methods
                  if ('file' in imageFile && typeof imageFile.file === 'function') {
                    // DocFileMeta interface from Fireproof
                    fileObj = await imageFile.file();
                  } else {
                    // Direct File object
                    fileObj = imageFile as unknown as File;
                  }

                  // Read the file as base64
                  const reader = new FileReader();
                  const base64Promise = new Promise<string>((resolve, reject) => {
                    reader.onload = () => {
                      const base64 = reader.result as string;
                      // Strip the data URL prefix if present
                      const base64Data = base64.split(',')[1] || base64;
                      resolve(base64Data);
                    };
                    reader.onerror = reject;
                  });
                  reader.readAsDataURL(fileObj);
                  const base64Data = await base64Promise;

                  setImageData(base64Data);
                } else {
                  // Handle legacy files structure
                  if (existingDoc._files.image) {
                    const imageFile = existingDoc._files.image;
                    let fileObj: Blob;

                    if ('file' in imageFile && typeof imageFile.file === 'function') {
                      fileObj = await imageFile.file();
                    } else {
                      fileObj = imageFile as unknown as File;
                    }

                    // Read the file as base64
                    const reader = new FileReader();
                    const base64Promise = new Promise<string>((resolve, reject) => {
                      reader.onload = () => {
                        const base64 = reader.result as string;
                        // Strip the data URL prefix if present
                        const base64Data = base64.split(',')[1] || base64;
                        resolve(base64Data);
                      };
                      reader.onerror = reject;
                    });
                    reader.readAsDataURL(fileObj);
                    const base64Data = await base64Promise;

                    setImageData(base64Data);
                  }
                }
              } catch (err) {
                console.error('Error loading image file:', err);
                throw new Error(
                  `Failed to load image from document: ${err instanceof Error ? err.message : String(err)}`
                );
              }
            } else {
              throw new Error(`Document exists but has no files: ${_id}`);
            }
          } else if (prompt) {
            // No document ID provided but we have a prompt - generate a new image

            // Generate the image
            data = await callImageGeneration(prompt, options);

            // Process the data response
            if (data?.data?.[0]?.b64_json) {
              // Create a File object from the base64 data
              const imageFile = base64ToFile(data.data[0].b64_json, 'image.png');

              // Define a stable key for deduplication based on all relevant parameters.
              // Include _id (if present) and current time for regeneration requests
              // to ensure each regeneration gets a unique key
              // Create a unique stable key for this request that changes with generationId
              // When generationId changes, we'll generate a new image
              const regenPart = generationId ? `gen-${generationId}` : '0';
              const stableKey = [
                prompt || '',
                _id || '',
                // For generation requests, use the generationId to ensure uniqueness
                // When there's no _id but there is a prompt, we still want regeneration to work
                regenPart,
                // Stringify only relevant options to avoid spurious cache misses
                JSON.stringify(getRelevantOptions(options)),
              ].join('|');

              // Schedule cleanup of this request from the cache maps
              // to ensure future requests don't reuse this one
              setTimeout(() => {
                cleanupRequestKey(stableKey);
              });

              // Schedule cleanup of this request from the cache maps
              // to ensure future requests don't reuse this one
              setTimeout(() => {
                cleanupRequestKey(stableKey);
              }, 100); // Clear after a short delay

              try {
                // First check if there's already a document ID for this request
                const existingDocId = MODULE_STATE.createdDocuments.get(stableKey);

                if (existingDocId) {
                  try {
                    // Try to get the existing document
                    const existingDoc = await db.get(existingDocId);
                    setDocument(existingDoc as unknown as ImageDocument);
                    setImageData(data.data[0].b64_json);
                    return; // Exit early, we're using the existing document
                  } catch {
                    // Error fetching existing document, ignore silently
                    // Will continue to document creation below
                  }
                }

                // Check if there's already a document creation in progress
                let documentCreationPromise = MODULE_STATE.pendingDocumentCreations.get(stableKey);

                if (!documentCreationPromise) {
                  // No document creation in progress, start a new one

                  // This promise will be shared by all subscribers requesting the same document
                  documentCreationPromise = (async () => {
                    // Create a new document with initial version and prompt
                    const imgDoc: ImageDocument = {
                      _id: '', // Will be assigned by Fireproof
                      type: 'image',
                      created: Date.now(),
                      currentVersion: 0, // 0-based indexing for versions array
                      versions: [
                        {
                          id: 'v1',
                          created: Date.now(),
                          promptKey: 'p1',
                        },
                      ],
                      prompts: {
                        p1: {
                          text: prompt,
                          created: Date.now(),
                        },
                      },
                      currentPromptKey: 'p1',
                      _files: {
                        v1: imageFile,
                      },
                    };

                    // Save the new document to Fireproof
                    const result = await db.put(imgDoc);

                    // Store the document ID in our tracking map to prevent duplicates
                    MODULE_STATE.createdDocuments.set(stableKey, result.id);

                    // Get the document with the file attached
                    const doc = (await db.get(result.id)) as unknown as ImageDocument;

                    return { id: result.id, doc };
                  })();

                  // Store the promise for other subscribers
                  MODULE_STATE.pendingDocumentCreations.set(stableKey, documentCreationPromise);
                } else {
                  // Reusing existing document creation promise
                  // No additional action needed
                }

                try {
                  // Wait for the document creation to complete
                  const { doc } = await documentCreationPromise;
                  setDocument(doc);
                  setImageData(data.data[0].b64_json);
                } catch (e) {
                  console.error('Error in document creation:', e);
                  // Still show the image even if document creation fails
                  setImageData(data.data[0].b64_json);
                  // Clean up the failed promise so future requests can try again
                  MODULE_STATE.pendingDocumentCreations.delete(stableKey);
                }
                // Empty block - all document creation logic is now handled by the Promise
              } catch (e) {
                console.error('Error saving to Fireproof:', e);
                // Even if we fail to save to Fireproof, we still have the image data
                setImageData(data.data[0].b64_json);
              } finally {
                // Clean up processing flag
                MODULE_STATE.processingRequests.delete(stableKey);

                // Clean up the document creation promise if successful
                // This prevents memory leaks while preserving the document ID in createdDocuments
                if (MODULE_STATE.createdDocuments.has(stableKey)) {
                  MODULE_STATE.pendingDocumentCreations.delete(stableKey);
                  MODULE_STATE.requestTimestamps.delete(stableKey);
                }
              }
            }
          } else {
            throw new Error('Document not found and no prompt provided for generation');
          }
        } catch (error) {
          // Log the error
          console.error('Error retrieving from Fireproof:', error);

          // Only try image generation as fallback for document load failures when we have a prompt
          if (prompt && !data && _id) {
            try {
              data = await callImageGeneration(prompt, options);
              if (data?.data?.[0]?.b64_json) {
                setImageData(data.data[0].b64_json);
              }
            } catch (genError) {
              console.error('Fallback generation also failed:', genError);
              throw genError;
            }
          } else {
            throw error;
          }
        } finally {
          // Always reset loading state and progress indicators
          // This ensures UI progress bars are stopped even if an error occurs
          if (isMounted) {
            setLoading(false);
            setProgress(0); // Reset progress to 0 instead of null
          }
          // Clear progress timer
          if (progressTimerRef.current) {
            clearInterval(progressTimerRef.current);
            progressTimerRef.current = null;
          }
        }

        // Update state with the image data
        if (isMounted && data) {
          setProgress(100);

          // Clear progress timer
          if (progressTimerRef.current) {
            clearInterval(progressTimerRef.current);
            progressTimerRef.current = null;
          }

          // Log completion time
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (isMounted) {
          // Clear progress timer if it's still running
          if (progressTimerRef.current) {
            clearInterval(progressTimerRef.current);
            progressTimerRef.current = null;
          }
          setLoading(false);
        }
      }
    };

    // Always call the function since it handles both prompt-based generation and ID-based retrieval
    loadOrGenerateImage();

    return () => {
      isMounted = false;
    };
  }, [prompt, _id, memoizedOptions, requestId, database, skip, generationId]); // Dependencies that trigger image loading/generation

  return {
    imageData,
    loading,
    progress,
    error,
    size: { width, height },
    document,
  };
}
