import { callAI } from 'call-ai';

// DOM element and configuration interface
export interface UseVibesConfig {
  prompt: string;
  // Add more configuration options as needed
}

// App instance interface returned by useVibes
export interface VibesApp {
  container: HTMLElement;
  database?: Record<string, unknown>;
}

/**
 * The useVibes function - transforms a DOM element into an AI-augmented micro-app
 * @param target - CSS selector string or HTMLElement to inject into
 * @param config - Configuration object with prompt
 * @returns Promise resolving to the app instance
 */
export function useVibes(target: string | HTMLElement, config: UseVibesConfig): Promise<VibesApp> {
  // Get the target element if string selector was provided
  const targetElement =
    typeof target === 'string' ? (document.querySelector(target) as HTMLElement) : target;

  // Validate the target element
  if (!targetElement) {
    return Promise.reject(new Error(`Target element not found: ${target}`));
  }

  try {
    // Capture the current HTML state
    const htmlContext = document.body.innerHTML;

    // Build the prompt for the AI
    const userPrompt = `
      Transform the HTML content based on this request: ${config.prompt}
      
      The current HTML of the page is:
      \`\`\`html
      ${htmlContext}
      \`\`\`
      
      Generate HTML content that should be placed inside the target element.
      Keep your response focused and concise, generating only the HTML required.
    `;

    // Define a simple schema for the response
    const schema = {
      properties: {
        html: {
          type: 'string',
          description: 'The HTML content to inject into the target element',
        },
        explanation: {
          type: 'string',
          description: 'A brief explanation of the changes made (optional)',
        },
      },
    };

    // Call the AI with the prompt and schema
    // Explicitly set stream to false to ensure we get a string response
    const aiResponse = callAI(userPrompt, { schema, stream: false });

    // We need to handle the response which is a Promise<string> since we set stream: false
    if (aiResponse instanceof Promise) {
      return aiResponse
        .then(response => {
          try {
            // Parse the JSON response
            const result = JSON.parse(response as string) as { html: string; explanation?: string };

            // Extract HTML from structured response and inject it into the target element
            targetElement.innerHTML = result.html;

            // Log explanation if provided
            if (result.explanation) {
              console.log('AI explanation:', result.explanation);
            }

            // Return the app instance
            return {
              container: targetElement,
              database: undefined,
            };
          } catch (parseError: unknown) {
            console.error('Error parsing AI response:', parseError);
            const errorMessage =
              parseError instanceof Error ? parseError.message : String(parseError);
            return Promise.reject(new Error(`Failed to parse AI response: ${errorMessage}`));
          }
        })
        .catch((error: unknown) => {
          console.error('Error calling AI:', error);
          const errorMessage = error instanceof Error ? error.message : String(error);
          return Promise.reject(new Error(`Failed to process prompt: ${errorMessage}`));
        });
    } else {
      // This should never happen with stream: false, but we need to handle it for type safety
      return Promise.reject(new Error('Unexpected streaming response from callAI'));
    }
  } catch (error) {
    // Fallback for any unexpected errors
    console.error('Error initializing AI call:', error);

    // Provide a simple fallback that shows the prompt was received
    targetElement.innerHTML = `<div>🎭 Vibes received prompt: "${config.prompt}" (AI processing failed)</div>`;

    return Promise.resolve({
      container: targetElement,
      database: undefined,
    });
  }
}
