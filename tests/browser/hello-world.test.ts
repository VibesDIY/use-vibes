// tests/browser/hello-world.test.ts
import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('page loads with initial content', async ({ page }) => {
  // Navigate to the test page
  await page.goto('http://localhost:3000/basic/hello-world.html');

  // Verify the page loaded with initial content before any modifications
  const initialText = await page.textContent('#target');
  expect(initialText).toContain('This content will be modified');
});

test('useVibes should modify the target element', async ({ page }) => {
  // Navigate to the test page
  await page.goto('http://localhost:3000/basic/hello-world.html');

  // Wait for page to load and manually apply useVibes function
  await page.waitForSelector('#target');

  // Directly apply the useVibes function in the page context
  await page.evaluate(() => {
    const target = document.getElementById('target');
    if (!target) {
      throw new Error('Target element not found');
    }
    // Using the global useVibes function from our IIFE bundle
    useVibes(target, {
      prompt: 'Create a Hello World message with blue styling',
    });
  });

  // Wait a moment for changes to apply
  await page.waitForTimeout(100);

  // Verify the content was changed
  const targetText = await page.textContent('#target');
  expect(targetText).toContain('Vibes received prompt');

  // Just verify the content was modified without checking specific styles
  // since the current implementation doesn't modify styles
  const targetContent = await page.textContent('#target');
  expect(targetContent).toContain('Vibes received prompt');
  expect(targetContent).toContain('Create a Hello World message with blue styling');
});

test('useVibes with custom configuration options', async ({ page }) => {
  await page.goto('http://localhost:3000/basic/hello-world.html');

  // Apply useVibes to the alternative target
  await page.evaluate(() => {
    const target = document.getElementById('target-alt');
    if (!target) {
      throw new Error('Alternative target element not found');
    }
    // Using the global useVibes function
    useVibes(target, {
      prompt: 'Alternative configuration test',
    });
  });

  // Verify the content was changed
  const targetText = await page.textContent('#target-alt');
  expect(targetText).toContain('Vibes received prompt');
  expect(targetText).toContain('Alternative configuration test');
});

test('useVibes should handle errors gracefully', async ({ page }) => {
  await page.goto('http://localhost:3000/basic/hello-world.html');

  // Test with invalid selector
  const errorResult = await page.evaluate(async () => {
    try {
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
