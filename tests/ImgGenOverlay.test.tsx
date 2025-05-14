import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

// Use vi.hoisted to define mocks that need to be referenced in vi.mock
const mockImgFile = vi.hoisted(() =>
  vi.fn().mockImplementation(({ file, className, alt, style }) => {
    return React.createElement(
      'div',
      {
        'data-testid': 'mock-img-file',
        className: `img-file ${className || ''}`,
        style,
        'aria-label': alt,
      },
      'Image Content'
    );
  })
);

// Mock use-fireproof module (placed before imports that use it)
vi.mock('use-fireproof', () => ({
  ImgFile: mockImgFile,
  // Mock File constructor for tests
  File: vi.fn().mockImplementation((data, name, options) => ({ name, type: options?.type }))
}));

// Import the components directly to test them individually
import { ImgGenDisplay } from '../src/components/ImgGenUtils';
import type { DocFileMeta } from 'use-fireproof';

describe('ImgGenDisplay Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Initial test to verify info button is visible in READY state
  it('should show info button when image is displayed', () => {
    // Create a mock document with an image file
    const mockDocument = {
      _id: 'test-image-id',
      _files: {
        image: new File(['test'], 'test-image.png', { type: 'image/png' })
      }
    };

    // Render the ImgGenDisplay component
    const { container } = render(
      <ImgGenDisplay 
        document={mockDocument} 
        className="test-class" 
        alt="Test image alt text" 
      />
    );

    // The info button should be available with aria-label
    const infoButton = container.querySelector('[aria-label="Image information"]');
    expect(infoButton).toBeInTheDocument();
  });

  // Test that clicking the info button shows the overlay
  it('should show the overlay when info button is clicked', () => {
    // Create a mock document with an image file
    const mockDocument = {
      _id: 'test-image-id',
      _files: {
        image: new File(['test'], 'test-image.png', { type: 'image/png' })
      }
    };

    // Render the ImgGenDisplay component
    const { container } = render(
      <ImgGenDisplay 
        document={mockDocument} 
        className="test-class" 
        alt="Test image alt text" 
      />
    );

    // Find the info button
    const infoButton = container.querySelector('[aria-label="Image information"]');
    expect(infoButton).toBeInTheDocument();

    // Click the info button
    if (infoButton) {
      fireEvent.click(infoButton);
    }

    // The overlay should now be visible
    // We expect this test to fail until we implement the overlay functionality
    const overlay = container.querySelector('.img-gen-overlay');
    expect(overlay).toBeInTheDocument();
  });
});
