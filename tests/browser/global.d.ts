// Type declarations for dynamic imports in browser tests
declare module '../../../src/index.js' {
  export interface UseVibesConfig {
    prompt: string;
    // Add more configuration options as needed
  }

  export interface VibesApp {
    container: HTMLElement;
    database?: Record<string, unknown>;
  }

  export function useVibes(target: string | HTMLElement, config: UseVibesConfig): Promise<VibesApp>;
}

// Global declaration for the IIFE bundle
interface UseVibesConfig {
  prompt: string;
  // Add more configuration options as needed
}

interface VibesApp {
  container: HTMLElement;
  database?: Record<string, unknown>;
}

// Declare the global useVibes function
declare function useVibes(target: string | HTMLElement, config: UseVibesConfig): Promise<VibesApp>;

// Declare the window.useVibes property and our mock-related properties
interface Window {
  useVibes: typeof useVibes;
  // For mocking in tests
  _originalFetch: typeof fetch;
  CALLAI_API_KEY?: string;
}
