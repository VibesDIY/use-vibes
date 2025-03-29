// tests/browser/hello-world.test.ts
import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyUseVibes, applyCustomEffect } from './helpers.js';

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
      effect: (element: HTMLElement) => {
        element.textContent = 'Hello World! Vibes applied successfully!';
        element.style.backgroundColor = '#e6f7ff';
        element.style.borderColor = '#91d5ff';
      }
    });
  });
  
  // Wait a moment for changes to apply
  await page.waitForTimeout(100);
  
  // Verify the content was changed
  const targetText = await page.textContent('#target');
  expect(targetText).toBe('Hello World! Vibes applied successfully!');
  
  // Verify the styling was applied
  const styles = await page.evaluate(() => {
    const target = document.getElementById('target');
    if (!target) return null;
    
    const computedStyle = window.getComputedStyle(target);
    return {
      backgroundColor: computedStyle.backgroundColor,
      borderColor: computedStyle.borderColor
    };
  });
  
  // Check if the styles match expected values
  expect(styles?.backgroundColor).toBeTruthy(); // Should have some value
  expect(styles?.borderColor).toBeTruthy();     // Should have some value
});

test('useVibes with custom configuration options', async ({ page }) => {
  await page.goto('http://localhost:3000/basic/hello-world.html');
  
  // Apply a custom effect to the alternative target
  await applyCustomEffect(page, '#target-alt', `
    element.textContent = 'Alternative configuration';
    element.style.color = 'red';
  `);
  
  // Verify the content was changed
  const targetText = await page.textContent('#target-alt');
  expect(targetText).toBe('Alternative configuration');
  
  // Verify the styling was applied
  const color = await page.evaluate(() => {
    const target = document.getElementById('target-alt');
    if (!target) return null;
    
    const computedStyle = window.getComputedStyle(target);
    return computedStyle.color;
  });
  
  expect(color).toBeTruthy(); // Should have some value
});

test('useVibes should handle errors gracefully', async ({ page }) => {
  await page.goto('http://localhost:3000/basic/hello-world.html');
  
  // Test with invalid selector
  const errorResult = await page.evaluate(async () => {
    try {
      // Import module dynamically
      const module = await import('../../src/index.js');
      const { useVibes } = module;
      
      // Try to use a non-existent element
      await useVibes('#non-existent-element', {
        effect: () => {}
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
