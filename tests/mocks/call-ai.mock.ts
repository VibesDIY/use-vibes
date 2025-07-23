// Mock implementation for call-ai module
import { vi } from 'vitest';

// Mock base64 image for testing
const mockBase64Image =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// Mock image generation function
export const imageGen = vi.fn().mockImplementation((prompt) => {
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
});

// Mock text generation function
export const callAI = vi.fn().mockImplementation((prompt) => {
  if (prompt === 'error prompt') {
    return Promise.reject(new Error('API error'));
  }

  return Promise.resolve({
    created: Date.now(),
    choices: [
      {
        message: {
          content: 'Mocked AI response',
          role: 'assistant',
        },
      },
    ],
  });
});

// Export all other types and interfaces from the original module
export interface ImageGenOptions {
  size?: string;
  style?: string;
  model?: string;
  n?: number;
  quality?: string;
  [key: string]: string | number | boolean | undefined;
}

export interface ImageResponse {
  created: number;
  data: {
    b64_json?: string;
    url?: string | null;
    revised_prompt?: string;
  }[];
  error?: string;
}
