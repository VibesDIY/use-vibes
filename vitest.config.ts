import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/browser/**/*.test.ts'], // Exclude browser tests which are run by Playwright
    globals: true,
    coverage: {
      reporter: ['text', 'json', 'html'],
    },
  },
});
