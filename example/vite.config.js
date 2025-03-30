// vite.config.js
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  // Ensure TypeScript files are processed correctly
  resolve: {
    alias: {
      // This allows the example to directly import from the parent project
      'use-vibes': path.resolve(__dirname, '../src/index.ts'),
    },
  },
  // Adjust to prevent bundling problems with our imports
  optimizeDeps: {
    include: ['call-ai'],
  },
});
