import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
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
  it('should show proper controls and classes', async () => {
    const mockProps = {
      promptText: 'Test prompt',
      editedPrompt: null,
      setEditedPrompt: vi.fn(),
      handlePromptEdit: vi.fn(),
      isDeleteConfirmOpen: false,
      handleDeleteConfirm: vi.fn(),
      handleCancelDelete: vi.fn(),
      handlePrevVersion: vi.fn(),
      handleNextVersion: vi.fn(),
      handleRegen: vi.fn(),
      versionIndex: 1,
      totalVersions: 3,
      showControls: true,
      showDelete: true,
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
    
    // In the actual implementation, the first click shows the confirmation, not triggers handleDeleteConfirm
    // The handleDeleteConfirm is only called when the button is clicked while confirmation is showing
    if (deleteButton) {
      // First click just shows confirmation message
      fireEvent.click(deleteButton);
      
      // Clicking again while confirmation is showing should call handleDeleteConfirm
      // But we can't test this here as the internal state is managed by ControlsBar
      // This would be better tested in the ControlsBar test
    }
    
    // Note: We would normally test the timeout functionality using vi.useFakeTimers()

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
      isDeleteConfirmOpen: true, // Set this to true to show confirmation
      handleDeleteConfirm: vi.fn(),
      handleCancelDelete: vi.fn(),
      handlePrevVersion: vi.fn(),
      handleNextVersion: vi.fn(),
      handleRegen: vi.fn(),
      versionIndex: 1,
      totalVersions: 3,
      showDelete: true,
    };

    // Render the ImageOverlay component directly with delete confirm open
    const { container } = render(<ImageOverlay {...mockProps} />);

    // The delete confirmation message should be visible
    const confirmationOverlay = container.querySelector('.imggen-delete-message');
    expect(confirmationOverlay).toBeInTheDocument();
    
    // It should show the confirmation message
    expect(confirmationOverlay).toHaveTextContent('Confirm delete? This action cannot be undone.');
    
    // Click on the message should confirm the delete action
    if (confirmationOverlay) {
      fireEvent.click(confirmationOverlay);
      expect(mockProps.handleDeleteConfirm).toHaveBeenCalled();
    }
  });

  // Test the delete confirmation component directly
  it('should call the correct handler when clicking on the message', () => {
    // Mock the delete callback function
    const mockDeleteConfirmFn = vi.fn();
    const mockCancelDeleteFn = vi.fn();
    
    // Set up fake timers to test the auto-cancel timeout
    vi.useFakeTimers();

    // Render the DeleteConfirmationOverlay component directly
    const { getByText } = render(
      <DeleteConfirmationOverlay
        handleDeleteConfirm={mockDeleteConfirmFn}
        handleCancelDelete={mockCancelDeleteFn}
      />
    );

    // Find and click the confirmation message
    const confirmMessage = getByText(/confirm delete\? this action cannot be undone\./i);
    fireEvent.click(confirmMessage);

    // Verify that the delete callback was called
    expect(mockDeleteConfirmFn).toHaveBeenCalled();
    expect(mockCancelDeleteFn).not.toHaveBeenCalled();
    
    // Cleanup fake timers
    vi.useRealTimers();
  });

  // Test auto-dismissal of the confirmation overlay
  it('should automatically call the cancel handler after timeout', () => {
    // Mock the handlers
    const mockDeleteConfirmFn = vi.fn();
    const mockCancelDeleteFn = vi.fn();

    // Set up fake timers to test the auto-cancel timeout
    vi.useFakeTimers();

    // Render the DeleteConfirmationOverlay component directly
    render(
      <DeleteConfirmationOverlay
        handleDeleteConfirm={mockDeleteConfirmFn}
        handleCancelDelete={mockCancelDeleteFn}
      />
    );

    // Advance timers by 3 seconds (timeout duration)
    vi.advanceTimersByTime(3000);

    // Verify that the cancel callback was called after the timeout
    expect(mockCancelDeleteFn).toHaveBeenCalled();
    expect(mockDeleteConfirmFn).not.toHaveBeenCalled();
    
    // Cleanup fake timers
    vi.useRealTimers();
  });
});
