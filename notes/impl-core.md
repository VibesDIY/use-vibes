# Core Implementation - First Pass

This document outlines the simplest approach to get a working implementation of `useVibes` using just `document.body.innerHTML` with callAI, ignoring screenshot functionality for now.

## Core Implementation Strategy

For a minimal viable implementation, we'll focus on these key components:

1. **HTML Context Capture**: Use `document.body.innerHTML` to capture the current page state
2. **AI Processing with Schema**: Pass this HTML context to callAI with the user's prompt and a schema for structured output
3. **DOM Transformation**: Inject the AI-generated response into the target element

## Implementation Steps

### 1. Add callAI Dependency

```bash
pnpm add call-ai
```

### 2. Implement Core Functionality

```typescript
// src/index.ts
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
        type: "string",
        description: "The HTML content to inject into the target element"
      },
      explanation: {
        type: "string",
        description: "A brief explanation of the changes made (optional)"
      }
    }
  };

  // Call the AI with the prompt and schema
  return callAI(userPrompt, { schema })
    .then((response) => {
      try {
        // Parse the JSON response
        const result = JSON.parse(response);
        
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
      } catch (parseError) {
        console.error('Error parsing AI response:', parseError);
        return Promise.reject(new Error(`Failed to parse AI response: ${parseError.message}`));
      }
    })
    .catch((error) => {
      console.error('Error calling AI:', error);
      return Promise.reject(new Error(`Failed to process prompt: ${error.message}`));
    });

}
```

### 3. Error Handling

Add additional error handling for:
- Missing or invalid configuration
- AI processing failures
- JSON parsing errors
- DOM manipulation exceptions

### 4. Testing

Test the implementation with a simple browser test:

```typescript
// tests/browser/hello-world.test.ts
import { test, expect } from '@playwright/test';

test('useVibes basic functionality', async ({ page }) => {
  // Load the test page with useVibes script
  await page.goto('http://localhost:3000/test-page.html');
  
  // Execute useVibes with a simple prompt
  const result = await page.evaluate(async () => {
    const { useVibes } = window as any;
    const app = await useVibes('#test-container', { 
      prompt: 'Create a hello world message with a blue background' 
    });
    return !!app.container;
  });
  
  // Verify that useVibes executed successfully
  expect(result).toBeTruthy();
  
  // Check that content was injected into the target container
  const content = await page.textContent('#test-container');
  expect(content).not.toBeNull();
  expect(content?.length).toBeGreaterThan(0);
});
```

## Next Steps After First Pass

Once this minimal implementation is working:

1. **Add CSS Capture**: Collect CSS styles from the page to provide better context
2. **Implement Screenshot Functionality**: Integrate html2canvas for visual snapshots
3. **Enhance Prompt Engineering**: Refine the AI prompts for better results
4. **Add Configuration Options**: Support additional configuration parameters
5. **Implement Validation**: Add more robust validation of inputs and outputs
6. **Enhance Schema**: Expand the schema to handle more complex transformation scenarios

## Testing Workflow

After implementing changes:

1. Run unit tests: `npm test`
2. Run browser tests: `npm run test:browser`
3. Validate typechecking: `npm run typecheck`
4. Fix linting issues: `npm run lint:fix`

This approach provides a solid foundation while keeping the implementation simple and focused on the core functionality. By initially omitting the screenshot functionality, we can get a working implementation faster and add the visual context enhancement in a subsequent iteration.
