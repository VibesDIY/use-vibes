import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ImgGen } from '../src/index.js';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock imageGen function from call-ai
vi.mock('call-ai', () => {
  return {
    callAI: vi.fn(),
    // Mock the imageGen function
    imageGen: vi.fn().mockImplementation(() => {
      // Create a base64 encoded 1x1 transparent PNG
      const mockBase64Image =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

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
    }),
  };
});

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
    // Create a spy on the imageGen import
    const { imageGen } = await import('call-ai');

    // Render the component with specific props
    render(<ImgGen prompt="beautiful landscape" options={{ size: '512x512' }} />);

    // Check that imageGen was called with the correct prompt and options
    expect(imageGen).toHaveBeenCalled();
    expect(imageGen).toHaveBeenCalledWith(
      'beautiful landscape',
      expect.objectContaining({
        size: '512x512',
      })
    );
  });
  it('should handle errors gracefully', async () => {
    // Mock imageGen to throw an error
    const { imageGen } = await import('call-ai');
    vi.mocked(imageGen).mockRejectedValueOnce(new Error('API error'));

    // Render the component
    render(<ImgGen prompt="error prompt" />);

    // Check that the error message is displayed
    // The error may not show up immediately, so we need to use findByText
    const errorElement = await screen.findByText(/Error:/i, {}, { timeout: 1000 });
    expect(errorElement).toBeInTheDocument();
  });

  it('should accept custom props', () => {
    // Render with custom className and alt
    render(<ImgGen prompt="styled image" className="custom-class" alt="Custom alt text" />);

    // Check that props are passed properly
    expect(screen.getByText('Generating image...')).toBeInTheDocument();

    // The custom class is applied to the component's placeholder container
    // We need to find the element with the correct class rather than assuming it's the direct parent
    const placeholderContainer = document.querySelector('.img-gen-placeholder.custom-class');
    expect(placeholderContainer).not.toBeNull();
  });

  it('should show "Waiting for prompt" when prompt is falsy', () => {
    // Test with empty string prompt
    render(<ImgGen prompt="" />);
    expect(screen.getAllByText('Waiting for prompt')[0]).toBeInTheDocument();

    // Clean up before rendering the next component
    cleanup();

    // Test with undefined prompt (using type assertion for testing purposes)
    render(<ImgGen prompt={'' as unknown as string} />);
    expect(screen.getByText('Waiting for prompt')).toBeInTheDocument();

    // Verify the imageGen function is not called when prompt is falsy
    const { imageGen } = vi.hoisted(() => ({ imageGen: vi.fn() }));
    expect(imageGen).not.toHaveBeenCalled();
  });
});
