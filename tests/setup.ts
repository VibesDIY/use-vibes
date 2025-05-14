import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Set up global mocks or test configuration here
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Setup any global mocks that need to be available for all tests
