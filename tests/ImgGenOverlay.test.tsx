import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

// Use vi.hoisted to define mocks that need to be referenced in vi.mock
const mockImgFile = vi.hoisted(() =>
  vi.fn().mockImplementation(({ className, alt, style }) => {
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

describe('ImgGenDisplay Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Test that fullscreen mode shows controls and delete option
  it('should show fullscreen modal when image is clicked', () => {
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

    // Find the image element
    const imgElement = container.querySelector('[data-testid="mock-img-file"]');
    expect(imgElement).toBeInTheDocument();

    // Click the image to open fullscreen
    if (imgElement) {
      fireEvent.click(imgElement);
    }

    // The fullscreen modal backdrop should now be visible
    const backdrop = document.querySelector('.imggen-backdrop');
    expect(backdrop).toBeInTheDocument();
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

    // First click the image to open the fullscreen modal
    const imgElement = container.querySelector('[data-testid="mock-img-file"]');
    if (imgElement) {
      fireEvent.click(imgElement);
    }
    
    // Now find the delete button which is visible in the fullscreen modal
    const deleteButton = document.querySelector('[aria-label="Delete image"]');
    expect(deleteButton).toBeInTheDocument();

    // Click the delete button
    if (deleteButton) {
      fireEvent.click(deleteButton);
    }

    // The delete confirmation overlay should now be visible
    const confirmationOverlay = document.querySelector('.delete-confirmation-overlay');
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

    // First click the image to open the fullscreen modal
    const imgElement = container.querySelector('[data-testid="mock-img-file"]');
    if (imgElement) {
      fireEvent.click(imgElement);
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
