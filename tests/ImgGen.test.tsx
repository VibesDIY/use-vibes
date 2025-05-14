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

// Create mock database for Fireproof
const mockDb = vi.hoisted(() => ({
  get: vi.fn().mockImplementation((id) => Promise.reject(new Error('Not found'))),
  put: vi.fn().mockImplementation((doc) => Promise.resolve({...doc, _rev: '1-123'})),
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
vi.mock('call-ai', () => ({
  callAI: vi.fn(),
  imageGen: mockImageGen
}));

vi.mock('use-fireproof', () => ({
  useFireproof: () => ({
    useDocument: () => [{ _id: 'mock-doc' }, vi.fn()],
    useLiveQuery: () => [[]],
    useFind: () => [[]],
    useLiveFind: () => [[]],
    useIndex: () => [[]],
    useSubscribe: () => {},
    database: {
      put: mockDb.put,
      get: mockDb.get,
      query: vi.fn().mockResolvedValue({
        rows: [{ id: 'img1', key: 'img1', value: { _id: 'img:hash', prompt: 'Test Image' } }],
      }),
      delete: vi.fn().mockResolvedValue({ ok: true }),
    },
  }),
  ImgFile: mockImgFile
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
    render(<ImgGen prompt="test image" />);

    // Check that the placeholder is rendered
    expect(screen.getByText('Generating image...')).toBeInTheDocument();
  });

  it('should call imageGen with correct parameters', async () => {
    // Clear mocks before this test
    mockImageGen.mockClear();
    mockDb.get.mockClear();
    mockDb.put.mockClear();
    
    // Render the component with specific props
    render(<ImgGen prompt="beautiful landscape" options={{ size: '512x512' }} />);

    // Wait for the component to try to find the image in cache
    // and then call imageGen since it won't find it
    await waitFor(() => {
      expect(mockImageGen).toHaveBeenCalled();
    }, { timeout: 2000 });
    
    // Check that imageGen was called with the correct parameters
    expect(mockImageGen).toHaveBeenCalledWith(
      'beautiful landscape',
      expect.objectContaining({ size: '512x512' })
    );
  });
  it('should handle errors gracefully', async () => {
    // Our mock imageGen will reject for 'error prompt'
    render(<ImgGen prompt="error prompt" />);

    // Initially it should show generating image
    expect(screen.getByText('Generating image...')).toBeInTheDocument();
    
    // Error responses are handled gracefully and the component stays in loading state
    await waitFor(() => {
      // Verify imageGen was called with the error prompt
      expect(mockImageGen).toHaveBeenCalledWith(
        'error prompt',
        expect.anything()
      );
    }, { timeout: 1000 });
  });

  it('should accept custom props', () => {
    // Render with custom className and alt
    render(<ImgGen prompt="styled image" className="custom-class" alt="Custom alt text" />);

    // Check that props are passed properly
    expect(screen.getByText('Generating image...')).toBeInTheDocument();

    // The custom class is applied to the component's placeholder container
    const placeholderContainer = document.querySelector('.img-gen-placeholder.custom-class');
    expect(placeholderContainer).not.toBeNull();
    
    // Check that alt text was passed properly
    expect(placeholderContainer).toHaveAttribute('aria-label', 'Custom alt text');
  });

  it('should show "Waiting for prompt" when prompt is falsy', () => {
    // Reset the mock
    mockImageGen.mockClear();
    
    // Test with empty string prompt but provide _id to prevent validation error
    render(<ImgGen prompt="" _id="test-image-id" />);
    expect(screen.getByText('Waiting for prompt')).toBeInTheDocument();
    
    // Verify imageGen is not called when prompt is empty and _id is provided
    expect(mockImageGen).not.toHaveBeenCalled();
  });

  it('should not display a progress bar when no request is being made', () => {
    // Mock the DOM methods for testing timers
    vi.useFakeTimers();
    
    // Our mock useImageGen sets loading=false for empty prompt
    // Provide _id to prevent validation error
    render(<ImgGen prompt="" _id="test-image-id" />);
    
    // Find the progress bar element
    const progressBar = document.querySelector('div[style*="bottom: 0"][style*="height: 4px"]');
    expect(progressBar).toBeTruthy();
    
    // Get the style to confirm it has 0% width (no progress)
    const style = progressBar?.getAttribute('style') || '';
    expect(style).toContain('width: 0%');
    
    // Clean up
    vi.useRealTimers();
  });
});
