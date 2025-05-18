import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// Use vi.hoisted to define mocks that need to be referenced in vi.mock
const mockImgFile = vi.hoisted(() =>
  vi.fn().mockImplementation(({ className, alt, style, ...rest }) => {
    return React.createElement(
      'div',
      {
        'data-testid': 'mock-img-file',
        className: `img-file ${className || ''}`,
        style,
        'aria-label': alt,
        ...rest,
        onClick: rest.onClick || (() => {})
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
import { ImageOverlay } from '../src/components/ImgGenUtils/overlays/ImageOverlay';
import { DeleteConfirmationOverlay } from '../src/components/ImgGenUtils/overlays/DeleteConfirmationOverlay';

describe('ImageOverlay Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Test that controls are properly displayed
  it('should show proper controls and classes', () => {
    const mockProps = {
      promptText: 'Test prompt',
      editedPrompt: null,
      setEditedPrompt: vi.fn(),
      handlePromptEdit: vi.fn(),
      toggleDeleteConfirm: vi.fn(),
      isDeleteConfirmOpen: false,
      handleDeleteConfirm: vi.fn(),
      handleCancelDelete: vi.fn(),
      handlePrevVersion: vi.fn(),
      handleNextVersion: vi.fn(),
      handleRefresh: vi.fn(),
      versionIndex: 1,
      totalVersions: 3,
      showControls: true,
      insideModal: true,
      progress: 100
    };

    // Render the ImageOverlay component directly
    const { container } = render(<ImageOverlay {...mockProps} />);

    // Check that the prompt text is displayed
    expect(container.textContent).toContain('Test prompt');

    // Check for the delete button
    const deleteButton = container.querySelector('[aria-label="Delete image"]');
    expect(deleteButton).toBeInTheDocument();
    expect(deleteButton).toHaveClass('imggen-button');
    expect(deleteButton).toHaveClass('imggen-delete-button');

    // Check for version navigation
    const prevButton = container.querySelector('[aria-label="Previous version"]');
    const nextButton = container.querySelector('[aria-label="Next version"]');
    const refreshButton = container.querySelector('[aria-label="Generate new version"]');
    
    expect(prevButton).toBeInTheDocument();
    expect(nextButton).toBeInTheDocument();
    expect(refreshButton).toBeInTheDocument();
    
    // Check for version indicator
    const versionIndicator = container.querySelector('.version-indicator');
    expect(versionIndicator).toBeInTheDocument();
    expect(versionIndicator?.textContent).toContain('2 / 3');
  });

  // Test that delete confirmation appears when isDeleteConfirmOpen is true
  it('should show delete confirmation when isDeleteConfirmOpen is true', () => {
    const mockProps = {
      promptText: 'Test prompt',
      editedPrompt: null,
      setEditedPrompt: vi.fn(),
      handlePromptEdit: vi.fn(),
      toggleDeleteConfirm: vi.fn(),
      isDeleteConfirmOpen: true, // Set this to true to show confirmation
      handleDeleteConfirm: vi.fn(),
      handleCancelDelete: vi.fn(),
      handlePrevVersion: vi.fn(),
      handleNextVersion: vi.fn(),
      handleRefresh: vi.fn(),
      versionIndex: 1,
      totalVersions: 3,
      insideModal: true,
    };

    // Render the ImageOverlay component directly with delete confirm open
    const { container } = render(<ImageOverlay {...mockProps} />);

    // The delete confirmation overlay should be visible
    const confirmationOverlay = container.querySelector('.imggen-delete-message');
    expect(confirmationOverlay).toBeInTheDocument();
    
    // Check that it has the confirmation buttons
    const confirmButton = screen.getByRole('button', { name: 'Confirm delete' });
    const cancelButton = screen.getByRole('button', { name: 'Cancel delete' });
    expect(confirmButton).toBeInTheDocument();
    expect(cancelButton).toBeInTheDocument();
  });

  // Test the delete confirmation component directly
  it('should call the correct handler when confirmation is confirmed', () => {
    // Mock the delete callback function
    const mockDeleteConfirmFn = vi.fn();
    const mockCancelDeleteFn = vi.fn();

    // Render the DeleteConfirmationOverlay component directly
    const { getByRole } = render(
      <DeleteConfirmationOverlay
        handleDeleteConfirm={mockDeleteConfirmFn}
        handleCancelDelete={mockCancelDeleteFn}
      />
    );

    // Find and click the confirm button
    const confirmButton = getByRole('button', { name: /confirm/i });
    fireEvent.click(confirmButton);

    // Verify that the delete callback was called
    expect(mockDeleteConfirmFn).toHaveBeenCalled();
    expect(mockCancelDeleteFn).not.toHaveBeenCalled();
  });

  // Test cancel button in the confirmation overlay
  it('should call the cancel handler when cancel is clicked', () => {
    // Mock the handlers
    const mockDeleteConfirmFn = vi.fn();
    const mockCancelDeleteFn = vi.fn();

    // Render the DeleteConfirmationOverlay component directly
    const { getByRole } = render(
      <DeleteConfirmationOverlay
        handleDeleteConfirm={mockDeleteConfirmFn}
        handleCancelDelete={mockCancelDeleteFn}
      />
    );

    // Find and click the cancel button
    const cancelButton = getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelButton);

    // Verify that the cancel callback was called and delete was not
    expect(mockCancelDeleteFn).toHaveBeenCalled();
    expect(mockDeleteConfirmFn).not.toHaveBeenCalled();
  });
});
