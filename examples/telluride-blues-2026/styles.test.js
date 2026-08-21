import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lineupTag, stageTint, c } from './styles.js';

const here = dirname(fileURLToPath(import.meta.url));

// Telluride's feed names a stage but never a lineup, so lineupTag returns null
// for every real set. That is the point — but it means any view that reaches
// straight for `.label` throws on a schedule that loads fine. Three views render
// this pill and all three did exactly that before it returned null.
describe('lineupTag', () => {
  it('is null when the feed names no lineup — the Telluride case', () => {
    expect(lineupTag({ venueTitle: 'Main Stage' })).toBeNull();
    expect(lineupTag({ venueTitle: 'Main Stage', lineup: {} })).toBeNull();
  });

  it('still renders a tag for a feed that does name one', () => {
    expect(lineupTag({ venueTitle: 'Main Stage', lineup: { id: 'blues' } })).toMatchObject({
      label: 'blues',
    });
  });

  it('is never dereferenced without a guard in any view', () => {
    // The guard is `tag &&` / `isEvent && tag &&` immediately around the pill.
    for (const file of readdirSync(here).filter((f) => f.endsWith('.jsx'))) {
      const src = readFileSync(join(here, file), 'utf8');
      if (!/\btag\.label\b/.test(src)) continue;
      expect(src, `${file} renders tag.label with no null guard`).toMatch(/tag &&/);
    }
  });
});

describe('stageTint', () => {
  it('gives each stage its own tint so cards group by stage on sight', () => {
    const stages = ['Main Stage', 'Blues Stage', 'Campground Sessions', 'Truck Stage'];
    const tints = stages.map((venueTitle) => stageTint({ venueTitle }));
    expect(new Set(tints).size).toBe(stages.length);
  });

  it('falls back rather than throwing on a stage the feed invents', () => {
    expect(stageTint({ venueTitle: 'Juke Joint' })).toMatch(/^#[0-9A-F]{6}$/i);
    expect(stageTint({})).toMatch(/^#[0-9A-F]{6}$/i);
    expect(stageTint(undefined)).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it('keeps every tint light — the cards carry dark body text', () => {
    const stages = ['Main Stage', 'Blues Stage', 'Campground Sessions', 'Truck Stage', 'Anything'];
    for (const venueTitle of stages) {
      const hex = stageTint({ venueTitle });
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      expect(luminance, `${venueTitle} tint ${hex} is too dark for dark text`).toBeGreaterThan(0.7);
    }
  });
});

describe('palette', () => {
  it('gives headerBg its own text class — bodyText on it is dark-on-dark', () => {
    expect(c.onHeader).toBeTruthy();
    for (const file of readdirSync(here).filter((f) => f.endsWith('.jsx'))) {
      const src = readFileSync(join(here, file), 'utf8');
      for (const line of src.split('\n')) {
        if (line.includes('c.headerBg')) expect(line).not.toMatch(/c\.bodyText/);
      }
    }
  });
});
