// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 30000,
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    video: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Add browser mocks before tests run
    launchOptions: {
      args: ['--disable-web-security'], // Disable CORS for test environment
    },
  },
  webServer: {
    command: 'pnpm serve',
    port: 3000,
    reuseExistingServer: true,
  },
  reporter: 'html',
  // Setup hook to inject our mock script into all test pages
  globalSetup: './tests/browser/global-setup.ts',
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
    {
      name: 'firefox',
      use: { browserName: 'firefox' },
    },
    {
      name: 'webkit',
      use: { browserName: 'webkit' },
    },
  ],
});
