// tests/browser/hello-world.test.ts
import { test, expect } from '@playwright/test';

// Simplified test suite that uses network-level mocking
// This avoids the need to modify production code while ensuring tests are reliable

test('page loads with initial content', async ({ page }) => {
  // Add page console listeners for debugging
  page.on('console', msg => {
    console.log(`BROWSER CONSOLE: ${msg.type()}: ${msg.text()}`);
  });
  
  // Navigate to the test page
  await page.goto('http://localhost:3000/basic/hello-world.html');

  // Verify the page loaded with initial content before any modifications
  const initialText = await page.textContent('#target');
  console.log('Initial text content:', initialText);
  expect(initialText).toContain('This content will be modified');
});

test('useVibes should modify the target element', async ({ page }) => {
  // Set up API request interception BEFORE navigating to the page
  // This intercepts all calls to the OpenAI API or Call-AI API endpoints
  await page.route('**/*api.openai.com*/v1/chat/completions', mockCallAIEndpoint);
  await page.route('**/*api.call-ai.com*', mockCallAIEndpoint);
  
  // Helper function to mock the API response
  async function mockCallAIEndpoint(route: any) {
    // Extract request body to see what prompt was sent
    const requestBody = route.request().postDataJSON();
    console.log('🔍 AI Request:', JSON.stringify(requestBody).substring(0, 200));
    
    /**
     * IMPORTANT: We need to understand the call flow here:
     * 1. useVibes() calls callAI() with a prompt and schema
     * 2. callAI() makes an API request to OpenAI/call-ai API
     * 3. API returns JSON with choices[0].message.content
     * 4. callAI() extracts this content and returns it directly as a string
     * 5. useVibes() expects to parse this string as JSON with html property
     * 
     * So our mock content must be a STRING which itself is valid JSON containing html property
     */
    
    // Create a raw string that callAI will return directly to useVibes
    // This will be extracted from choices[0].message.content and returned as-is
    const htmlContent = `<div style="background-color: #e6f7ff; padding: 10px; border: 2px solid #1890ff; border-radius: 5px;">
      <strong>🎭 Vibes received prompt:</strong> "Create a Hello World message with blue styling"
      <br><small>(Mocked API Response)</small>
    </div>`;
    
    // useVibes expects this exact JSON structure from callAI
    const mockResponseContent = JSON.stringify({
      html: htmlContent,
      explanation: 'Mocked explanation: Added styling and formatted message as requested.',
    });
    
    // This is what the API returns, containing our response as content
    const mockAPIResponse = {
      choices: [{
        message: {
          role: 'assistant',
          // This content is what callAI extracts and returns directly
          content: mockResponseContent
        },
        index: 0,
      }],
      id: 'mock-response-id',
      object: 'chat.completion',
    };
    
    console.log('🧪 Mock API response set up with content:', mockResponseContent);

    // Fulfill the request with our mock response
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockAPIResponse),
    });
  }

  // Navigate to the test page
  await page.goto('http://localhost:3000/basic/hello-world.html');

  // Wait for the page to load
  await page.waitForSelector('#target');

  // Apply useVibes to the target element
  await page.evaluate(() => {
    const target = document.getElementById('target');
    if (!target) throw new Error('Target element not found');

    // Set API key for testing
    window.CALLAI_API_KEY = 'test-api-key';

    // Apply useVibes with a test prompt
    return window.useVibes(target, {
      prompt: 'Create a Hello World message with blue styling',
    });
  });

  // Wait a moment for the changes to be applied
  await page.waitForTimeout(1000);

  // Verify the content was changed
  const targetText = await page.textContent('#target');
  expect(targetText).toContain('Vibes received prompt');
  expect(targetText).toContain('Create a Hello World message with blue styling');
  expect(targetText).toContain('Mocked API Response');

  // Take a screenshot for debugging purposes
  await page.screenshot({ path: 'test-results/use-vibes-success.png' });
});

test('useVibes with custom configuration options', async ({ page }) => {
  // Set up API request interception with a custom configuration response
  await page.route('**/*api.openai.com*/v1/chat/completions', async route => {
    const mockResponse = {
      choices: [{
        message: {
          role: 'assistant',
          content: JSON.stringify({
            html: `<div style="background-color: #fff8e1; padding: 10px; border: 2px solid #ffc107; border-radius: 5px;">
              <strong>🎭 Vibes received prompt:</strong> "Alternative configuration test" 
              <br><small>(Custom configuration test response)</small>
            </div>`,
            explanation: 'Mock explanation for custom configuration test',
          }),
        },
        index: 0,
      }],
      id: 'mock-custom-config-id',
      model: 'gpt-3.5-turbo',
      object: 'chat.completion',
    };
    
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockResponse),
    });
  });
  
  // Also mock the call-ai API endpoint as a fallback
  await page.route('**/*api.call-ai.com*', async route => {
    const mockResponse = {
      choices: [{
        message: {
          role: 'assistant',
          content: JSON.stringify({
            html: `<div style="background-color: #fff8e1; padding: 10px; border: 2px solid #ffc107; border-radius: 5px;">
              <strong>🎭 Vibes received prompt:</strong> "Alternative configuration test" 
              <br><small>(Custom configuration test response)</small>
            </div>`,
            explanation: 'Mock explanation for custom configuration test',
          }),
        },
        index: 0,
      }],
      id: 'mock-custom-config-id',
      model: 'gpt-3.5-turbo',
      object: 'chat.completion',
    };
    
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockResponse),
    });
  });
  
  // Navigate to test page
  await page.goto('http://localhost:3000/basic/hello-world.html');

  // Wait for page to load
  await page.waitForSelector('#target-alt');

  // Make sure our mocks are loaded
  await page.waitForFunction(
    () => {
      return window.fetch !== window._originalFetch;
    },
    { timeout: 5000 }
  );

  // Apply useVibes to the alternative target
  await page.evaluate(() => {
    const target = document.getElementById('target-alt');
    if (!target) {
      throw new Error('Alternative target element not found');
    }
    // Using the global useVibes function
    window.CALLAI_API_KEY = 'test-api-key'; // Set test API key
    return useVibes(target, {
      prompt: 'Alternative configuration test',
    });
  });

  // Wait longer for changes to apply
  await page.waitForTimeout(200);

  // Verify the content was changed
  const targetText = await page.textContent('#target-alt');
  expect(targetText).toContain('Vibes received prompt');
  expect(targetText).toContain('Alternative configuration test');
});

test('useVibes should handle errors gracefully', async ({ page }) => {
  await page.goto('http://localhost:3000/basic/hello-world.html');

  // Wait for mocks to be set up
  await page.waitForFunction(
    () => {
      return window.fetch !== window._originalFetch;
    },
    { timeout: 5000 }
  );

  // Test with invalid selector
  const errorResult = await page.evaluate(async () => {
    try {
      // Set test API key
      window.CALLAI_API_KEY = 'test-api-key';
      // Try to use a non-existent element with the global useVibes function
      await useVibes('#non-existent-element', {
        prompt: 'Test error handling',
      });

      return 'No error thrown';
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  });

  // Ensure we got an error message
  expect(errorResult).not.toBe('No error thrown');
  expect(typeof errorResult).toBe('string');
  expect(errorResult.length).toBeGreaterThan(0);
});
