// tests/browser/hello-world.test.ts
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// Simplified test that tests the core functionality with proper instrumentation
// This approach completely bypasses network calls for reliable test behavior

// Set up browser console logging for all tests
const setupLogging = (page: Page) => {
  // Forward browser console messages to test output
  page.on('console', msg => {
    /* eslint-disable-next-line no-console */
    console.log(`🌐 ${msg.type()}: ${msg.text()}`);
  });
  page.on('pageerror', err => {
    /* eslint-disable-next-line no-console */
    console.error(`🔥 Browser error: ${err.message}`);
  });
};

test('page loads with initial content', async ({ page }) => {
  setupLogging(page);

  // Navigate to the test page
  await page.goto('http://localhost:3000/basic/hello-world.html');

  // Check that our target element exists
  const hasTarget = await page.evaluate(() => {
    const target = document.getElementById('target');
    /* eslint-disable-next-line no-console */
    console.log('Target element exists:', !!target);
    return !!target;
  });
  expect(hasTarget).toBe(true);

  // Get the text content
  const initialText = await page.textContent('#target');
  /* eslint-disable-next-line no-console */
  console.log('Initial text content:', initialText);
  expect(initialText).toContain('This content will be modified');
});

test('useVibes with direct callAI mock', async ({ page }) => {
  setupLogging(page);

  // Navigate to the test page
  await page.goto('http://localhost:3000/basic/hello-world.html');

  // Wait for page to load
  await page.waitForSelector('#target');

  // Directly inject the mock - this is cleaner than relying on global setup
  await page.evaluate(() => {
    // Override callAI with a direct mock implementation
    // @ts-expect-error - Mock the callAI function with correct type signatures
    window.callAI = function mockCallAI(_prompt: string, _options: Record<string, unknown>) {
      // Create HTML with the prompt for verification
      const html = `
<div style="background-color: #e6f7ff; padding: 10px; border: 2px solid #1890ff; border-radius: 5px;">
  <strong>🎭 Vibes received prompt:</strong> "Create a Hello World message with blue styling"
  <br><small>(Mocked API Response)</small>
</div>
      `;

      // Create a response object matching what callAI would return
      const responseObj = {
        html: html,
        explanation: 'Mock explanation for testing',
      };

      // callAI returns a Promise that resolves to a JSON string
      return Promise.resolve(JSON.stringify(responseObj));
    };

    /* eslint-disable-next-line no-console */
    console.log('🔄 callAI mocked directly on window object');
    /* eslint-disable-next-line no-console */
    console.log('🔄 Type of callAI:', typeof window.callAI);
  });

  // Verify our target element before modification
  const initialHtml = await page.evaluate(() => {
    const target = document.getElementById('target');
    return target ? target.innerHTML : 'target not found';
  });
  /* eslint-disable-next-line no-console */
  console.log('Target HTML before:', initialHtml);

  // Execute useVibes on the target element
  await page.evaluate(() => {
    try {
      // Get the target element
      const target = document.getElementById('target');
      if (!target) throw new Error('Target element not found!');

      /* eslint-disable-next-line no-console */
      console.log('🔄 Applying useVibes to target element');

      // Set API key for testing
      window.CALLAI_API_KEY = 'test-api-key';

      // Call useVibes with test prompt
      window.useVibes(target, {
        prompt: 'Create a Hello World message with blue styling',
      });

      /* eslint-disable-next-line no-console */
      console.log('✅ useVibes called successfully');
    } catch (err) {
      /* eslint-disable-next-line no-console */
      console.error('❌ Error calling useVibes:', (err as Error).message);
      /* eslint-disable-next-line no-console */
      console.error('Stack:', (err as Error).stack);
    }
  });

  // Wait for the async operation to complete
  await page.waitForTimeout(2000);

  // Check the HTML content after the timeout
  const finalHtml = await page.evaluate(() => {
    const target = document.getElementById('target');
    /* eslint-disable-next-line no-console */
    console.log('Target element after useVibes:', target ? 'exists' : 'not found');
    return target ? target.innerHTML : 'target not found';
  });
  /* eslint-disable-next-line no-console */
  console.log('Target HTML after:', finalHtml.substring(0, 200) + '...');

  // Get the text content for assertions
  const targetText = await page.textContent('#target');
  expect(targetText).toContain('Vibes received prompt');
});

