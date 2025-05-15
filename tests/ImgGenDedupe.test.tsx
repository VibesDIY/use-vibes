import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';

// Create a mock base64 image for testing
const mockBase64Image =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// Array to track all database operations
const dbPuts: Array<any> = [];

// IMPORTANT: Use vi.hoisted for all mock functions used in vi.mock calls
// since they're hoisted to the top of the file before normal initialization
const mockImageGen = vi.hoisted(() => {
  return vi.fn().mockImplementation((prompt, options) => {
    console.log(`[Mock imageGen] called with: ${prompt}`);
    return Promise.resolve({
      created: Date.now(),
      data: [
        {
          b64_json: mockBase64Image,
          url: null,
          revised_prompt: 'Generated test image',
        },
      ],
    });
  });
});

// Mock the callImageGeneration function which is created by createImageGenerator
const mockCallImageGen = vi.hoisted(() => {
  return vi.fn().mockImplementation((prompt, options) => {
    console.log(`[Mock callImageGen] called with: ${prompt}`);
    return Promise.resolve({
      created: Date.now(),
      data: [
        {
          b64_json: mockBase64Image,
          url: null,
          revised_prompt: 'Generated test image',
        },
      ],
    });
  });
});

// Mock the createImageGenerator function which creates callImageGeneration
const mockCreateImageGenerator = vi.hoisted(() => {
  return vi.fn().mockImplementation((requestId) => {
    return mockCallImageGen;
  });
});

// Mock database operations
const mockDbPut = vi.hoisted(() => {
  return vi.fn().mockImplementation((doc) => {
    console.log('[Mock DB] Put called with document:', doc.type);
    
    // Track all database puts
    const docWithId = { 
      ...doc, 
      _id: doc._id || `generated-id-${Date.now()}`
    };
    
    dbPuts.push(docWithId);
    
    // Return a successful response with the document ID
    return Promise.resolve({ 
      id: docWithId._id, 
      ok: true, 
      rev: '1-123' 
    });
  });
});

const mockDbGet = vi.hoisted(() => {
  return vi.fn().mockImplementation((id) => {
    // Find the document in our tracked puts
    const doc = dbPuts.find(d => d._id === id);
    if (doc) {
      return Promise.resolve(doc);
    }
    return Promise.reject(new Error(`Document not found: ${id}`));
  });
});

// Mock ImgFile component
const mockImgFile = vi.hoisted(() => {
  return vi.fn().mockImplementation(({ file, className, alt, style }) => {
    return React.createElement(
      'div',
      {
        'data-testid': 'mock-img-file',
        className: `img-file ${className || ''}`,
        style,
        'aria-label': alt,
      },
      'ImgFile (Mocked)'
    );
  });
});

// Setup all mocks before imports
vi.mock('call-ai', () => ({
  imageGen: mockImageGen
}));

vi.mock('../src/hooks/image-gen/image-generator', () => ({
  imageGen: mockImageGen,
  createImageGenerator: mockCreateImageGenerator
}));

vi.mock('use-fireproof', () => ({
  useFireproof: () => ({
    database: {
      put: mockDbPut,
      get: mockDbGet,
      query: vi.fn().mockResolvedValue({ rows: [] }),
      delete: vi.fn().mockResolvedValue({ ok: true }),
    }
  }),
  ImgFile: mockImgFile,
  // Mock File constructor
  File: vi.fn().mockImplementation((data, name) => ({ name, size: data.length })),
}));

// Import after mocks
import { MODULE_STATE } from '../src/hooks/image-gen/utils';
import { ImgGen } from '../src/index';

