import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The app is served as loose ES modules — there is no bundler to fail the build,
// so an import of a file that no longer exists is not caught until the browser
// says "Failed to load app code", in production, on a deployed vibe. Nothing
// else in this suite catches it: the unit tests import the modules they test,
// never App.jsx.
//
// That is a real bug this file exists because of: removing the perf probe left
// its import behind, and the first sign was a blank app.
const here = dirname(fileURLToPath(import.meta.url));
const sources = readdirSync(here).filter(
  (f) => (f.endsWith('.js') || f.endsWith('.jsx')) && !f.endsWith('.test.js')
);

describe('every relative import resolves', () => {
  it.each(sources)('%s', (file) => {
    const src = readFileSync(join(here, file), 'utf8');
    const specifiers = [...src.matchAll(/(?:from|import)\s+['"](\.[^'"]+)['"]/g)].map((m) => m[1]);
    for (const spec of specifiers) {
      expect(existsSync(join(here, spec)), `${file} imports missing ${spec}`).toBe(true);
    }
  });
});
