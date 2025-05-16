import { ImageDocument } from '../../hooks/image-gen/types';

/**
 * Utility functions for the ImgGenDisplay component
 */

/**
 * Get version information from document or create defaults
 */
export function getVersionInfo(document: ImageDocument & { _id: string }) {
  // Check if document has proper version structure
  if (document?.versions && document.versions.length > 0) {
    return {
      versions: document.versions,
      // Use currentVersion directly (now 0-based) or default to last version
      currentVersion:
        typeof document.currentVersion === 'number'
          ? document.currentVersion
          : document.versions.length - 1,
    };
  }

  // Legacy document with just an 'image' file - treat as single version
  if (document?._files && document._files.image) {
    return {
      versions: [{ id: 'image', created: document.created || Date.now() }],
      currentVersion: 0, // Now 0-based
    };
  }

  // No versions found
  return { versions: [], currentVersion: 0 };
}

/**
 * Get prompt information from the document
 */
export function getPromptInfo(document: ImageDocument & { _id: string }) {
  // If we have the new prompts structure
  if (document?.prompts && document.currentPromptKey) {
    return {
      currentPrompt: document.prompts[document.currentPromptKey]?.text || '',
      prompts: document.prompts,
      currentPromptKey: document.currentPromptKey,
    };
  }

  // Legacy document with just a prompt field
  if (document?.prompt) {
    return {
      currentPrompt: document.prompt,
      prompts: { p1: { text: document.prompt, created: document.created || Date.now() } },
      currentPromptKey: 'p1',
    };
  }

  // No prompt found
  return { currentPrompt: '', prompts: {}, currentPromptKey: '' };
}

/**
 * Get the current version file key
 */
export function getCurrentFileKey(
  document: ImageDocument & { _id: string },
  versionIndex: number,
  versions: Array<{ id: string; created: number; promptKey?: string }>
) {
  if (!versions || versions.length === 0) return null;

  // If we have versions, use the ID from the current version index
  if (versions.length > versionIndex) {
    const versionId = versions[versionIndex].id;
    if (document._files && document._files[versionId]) {
      return versionId;
    }
  }

  // Fallback to 'image' for legacy docs
  if (document._files && document._files.image) {
    return 'image';
  }

  return null;
}