describe('ImgGen Document Deduplication', () => {
  beforeEach(() => {
    // Clear mocks and tracked state
    vi.clearAllMocks();
    dbPuts.length = 0;
    MODULE_STATE.createdDocuments.clear();
    MODULE_STATE.processingRequests.clear();
    MODULE_STATE.pendingImageGenCalls.clear();
    MODULE_STATE.pendingPrompts.clear();
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should prevent duplicate document creation with same prompt', async () => {
    // First render - simulates first StrictMode render
    await act(async () => {
      render(<ImgGen prompt="test duplicate prevention" />);
    });

    // Wait for first render to complete and create a document
    await waitFor(() => {
      expect(mockDbPut).toHaveBeenCalledTimes(1);
    });

    // Capture the number of database puts after first render
    const putsAfterFirstRender = dbPuts.length;
    
    // Second render with same prompt - simulates StrictMode re-render
    await act(async () => {
      render(<ImgGen prompt="test duplicate prevention" />);
    });

    // Verify we didn't add more documents to the database
    await waitFor(() => {
      // We should have the same number of database puts
      expect(dbPuts.length).toBe(putsAfterFirstRender);
      
      // The document should be tracked in MODULE_STATE.createdDocuments
      const stableKey = "test duplicate prevention-" + JSON.stringify(undefined);
      expect(MODULE_STATE.createdDocuments.has(stableKey)).toBe(true);
    });
  });

  it('should create new documents for different prompts', async () => {
    // First render with prompt A
    await act(async () => {
      render(<ImgGen prompt="first test prompt" />);
    });

    // Wait for first render to complete
    await waitFor(() => {
      expect(mockDbPut).toHaveBeenCalledTimes(1);
    });

    // Capture the number of puts after first render
    const putsAfterFirstRender = dbPuts.length;

    // Second render with a different prompt
    await act(async () => {
      render(<ImgGen prompt="second test prompt" />);
    });

    // We should have created a second document
    await waitFor(() => {
      expect(dbPuts.length).toBe(putsAfterFirstRender + 1);
      
      // We should have two different keys in the createdDocuments map
      const stableKey1 = "first test prompt-" + JSON.stringify(undefined);
      const stableKey2 = "second test prompt-" + JSON.stringify(undefined);
      expect(MODULE_STATE.createdDocuments.has(stableKey1)).toBe(true);
      expect(MODULE_STATE.createdDocuments.has(stableKey2)).toBe(true);
    });
  });
  
  it('should use the option params in the deduplication key', async () => {
    // First render with specific options
    const options1 = { size: '512x512' };
    await act(async () => {
      render(<ImgGen prompt="same prompt" options={options1} />);
    });
    
    // Wait for first render
    await waitFor(() => {
      expect(mockDbPut).toHaveBeenCalledTimes(1);
    });
    
    // Same prompt but different options should create a new document
    const options2 = { size: '1024x1024' };
    await act(async () => {
      render(<ImgGen prompt="same prompt" options={options2} />);
    });
    
    // Should have created a second document with different options
    await waitFor(() => {
      expect(dbPuts.length).toBe(2);
      
      // We should have two different keys in the createdDocuments map
      const stableKey1 = "same prompt-" + JSON.stringify(options1);
      const stableKey2 = "same prompt-" + JSON.stringify(options2);
      expect(MODULE_STATE.createdDocuments.has(stableKey1)).toBe(true);
      expect(MODULE_STATE.createdDocuments.has(stableKey2)).toBe(true);
    });
  });

  it('should fall back to creating a new document if tracked document is not found', async () => {
    // Set up a tracking entry for a document that doesn't exist
    const stableKey = "missing document-undefined";
    MODULE_STATE.createdDocuments.set(stableKey, 'non-existent-id');
    
    // Try to render with the same prompt
    await act(async () => {
      render(<ImgGen prompt="missing document" />);
    });
    
    // Should create a new document even though it was tracked
    await waitFor(() => {
      expect(mockDbPut).toHaveBeenCalledTimes(1);
      // The map should have been updated with the new document ID
      expect(MODULE_STATE.createdDocuments.get(stableKey)).not.toBe('non-existent-id');
    });
  });
});
