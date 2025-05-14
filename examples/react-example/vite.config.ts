import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'use-vibes': resolve(__dirname, 'node_modules/use-vibes/dist/index.js'),
    },
  },
});
