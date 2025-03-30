// tests/browser/helpers.ts
import { Page } from '@playwright/test';

/**
 * Helper function to inject and test the useVibes module in a browser context
 * This avoids the TypeScript errors from directly importing browser modules in Node.js
 */
interface UseVibesConfig {
  prompt: string;
  [key: string]: unknown;
}

export async function applyUseVibes(
  page: Page,
  selector: string,
  config: UseVibesConfig
): Promise<void> {
  await page.evaluate(
    ({ selector, config }) => {
      return new Promise<void>((resolve, reject) => {
        // Dynamically import the module within the browser context
        import('../../src/index.js')
          .then(({ useVibes }) => {
            const element = document.querySelector(selector);
            if (!element) {
              reject(new Error(`Element not found: ${selector}`));
              return;
            }

            useVibes(element as HTMLElement, config)
              .then(() => resolve())
              .catch((err: Error) => reject(err));
          })
          .catch((err: Error) => reject(err));
      });
    },
    { selector, config }
  );
}

/**
 * Helper function to apply custom effects in a browser context
 */
export async function applyCustomEffect(
  page: Page,
  selector: string,
  effectFn: string
): Promise<void> {
  await page.evaluate(
    ({ selector, effectFn }) => {
      const element = document.querySelector(selector);
      if (!element) return;

      // Execute the string function in the browser context
      const fn = new Function('element', effectFn);
      fn(element);
    },
    { selector, effectFn }
  );
}
