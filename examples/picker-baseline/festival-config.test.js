import { describe, it, expect } from 'vitest';
import { FESTIVAL } from './festival-config.js';
import { config, BACKEND_DB, FESTIVAL_NAME, SCHEDULE_URL, ICS_SLUG } from './backend.js';

// The backend isolate resolves no imports, so backend.js duplicates a handful of
// config values. Duplication is fine; DRIFT is not — a db name that disagrees
// means the tick mirrors the schedule into a store the client never reads, and
// nothing else in the app would fail loudly enough to notice. This is the guard.
describe('festival-config ⇄ backend.js', () => {
  it('addresses the same db from both lanes', () => {
    expect(BACKEND_DB).toBe(FESTIVAL.dbName);
  });

  it('declares that same db in the fetch-lane read grant', () => {
    // The grant has to be a static string literal (the platform validates it at
    // push time), so it cannot reference BACKEND_DB — this is the guard.
    expect(config.fetch.unfilteredReads.dbs).toEqual([FESTIVAL.dbName]);
  });

  it('names the same festival', () => {
    expect(FESTIVAL_NAME).toBe(FESTIVAL.name);
  });

  it('derives the ics slug from the deployed vibe URL', () => {
    expect(FESTIVAL.vibeUrl.endsWith(`/${ICS_SLUG}`)).toBe(true);
  });
});

describe('festival-config shape', () => {
  it('gives every day in dayOrder a calendar date', () => {
    for (const day of FESTIVAL.dayOrder) {
      expect(FESTIVAL.dates[day], `no date for ${day}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('orders the day table chronologically — the app renders days in this order', () => {
    const dates = FESTIVAL.dayOrder.map((d) => FESTIVAL.dates[d]);
    expect([...dates].sort()).toEqual(dates);
  });

  it('starts the clock on or before the first day', () => {
    expect(FESTIVAL.fallbackStart.slice(0, 10) <= FESTIVAL.dates[FESTIVAL.dayOrder[0]]).toBe(true);
  });

  it('points the schedule mirror at a real absolute URL', () => {
    expect(SCHEDULE_URL).toMatch(/^https:\/\//);
  });
});
