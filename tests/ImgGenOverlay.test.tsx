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
  File: vi.fn().mockImplementation((data, name, options) => ({ name, type: options?.type })),
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
        image: new File(['test'], 'test-image.png', { type: 'image/png' }),
      },
    };

    // Render the ImgGenDisplay component
    const { container } = render(
      <ImgGenDisplay document={mockDocument} className="test-class" alt="Test image alt text" />
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
        image: new File(['test'], 'test-image.png', { type: 'image/png' }),
      },
    };

    // Render the ImgGenDisplay component
    const { container } = render(
      <ImgGenDisplay document={mockDocument} className="test-class" alt="Test image alt text" />
    );

    // Find the info button
    const infoButton = container.querySelector('[aria-label="Image information"]');
    expect(infoButton).toBeInTheDocument();

    // Click the info button
    if (infoButton) {
      fireEvent.click(infoButton);
    }

    // The overlay should now be visible
    const overlay = container.querySelector('.img-gen-overlay');
    expect(overlay).toBeInTheDocument();
  });

  // Test for the delete button and confirmation overlay
  it('should show delete confirmation when delete button is clicked', () => {
    // Mock the delete callback function
    const mockDeleteFn = vi.fn();

    // Create a mock document with an image file
    const mockDocument = {
      _id: 'test-image-id',
      _files: {
        image: new File(['test'], 'test-image.png', { type: 'image/png' }),
      },
      prompt: 'Test prompt for image',
    };

    // Render the ImgGenDisplay component with the delete callback
    const { container } = render(
      <ImgGenDisplay
        document={mockDocument}
        className="test-class"
        alt="Test image alt text"
        onDelete={mockDeleteFn}
      />
    );

    // First click the info button to open the overlay
    const infoButton = container.querySelector('[aria-label="Image information"]');
    expect(infoButton).toBeInTheDocument();
    if (infoButton) {
      fireEvent.click(infoButton);
    }

    // Now find the delete button (✕) which is only visible when overlay is open
    const deleteButton = container.querySelector('[aria-label="Delete image"]');
    expect(deleteButton).toBeInTheDocument();

    // Click the delete button
    if (deleteButton) {
      fireEvent.click(deleteButton);
    }

    // The delete confirmation overlay should now be visible
    const confirmationOverlay = container.querySelector('.delete-confirmation-overlay');
    expect(confirmationOverlay).toBeInTheDocument();

    // It should contain confirmation text
    expect(screen.getByText(/Are you sure/i)).toBeInTheDocument();

    // It should have confirm and cancel buttons
    const confirmButton = screen.getByRole('button', { name: /confirm/i });
    const cancelButton = screen.getByRole('button', { name: /cancel/i });

    expect(confirmButton).toBeInTheDocument();
    expect(cancelButton).toBeInTheDocument();
  });

  // Test the delete confirmation actions
  it('should call delete function when confirmation is confirmed', () => {
    // Mock the delete callback function
    const mockDeleteFn = vi.fn();

    // Create a mock document with an image file
    const mockDocument = {
      _id: 'test-image-id',
      _files: {
        image: new File(['test'], 'test-image.png', { type: 'image/png' }),
      },
    };

    // Render the ImgGenDisplay component with the delete callback
    const { container } = render(
      <ImgGenDisplay
        document={mockDocument}
        className="test-class"
        alt="Test image alt text"
        onDelete={mockDeleteFn}
      />
    );

    // First click the info button to open the overlay
    const infoButton = container.querySelector('[aria-label="Image information"]');
    expect(infoButton).toBeInTheDocument();
    if (infoButton) {
      fireEvent.click(infoButton);
    }

    // Find and click the delete button
    const deleteButton = container.querySelector('[aria-label="Delete image"]');
    if (deleteButton) {
      fireEvent.click(deleteButton);
    }

    // Find and click the confirm button
    const confirmButton = screen.getByRole('button', { name: /confirm/i });
    fireEvent.click(confirmButton);

    // Verify that the delete callback was called with the document ID
    expect(mockDeleteFn).toHaveBeenCalledWith('test-image-id');

    // The confirmation overlay should be closed
    const confirmationOverlay = container.querySelector('.delete-confirmation-overlay');
    expect(confirmationOverlay).not.toBeInTheDocument();
  });

  // Test that cancel button closes the confirmation without deleting
  it('should close the confirmation overlay when cancel is clicked', () => {
    // Mock the delete callback function
    const mockDeleteFn = vi.fn();

    // Create a mock document with an image file
    const mockDocument = {
      _id: 'test-image-id',
      _files: {
        image: new File(['test'], 'test-image.png', { type: 'image/png' }),
      },
    };

    // Render the ImgGenDisplay component with the delete callback
    const { container } = render(
      <ImgGenDisplay
        document={mockDocument}
        className="test-class"
        alt="Test image alt text"
        onDelete={mockDeleteFn}
      />
    );

    // First click the info button to open the overlay
    const infoButton = container.querySelector('[aria-label="Image information"]');
    expect(infoButton).toBeInTheDocument();
    if (infoButton) {
      fireEvent.click(infoButton);
    }

    // Find and click the delete button
    const deleteButton = container.querySelector('[aria-label="Delete image"]');
    if (deleteButton) {
      fireEvent.click(deleteButton);
    }

    // Find and click the cancel button
    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelButton);

    // Verify that the delete callback was NOT called
    expect(mockDeleteFn).not.toHaveBeenCalled();

    // The confirmation overlay should be closed
    const confirmationOverlay = container.querySelector('.delete-confirmation-overlay');
    expect(confirmationOverlay).not.toBeInTheDocument();
  });
});