test('useVibes with direct mock custom configuration', async ({ page }) => {
  setupLogging(page);

  // Navigate to the test page
  await page.goto('http://localhost:3000/basic/hello-world.html');

  // Wait for page to load
  await page.waitForSelector('#target-alt');

  // Inject the mock implementation for callAI
  await page.evaluate(() => {
    // Override callAI with a direct mock implementation
    // @ts-expect-error - Mock the callAI function
    window.callAI = function mockCallAI(_prompt: string, _options: Record<string, unknown>) {
      /* eslint-disable-next-line no-console */
      console.log('📢 Mock callAI called with prompt:', _prompt.substring(0, 100) + '...');

      // Create a response with alternative styling for this test
      const html = `
<div style="background-color: #fff8e1; padding: 10px; border: 2px solid #ffc107; border-radius: 5px;">
  <strong>🎭 Vibes received prompt:</strong> "Alternative configuration test"
  <br><small>(Custom configuration test)</small>
</div>
      `;

      const responseObj = {
        html: html,
        explanation: 'Mock explanation for alternative configuration',
      };

      return Promise.resolve(JSON.stringify(responseObj));
    };
  });

  // Execute useVibes on the alternative target with custom config
  await page.evaluate(() => {
    try {
      const targetAlt = document.getElementById('target-alt');
      if (!targetAlt) throw new Error('Alt target element not found!');

      // Apply with custom config
      window.useVibes(targetAlt, {
        prompt: 'Alternative configuration test',
      });
    } catch (err) {
      /* eslint-disable-next-line no-console */
      console.error('Error in alt config test:', (err as Error).message);
    }
  });

  // Wait for async operations
  await page.waitForTimeout(2000);

  // Verify the content
  const targetText = await page.textContent('#target-alt');
  expect(targetText).toContain('Vibes received prompt');
  expect(targetText).toContain('Alternative configuration test');
});

// Simple diagnostic test to validate our mocking approach
test('verify mock callAI is actually being called', async ({ page }) => {
  setupLogging(page);

  // Navigate to the test page
  await page.goto('http://localhost:3000/basic/hello-world.html');

  // Don't override the mock here - instead use the one from our test bundle
  // This will properly test that our mocking approach works

  // Set up an error handler to detect if our diagnostic error is thrown
  let diagnosticErrorDetected = false;
  page.on('pageerror', error => {
    /* eslint-disable-next-line no-console */
    console.log('📋 Page error detected:', error.message);
    if (error.message.includes('DIAGNOSTIC_MOCK_ERROR')) {
      diagnosticErrorDetected = true;
    }
  });

  // Execute useVibes with the diagnostic prompt
  await page.evaluate(() => {
    try {
      const target = document.getElementById('target');
      if (!target) throw new Error('Target element not found!');

      /* eslint-disable-next-line no-console */
      console.log('🔄 Calling useVibes with diagnostic prompt');

      // Set API key for testing
      window.CALLAI_API_KEY = 'test-api-key';

      // The 'Diagnostic test prompt' string is what triggers our special mock behavior
      window.useVibes(target, {
        prompt: 'Diagnostic test prompt',
      });

      /* eslint-disable-next-line no-console */
      console.log(
        '✅ useVibes call with diagnostic prompt completed (if this appears, error was caught internally)'
      );
    } catch (err) {
      /* eslint-disable-next-line no-console */
      console.error('❌ Error caught in page context:', (err as Error).message);
    }
  });

  // Wait for any async operations and error handlers to complete
  await page.waitForTimeout(2000);

  // Check if our diagnostic error HTML element exists in the page
  const errorElementExists = await page.evaluate(() => {
    return !!document.getElementById('DIAGNOSTIC_MOCK_ERROR');
  });

  /* eslint-disable-next-line no-console */
  console.log('Diagnostic error element in DOM:', errorElementExists);
  /* eslint-disable-next-line no-console */
  console.log('Diagnostic error detected in console:', diagnosticErrorDetected);

  // The test passes if either the error was detected or the error element exists in the DOM
  expect(errorElementExists || diagnosticErrorDetected).toBeTruthy();
});

test('useVibes should handle errors gracefully', async ({ page }) => {
  setupLogging(page);

  // Navigate to the test page
  await page.goto('http://localhost:3000/basic/hello-world.html');

  // Inject mock that simulates an error
  await page.evaluate(() => {
    window.callAI = function mockCallAIWithError() {
      /* eslint-disable-next-line no-console */
      console.log('🚨 Mock error function called');
      return Promise.reject(new Error('Simulated API error'));
    };
  });

  // Execute useVibes and expect it to handle the error
  await page.evaluate(() => {
    const target = document.getElementById('target');
    if (target) {
      window.useVibes(target, {
        prompt: 'This should fail with an error',
      });
    }
  });

  // Wait for error handling
  await page.waitForTimeout(1000);

  // Verify error message shows in the element
  const errorContent = await page.textContent('#target');
  expect(errorContent).toContain('Error');
});

test('useVibes with custom configuration options', async ({ page }) => {
  // Set up API request interception with a custom configuration response
  await page.route('**/*api.openai.com*/v1/chat/completions', async route => {
    const mockResponse = {
      choices: [
        {
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
        },
      ],
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
      choices: [
        {
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
        },
      ],
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

test('useVibes should handle invalid selector errors', async ({ page }) => {
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
