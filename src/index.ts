// Main entry point
import { createVibe } from './core/vibe.js';
import { enhanceVibe } from './utils/enhancer.js';

export { createVibe, enhanceVibe };
export type { Vibe } from './core/vibe.js';

// DOM element and configuration interface
export interface UseVibesConfig {
  effect?: (element: HTMLElement) => void;
  // Add more configuration options as needed
}

// App instance interface returned by useVibes
export interface VibesApp {
  container: HTMLElement;
  database?: any;
  chat: {
    sendMessage: (message: string) => Promise<void>;
    // Add more chat methods as needed
  };
}

/**
 * The useVibes function - transforms a DOM element into an AI-augmented micro-app
 * @param target - CSS selector string or HTMLElement to inject into
 * @param config - Configuration object
 * @returns Promise resolving to the app instance
 */
export function useVibes(target: string | HTMLElement, config: UseVibesConfig): Promise<VibesApp> {
  // Get the target element if string selector was provided
  const targetElement = typeof target === 'string' 
    ? document.querySelector(target) as HTMLElement
    : target;
  
  // Validate the target element
  if (!targetElement) {
    return Promise.reject(new Error(`Target element not found: ${target}`));
  }
  
  // Apply the effect if provided
  if (config.effect && typeof config.effect === 'function') {
    config.effect(targetElement);
  }
  
  // Return a promise that resolves to the app instance
  return Promise.resolve({
    container: targetElement,
    chat: {
      sendMessage: async (message: string) => {
        console.log(`Message sent: ${message}`);
        // In a real implementation, this would communicate with an AI
      }
    }
  });
}

// Original singular useVibe export (for backwards compatibility)
export default function useVibe(name: string) {
  const vibe = createVibe(name);
  return enhanceVibe(vibe);
}
