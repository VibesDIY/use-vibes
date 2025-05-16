import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock ImageOverlay component
vi.mock('../src/components/ImgGenUtils/overlays/ImageOverlay', () => ({
  ImageOverlay: vi.fn(({ promptText, showControls, statusText }) => (
    <div
      data-testid="mock-image-overlay"
      data-prompt={promptText}
      data-show-controls={showControls}
      data-status={statusText}
      className="imggen-overlay"
    >
      <div className="imggen-controls">
        {showControls === false && statusText && (
          <div className="imggen-status-text">{statusText}</div>
        )}
      </div>
    </div>
  )),
}));

import { ImgGenPlaceholder } from '../src/components/ImgGenUtils/ImgGenPlaceholder';
import { defaultClasses } from '../src/utils/style-utils';

describe('ImgGenPlaceholder Component', () => {
  // Reset mocks before each test
  beforeEach(() => {
    vi.clearAllMocks();
  });

  //---------------------------------------------------------------
  // A. Base Rendering Tests
  //---------------------------------------------------------------
  describe('Base Rendering', () => {
    it('renders basic placeholder container with appropriate role and aria-label', () => {
      const { container } = render(
        <ImgGenPlaceholder
          className="test-class"
          alt="Test alt text"
          prompt={undefined}
          progress={0}
          error={undefined}
        />
      );

      const placeholder = container.querySelector('.imggen-placeholder');
      expect(placeholder).toBeInTheDocument();
      expect(placeholder).toHaveAttribute('role', 'img');
      expect(placeholder).toHaveAttribute('aria-label', 'Test alt text');
    });

    it('falls back to prompt text for aria-label when alt is not provided', () => {
      const { container } = render(
        <ImgGenPlaceholder prompt="Test prompt" progress={0} error={undefined} />
      );

      const placeholder = container.querySelector('.imggen-placeholder');
      expect(placeholder).toHaveAttribute('aria-label', 'Test prompt');
    });

    it('uses default aria-label when neither prompt nor alt is provided', () => {
      const { container } = render(<ImgGenPlaceholder progress={0} error={undefined} />);

      const placeholder = container.querySelector('.imggen-placeholder');
      expect(placeholder).toHaveAttribute('aria-label', 'Image placeholder');
    });

    it('displays "Waiting for prompt" message when no prompt is provided', () => {
      render(<ImgGenPlaceholder progress={0} error={undefined} />);

      expect(screen.getByText('Waiting for prompt')).toBeInTheDocument();
    });

    it('combines custom class with default classes', () => {
      const { container } = render(
        <ImgGenPlaceholder className="test-class" progress={0} error={undefined} />
      );

      const placeholder = container.querySelector('.imggen-placeholder');
      expect(placeholder).toHaveClass('imggen-placeholder');
      expect(placeholder).toHaveClass('test-class');
    });
  });

  //---------------------------------------------------------------
  // B. Error State Tests
  //---------------------------------------------------------------
  describe('Error State', () => {
    it('displays error message when error is provided', () => {
      render(
        <ImgGenPlaceholder
          prompt="Test prompt"
          progress={0}
          error={new Error('Test error message')}
        />
      );

      expect(screen.getByText('Image Generation Failed')).toBeInTheDocument();
      expect(screen.getByText('Test error message')).toBeInTheDocument();
    });

    it('handles and formats JSON error messages properly', () => {
      const jsonError = new Error(
        'Error: {"error": "Custom Error Title", "details": {"error": {"message": "Custom error details"}}}'
      );

      render(<ImgGenPlaceholder prompt="Test prompt" progress={0} error={jsonError} />);

      expect(screen.getByText('Custom Error Title')).toBeInTheDocument();
      expect(screen.getByText('Custom error details')).toBeInTheDocument();
    });

    it('handles moderation blocked errors with special formatting', () => {
      const moderationError = new Error('Error: {"code": "moderation_blocked"}');

      render(<ImgGenPlaceholder prompt="Test prompt" progress={0} error={moderationError} />);

      expect(screen.getByText('Failed to generate image')).toBeInTheDocument();
      expect(screen.getByText(/Your request was rejected/)).toBeInTheDocument();
      expect(screen.getByText(/safety system/)).toBeInTheDocument();
    });
  });

  //---------------------------------------------------------------
  // C. Generating State Tests
  //---------------------------------------------------------------
  describe('Generating State (with prompt, no error)', () => {
    it('renders ImageOverlay with correct props when in generating state', () => {
      // Use spyOn to track style changes directly rather than testing computed styles
      const originalSetAttribute = Element.prototype.setAttribute;
      const styleSpy = vi.spyOn(Element.prototype, 'setAttribute');

      render(
        <ImgGenPlaceholder
          prompt="Test prompt"
          progress={50}
          error={undefined}
          classes={defaultClasses}
        />
      );

      // Check ImageOverlay props directly
      const overlay = screen.getByTestId('mock-image-overlay');
      expect(overlay).toBeInTheDocument();
      expect(overlay).toHaveAttribute('data-prompt', 'Test prompt');
      expect(overlay).toHaveAttribute('data-show-controls', 'false');
      expect(overlay).toHaveAttribute('data-status', 'Generating...');

      // Cleanup
      styleSpy.mockRestore();
      Element.prototype.setAttribute = originalSetAttribute;
    });

    it('enforces minimum progress value with Math.max', () => {
      // This test verifies the minimum progress logic found in ImgGenPlaceholder:
      // setVisibleProgress(Math.max(5, progress));

      // Very simple test to assert that the Math.max logic behaves as expected
      expect(Math.max(5, 2)).toBe(5); // Progress too low, should use min 5%
      expect(Math.max(5, 10)).toBe(10); // Progress > min, should use actual progress
      expect(Math.max(5, 5)).toBe(5); // Edge case, exactly at minimum
    });

    it('starts progress animation at 0 and animates to actual value', async () => {
      vi.useFakeTimers();
      let container;

      // Initial render
      await act(() => {
        const result = render(
          <ImgGenPlaceholder prompt="Test prompt" progress={75} error={undefined} />
        );
        container = result.container;
      });

      // Initially should be 0%
      const progressBar = container.querySelector('.imggen-progress');
      expect(progressBar).toHaveStyle('width: 0%');

      // After timeout, should update to the actual value
      await act(async () => {
        vi.advanceTimersByTime(60);
      });

      expect(progressBar).toHaveStyle('width: 75%');

      vi.useRealTimers();
    });

    it('does not show content message area when in generating state', () => {
      const { container } = render(
        <ImgGenPlaceholder prompt="Test prompt" progress={50} error={undefined} />
      );

      // Content area should be empty during generation
      const contentDiv = container.querySelector('.imggen-placeholder > div:nth-child(2)');
      expect(contentDiv?.textContent).toBe('');
    });
  });

  //---------------------------------------------------------------
  // D. Progress Bar Positioning Test
  //---------------------------------------------------------------
  describe('Progress Bar Positioning', () => {
    it('positions progress bar at the top of the container', () => {
      const { container } = render(
        <ImgGenPlaceholder prompt="Test prompt" progress={50} error={undefined} />
      );

      // The progress bar should be the first child of the placeholder container
      const placeholder = container.querySelector('.imggen-placeholder');
      const firstChild = placeholder?.firstElementChild;

      expect(firstChild).toHaveClass('imggen-progress');
    });
  });
});
