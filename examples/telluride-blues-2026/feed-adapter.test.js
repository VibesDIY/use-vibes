import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ingestScheduleFeed } from './backend.js';
import { FESTIVAL } from './festival-config.js';

// The fixture is the festival's OWN page, captured 2026-08-18 — the adapter is
// tested against real published markup, not a hand-written idea of it. Recapture
// with:
//   curl -sSL 'https://tellurideblues.com/schedule?format=json' \
//     -o fixtures/schedule-<date>.json
const here = dirname(fileURLToPath(import.meta.url));
const feed = JSON.parse(readFileSync(join(here, 'fixtures/schedule-2026-08-18.json'), 'utf8'));
const items = ingestScheduleFeed(feed);

describe('ingestScheduleFeed — Telluride 2026', () => {
  it('reads the whole published grid', () => {
    expect(items.length).toBeGreaterThan(45);
  });

  it('mints a distinct id per set', () => {
    expect(new Set(items.map((i) => i.eventId)).size).toBe(items.length);
  });

  it('keys ids on content, so a refetch of unchanged data reproduces them exactly', () => {
    const again = ingestScheduleFeed(feed);
    expect(again.map((i) => i.eventId)).toEqual(items.map((i) => i.eventId));
  });

  it('lands every set inside the festival', () => {
    const days = Object.values(FESTIVAL.dates);
    for (const i of items) expect(days).toContain(i.start.slice(0, 10));
  });

  it('ends every set after it starts', () => {
    for (const i of items) expect(i.end > i.start, `${i.title}: ${i.start}→${i.end}`).toBe(true);
  });

  it('carries the stages that make the conflicts', () => {
    const stages = new Set(items.map((i) => i.venueTitle));
    expect(stages).toContain('Main Stage');
    expect(stages).toContain('Blues Stage');
    expect(stages).toContain('Campground Sessions');
  });

  it('reads an afternoon set with an inherited meridiem as PM, not midnight', () => {
    // "12:00 - 1:00 PM - Myron Elkins": the start has no AM/PM of its own.
    const noon = items.find((i) => i.title === 'Myron Elkins' && i.venueTitle === 'Main Stage');
    expect(noon.start).toBe('2026-09-18T12:00:00');
    expect(noon.end).toBe('2026-09-18T13:00:00');
  });

  it('reads a set that runs to an off-hour end time', () => {
    // "4:30 - 5:40 PM - G. Love & Special Sauce" — and the & survives decoding.
    const gl = items.find((i) => i.title.startsWith('G. Love'));
    expect(gl.title).toBe('G. Love & Special Sauce');
    expect(gl.start).toBe('2026-09-18T16:30:00');
    expect(gl.end).toBe('2026-09-18T17:40:00');
  });

  it('drops the box-office and venue-info lines that share the time format', () => {
    expect(items.some((i) => /Box Office|located at/i.test(i.title))).toBe(false);
  });

  it('survives an empty or malformed feed without wiping the schedule', () => {
    expect(ingestScheduleFeed(null)).toEqual([]);
    expect(ingestScheduleFeed({})).toEqual([]);
    expect(ingestScheduleFeed({ mainContent: '<p>nothing here</p>' })).toEqual([]);
  });
});
