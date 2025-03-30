import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useVibes } from '../src/index.js';

// Mock the call-ai module for testing
vi.mock('call-ai', () => {
  return {
    callAI: vi.fn().mockImplementation((prompt, options) => {
      if (options?.stream === false) {
        // Extract prompt content for the mock response
        let promptText = 'Test prompt';
        if (typeof prompt === 'string' && prompt.includes('request:')) {
          promptText = prompt.split('request:')[1].split('\n')[0].trim();
        }

        // Create a properly formatted mock response that matches the schema
        const mockResponse = JSON.stringify({
          html: `<div>🎭 Vibes received prompt: "${promptText}"</div>`,
          explanation: 'This is a mock explanation from the test',
        });

        return Promise.resolve(mockResponse);
      }

      // For any other case
      return 'Direct response';
    }),
  };
});

// Setup test DOM elements before each test
beforeEach(() => {
  // Reset the body content
  document.body.innerHTML = '';

  // Create test elements
  const target = document.createElement('div');
  target.id = 'target';
  document.body.appendChild(target);

  const targetAlt = document.createElement('div');
  targetAlt.id = 'target-alt';
  document.body.appendChild(targetAlt);
});

describe('useVibes function', () => {
  it('should accept a string selector and apply changes to the target element', async () => {
    const result = await useVibes('#target', { prompt: 'Test prompt' });
    expect(result.container).toBeDefined();
    expect(result.container.innerHTML).toContain('Vibes received prompt: "Test prompt"');
  });

  it('should accept an HTMLElement directly', async () => {
    const targetElement = document.getElementById('target');
    if (!targetElement) throw new Error('Test setup failed: target element not found');
    const result = await useVibes(targetElement, { prompt: 'Direct element test' });
    expect(result.container).toBe(targetElement);
    expect(result.container.innerHTML).toContain('Vibes received prompt: "Direct element test"');
  });

  it('should reject with an error when target element not found', async () => {
    await expect(useVibes('#non-existent', { prompt: 'Test' })).rejects.toThrow(
      'Target element not found: #non-existent'
    );
  });

  it('should return an object with the expected interface properties', async () => {
    const result = await useVibes('#target', { prompt: 'Interface test' });
    expect(result).toHaveProperty('container');
    expect(result).toHaveProperty('database');
    expect(result.database).toBeUndefined(); // Currently undefined in the implementation
  });
});
