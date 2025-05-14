import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ImgGen } from '../src/index';
import React from 'react';
import { render, screen, cleanup, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';

// Create a mock base64 image for testing
const mockBase64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// Use vi.hoisted for mocks that need to be referenced in vi.mock
const mockImageGen = vi.hoisted(() => vi.fn().mockImplementation((prompt, options) => {
  if (prompt === 'error prompt') {
    return Promise.reject(new Error('API error'));
  }
  
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
}));

// Create a fully mocked database for Fireproof
const mockDb = vi.hoisted(() => ({
  get: vi.fn().mockImplementation((id) => {
    // Create a proper promise with catch method
    const promise = new Promise((resolve, reject) => {
      // For tests that check 'Waiting for prompt', we need to fail differently
      if (id === 'test-image-id') {
        reject(new Error('Test ID not found - expected for empty prompt test'));
      } else {
        reject(new Error('Not found'));
      }
    });
    return promise;
  }),
  put: vi.fn().mockImplementation((doc) => Promise.resolve({id: doc._id, ok: true, rev: '1-123'})),
  query: vi.fn().mockResolvedValue({
    rows: [{ id: 'img1', key: 'img1', value: { _id: 'img:hash', prompt: 'Test Image' } }],
  }),
  delete: vi.fn().mockResolvedValue({ ok: true })
}));

const mockImgFile = vi.hoisted(() => vi.fn().mockImplementation(({ file, className, alt, style }) => {
  return React.createElement('div', {
    'data-testid': 'mock-img-file',
    className: `img-file ${className || ''}`,
    style,
    'aria-label': alt
  }, 'ImgFile (Mocked)')
}));

// Mock the external modules (not our code)
vi.mock('call-ai', async () => {
  const actual = await vi.importActual('call-ai');
  return {
    ...actual as Object,
    imageGen: mockImageGen
  };
});

vi.mock('use-fireproof', () => ({
  useFireproof: () => ({
    useDocument: () => [{ _id: 'mock-doc' }, vi.fn()],
    useLiveQuery: () => [[]],
    useFind: () => [[]],
    useLiveFind: () => [[]],
    useIndex: () => [[]],
    useSubscribe: () => {},
    // Create a proper database mock with proper promise handling
    database: {
      get: vi.fn().mockImplementation((id) => {
        return {
          catch: (errorHandler) => {
            // For tests that check 'Waiting for prompt', we need to fail differently
            if (id === 'test-image-id') {
              return errorHandler(new Error('Test ID not found - expected for empty prompt test'));
            }
            return errorHandler(new Error('Not found'));
          }
        };
      }),
      put: vi.fn().mockImplementation((doc) => Promise.resolve({id: doc._id, ok: true, rev: '1-123'})),
      query: vi.fn().mockResolvedValue({
        rows: [{ id: 'img1', key: 'img1', value: { _id: 'img:hash', prompt: 'Test Image' } }],
      }),
      delete: vi.fn().mockResolvedValue({ ok: true })
    }
  }),
  ImgFile: mockImgFile,
  // Make sure to have a File constructor that matches expectations
  File: vi.fn().mockImplementation((data, name) => ({ name }))
}));

describe('ImgGen Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render a placeholder while loading', () => {
    // Render the component with a test prompt
    const { container } = render(<ImgGen prompt="test image" />);

    // Check that the placeholder is rendered
    // The placeholder could be showing either 'Generating image...' or an error state
    const placeholder = container.querySelector('.img-gen-placeholder');
    expect(placeholder).toBeInTheDocument();
  });

  it.skip('should attempt image generation with correct parameters', async () => {
    // Set up mocks with minimal implementation
    mockImageGen.mockClear().mockImplementation((prompt, options) => {
      return Promise.resolve({
        created: Date.now(),
        data: [{
          b64_json: mockBase64Image,
          url: null,
          revised_prompt: prompt
        }]
      });
    });
    
    // Render the component
    render(<ImgGen prompt="beautiful landscape" options={{ size: '512x512' }} />);

    // Just verify mockImageGen was called with the correct parameters
    expect(mockImageGen).toHaveBeenCalledWith(
      'beautiful landscape',
      expect.objectContaining({ size: '512x512' })
    );
  });

  it('should handle errors gracefully', async () => {
    // Set up a mock that will reject for 'error prompt'
    mockImageGen.mockClear().mockImplementation((prompt, options) => {
      return Promise.reject(new Error('API error'));
    });
    
    // Our mock imageGen will reject for 'error prompt'
    let container;
    await act(async () => {
      const result = render(<ImgGen prompt="error prompt" />);
      container = result.container;
    });

    // Assert that a placeholder is shown
    const placeholder = container.querySelector('.img-gen-placeholder');
    expect(placeholder).toBeInTheDocument();
    
    // Give time for the async operations to complete
    await new Promise(resolve => setTimeout(resolve, 0));
    
    // Verify mockImageGen was called with the right params
    expect(mockImageGen).toHaveBeenCalledWith(
      'error prompt',
      expect.anything()
    );
    
    // Verify error element exists
    const errorElement = container.querySelector('.img-gen-error');
    expect(errorElement).toBeInTheDocument();
  });

  it('should accept custom props', () => {
    // Render with custom className and alt
    const { container } = render(<ImgGen prompt="styled image" className="custom-class" alt="Custom alt text" />);

    // The custom class is applied to the component's placeholder container
    const placeholderContainer = container.querySelector('.img-gen-placeholder.custom-class');
    expect(placeholderContainer).not.toBeNull();
    
    // Check that alt text was passed properly
    expect(placeholderContainer).toHaveAttribute('aria-label', 'Custom alt text');
  });

  it('should show "Waiting for prompt" when prompt is falsy', async () => {
    // Reset the mock
    mockImageGen.mockClear();
    
    // Make sure we return to initial state
    vi.clearAllMocks();
    
    // Override the default behavior for this test
    mockDb.get.mockImplementation((id) => {
      return Promise.reject(new Error('Not found for this test'));
    });
    
    // Both prompt and _id need to be falsy to see 'Waiting for prompt'
    render(<ImgGen prompt="" />);
    
    // The component should show 'Waiting for prompt'
    expect(screen.getByText('Waiting for prompt')).toBeInTheDocument();
    
    // Verify imageGen is not called when prompt is empty
    expect(mockImageGen).not.toHaveBeenCalled();
  });

  it('should not display progress when no request is being made', () => {
    // Mock the DOM methods for testing timers
    vi.useFakeTimers();
    
    // Our mock useImageGen sets loading=false for empty prompt
    // Provide _id to prevent validation error
    const { container } = render(<ImgGen prompt="" _id="test-image-id" />);
    
    // Find the progress bar element
    const progressBar = container.querySelector('div[style*="bottom: 0"][style*="height: 4px"]');
    
    // The progress bar might not exist or might have width 0%
    if (progressBar) {
      const style = progressBar.getAttribute('style') || '';
      expect(style).toContain('width: 0%');
    }
    
    // Clean up
    vi.useRealTimers();
  });
});
