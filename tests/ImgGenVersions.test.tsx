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

describe('ImgGenDisplay with New Document Structure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Test that the component correctly displays the current prompt from the new document structure
  it('should display the current prompt text from the prompts structure', () => {
    // Create a mock document with the new prompts structure
    const mockDocument = {
      _id: 'test-image-id',
      _files: {
        v1: new File(['test'], 'test-image.png', { type: 'image/png' }),
      },
      prompts: {
        p1: { text: 'This is a test prompt from new structure', created: 1620000000000 },
      },
      currentPromptKey: 'p1',
      versions: [{ id: 'v1', created: 1620000000000, promptKey: 'p1' }],
      currentVersion: 0, // 0-based index
    };

    // Render the component
    const { container } = render(
      <ImgGenDisplay document={mockDocument} className="test-class" alt="" />
    );

    // Open the overlay to see the prompt text
    const infoButton = container.querySelector('[aria-label="Image information"]');
    expect(infoButton).toBeInTheDocument();
    if (infoButton) {
      fireEvent.click(infoButton);
    }

    // Verify the prompt text from the new structure is displayed
    expect(container.textContent).toContain('This is a test prompt from new structure');
  });

  // Test for the refresh button functionality with new document structure
  it('should call onRefresh when refresh button is clicked', () => {
    // Mock the refresh callback function
    const mockRefreshFn = vi.fn();

    // Create a mock document with the new structure
    const mockDocument = {
      _id: 'test-image-id',
      _files: {
        v1: new File(['test'], 'test-image.png', { type: 'image/png' }),
        v2: new File(['test2'], 'test-image-2.png', { type: 'image/png' }),
      },
      prompts: {
        p1: { text: 'test prompt', created: 1620000000000 },
      },
      currentPromptKey: 'p1',
      versions: [
        { id: 'v1', created: 1620000000000, promptKey: 'p1' },
        { id: 'v2', created: 1620000001000, promptKey: 'p1' },
      ],
      currentVersion: 1, // 0-based index
    };

    // Render the ImgGenDisplay component with onRefresh callback
    const { container } = render(
      <ImgGenDisplay
        document={mockDocument}
        className="test-class"
        alt="Test image alt text"
        onRefresh={mockRefreshFn}
      />
    );

    // First click the info button to open the overlay
    const infoButton = container.querySelector('[aria-label="Image information"]');
    expect(infoButton).toBeInTheDocument();
    if (infoButton) {
      fireEvent.click(infoButton);
    }

    // Find the refresh button
    const refreshButton = container.querySelector('[aria-label="Generate new version"]');
    expect(refreshButton).toBeInTheDocument();

    // Click the refresh button
    if (refreshButton) {
      fireEvent.click(refreshButton);
    }

    // Verify that the refresh callback was called with the document id
    expect(mockRefreshFn).toHaveBeenCalledWith('test-image-id');
  });

  // Test version navigation for multiple versions
  it('should allow navigation between versions', () => {
    // Create a mock document with multiple versions
    const mockDocument = {
      _id: 'test-multi-version',
      _files: {
        v1: new File(['test1'], 'version1.png', { type: 'image/png' }),
        v2: new File(['test2'], 'version2.png', { type: 'image/png' }),
        v3: new File(['test3'], 'version3.png', { type: 'image/png' }),
      },
      prompts: {
        p1: { text: 'original prompt', created: 1620000000000 },
        p2: { text: 'modified prompt', created: 1620000002000 },
      },
      currentPromptKey: 'p1',
      versions: [
        { id: 'v1', created: 1620000000000, promptKey: 'p1' },
        { id: 'v2', created: 1620000001000, promptKey: 'p1' },
        { id: 'v3', created: 1620000002000, promptKey: 'p2' },
      ],
      currentVersion: 1, // Second version (0-based index)
    };

    // Render the component
    const { container } = render(
      <ImgGenDisplay document={mockDocument} className="test-class" alt="" />
    );

    // Open the overlay to access version navigation
    const infoButton = container.querySelector('[aria-label="Image information"]');
    expect(infoButton).toBeInTheDocument();
    fireEvent.click(infoButton!);

    // Check that we're initially on version 2 of 3
    const versionIndicator = container.querySelector('.version-indicator');
    expect(versionIndicator).toBeInTheDocument();
    expect(versionIndicator?.textContent).toContain('2 / 3');

    // Move to the next version (v3)
    const nextButton = container.querySelector('[aria-label="Next version"]');
    expect(nextButton).toBeInTheDocument();
    fireEvent.click(nextButton!);

    // Check that we're now on version 3 of 3 and it shows custom prompt indicator
    expect(versionIndicator?.textContent).toContain('3 / 3');
    expect(versionIndicator?.textContent).toContain('Custom prompt');

    // Move back to previous version
    const prevButton = container.querySelector('[aria-label="Previous version"]');
    expect(prevButton).toBeInTheDocument();
    fireEvent.click(prevButton!);

    // Check that we're back to version 2 of 3
    expect(versionIndicator?.textContent).toContain('2 / 3');
    expect(versionIndicator?.textContent).not.toContain('Custom prompt');
  });
});
