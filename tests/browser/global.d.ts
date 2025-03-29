// Type declarations for dynamic imports in browser tests
declare module '../../../src/index.js' {
  export interface UseVibesConfig {
    effect?: (element: HTMLElement) => void;
    // Add more configuration options as needed
  }

  export interface VibesApp {
    container: HTMLElement;
    database?: any;
    chat: {
      sendMessage: (message: string) => Promise<void>;
      // Add more chat methods as needed
    };
  }

  export function useVibes(
    target: string | HTMLElement, 
    config: UseVibesConfig
  ): Promise<VibesApp>;
}

// Global declaration for the IIFE bundle
interface UseVibesConfig {
  effect?: (element: HTMLElement) => void;
  // Add more configuration options as needed
}

interface VibesApp {
  container: HTMLElement;
  database?: any;
  chat: {
    sendMessage: (message: string) => Promise<void>;
    // Add more chat methods as needed
  };
}

// Declare the global useVibes function
declare function useVibes(
  target: string | HTMLElement, 
  config: UseVibesConfig
): Promise<VibesApp>;

// Declare the window.useVibes property
interface Window {
  useVibes: typeof useVibes;
}
