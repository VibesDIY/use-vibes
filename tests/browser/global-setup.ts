// global-setup.ts
import { chromium, firefox, webkit, FullConfig } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to mocks script
const mocksScriptPath = path.resolve(__dirname, './setup-browser-mocks.js');

async function globalSetup(_config: FullConfig) {
  // eslint-disable-next-line no-console
  console.log('Running global setup for browser tests...');
  // eslint-disable-next-line no-console
  console.log('Mock script path:', mocksScriptPath);

  // Add mocks to all browsers' contexts
  const browserTypes = [chromium, firefox, webkit];

  for (const browserType of browserTypes) {
    // Launch browser
    const browser = await browserType.launch();

    // Create a new context and page
    const context = await browser.newContext();
    // We need a page to set up routes, but don't actually use it directly
    await context.newPage();

    // Set up the route to inject our mock script into every page
    // Intercept requests for the use-vibes.iife.js file and serve our test bundle instead
    await context.route('**/lib/use-vibes.iife.js', async route => {
      // eslint-disable-next-line no-console
      console.log('🔄 Intercepting request for use-vibes.iife.js, redirecting to test bundle');

      // Redirect to our test bundle
      const fs = await import('fs');
      const testBundlePath = path.resolve(__dirname, '../../fixtures/lib/use-vibes-test.iife.js');
      const testBundleContent = fs.readFileSync(testBundlePath, 'utf8');

      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: testBundleContent,
      });

      // eslint-disable-next-line no-console
      console.log('✅ Successfully redirected to test bundle');
    });

    // Handle other requests
    await context.route('**/*', async (route, request) => {
      // If this is an HTML page, we'll inject our mock script
      if (request.url().endsWith('.html') || request.resourceType() === 'document') {
        // eslint-disable-next-line no-console
        console.log('Injecting mocks into URL:', request.url());

        // Continue with the original response
        const response = await route.fetch();
        const body = await response.text();

        // Read our mocks script directly
        const fs = await import('fs');
        const mocksContent = fs.readFileSync(mocksScriptPath, 'utf8');

        // eslint-disable-next-line no-console
        console.log('Mock script loaded, length:', mocksContent.length);

        // Inject the full script content into the head
        // This ensures it loads before any other scripts
        const mocksScript = `<script>
// START OF INJECTED MOCK SCRIPT
console.log('Mock script execution starting...');
${mocksContent}
console.log('Mock script execution completed!');
// END OF INJECTED MOCK SCRIPT
</script>`;

        const modifiedBody = body.replace('<head>', `<head>\n${mocksScript}`);

        // Return the modified content
        await route.fulfill({
          response,
          body: modifiedBody,
          headers: {
            ...response.headers(),
            'content-length': String(modifiedBody.length),
          },
        });

        // eslint-disable-next-line no-console
        console.log('Mock script injected successfully for:', request.url());
      } else {
        await route.continue();
      }
    });

    // Close browser after setup
    await browser.close();
    // eslint-disable-next-line no-console
    console.log(`Mock injection set up for ${browserType.name()}`);
  }
}

export default globalSetup;
