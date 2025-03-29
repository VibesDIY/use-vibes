import * as esbuild from 'esbuild';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Get directory name using ESM pattern
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure directories exist
const fixturesLibDir = path.resolve(__dirname, '../fixtures/lib');
if (!fs.existsSync(fixturesLibDir)) {
  fs.mkdirSync(fixturesLibDir, { recursive: true });
}

// Build browser bundle with IIFE format
esbuild.buildSync({
  entryPoints: [path.resolve(__dirname, '../src/index.ts')],
  bundle: true,
  minify: false,
  format: 'iife',
  globalName: 'useVibesModule',
  outfile: path.resolve(fixturesLibDir, 'use-vibes.bundle.js'),
  platform: 'browser',
  target: ['es2020'],
});

// Create a wrapper script that exposes the useVibes function globally
const wrapperCode = `
// Original bundled module (from esbuild)
${fs.readFileSync(path.resolve(fixturesLibDir, 'use-vibes.bundle.js'), 'utf8')}

// Expose the useVibes function directly in the global scope
window.useVibes = useVibesModule.useVibes;

// Also expose other exports as properties of window.useVibes
window.useVibes.createVibe = useVibesModule.createVibe;
window.useVibes.enhanceVibe = useVibesModule.enhanceVibe;
`;

// Write the wrapper to the final output file
fs.writeFileSync(path.resolve(fixturesLibDir, 'use-vibes.iife.js'), wrapperCode);

console.log('Browser bundle with global useVibes function created at fixtures/lib/use-vibes.iife.js');
