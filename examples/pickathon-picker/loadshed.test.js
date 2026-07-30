import { describe, it, expect } from 'vitest';
import {
  LOADSHED_ID,
  LOADSHED_TYPE,
  SHED_OFF,
  SHED_READ_ONLY,
  SHED_SCHEDULE_ONLY,
  shedLevelOf,
  shedLevelFromDocs,
  picksPaused,
  socialPaused,
} from './loadshed.js';

describe('loadshed — the config doc contract', () => {
  it('pins the doc identity the client, access.js and backend.js all agree on', () => {
    // backend.js and access.js cannot import this file (they run alone in the
    // backend isolate), so they carry literal copies — these two assertions are
    // the drift guard for that duplication.
    expect(LOADSHED_ID).toBe('0-load-shed');
    expect(LOADSHED_TYPE).toBe('loadshed');
    // Digit-leading `_id`: sorts ahead of every id this app mints, so the doc
    // rides inside the backend query's 2000-doc cap (§4a).
    expect(LOADSHED_ID[0] >= '0' && LOADSHED_ID[0] <= '9').toBe(true);
  });
});

describe('shedLevelOf — fail-open level parsing', () => {
  it('reads the three known levels', () => {
    expect(shedLevelOf({ level: 'off' })).toBe(SHED_OFF);
    expect(shedLevelOf({ level: 'read-only' })).toBe(SHED_READ_ONLY);
    expect(shedLevelOf({ level: 'schedule-only' })).toBe(SHED_SCHEDULE_ONLY);
  });

  it('FAILS OPEN: an absent doc is fully normal operation', () => {
    // The doc not existing is the normal state of the app — 364 days a year.
    expect(shedLevelOf(undefined)).toBe(SHED_OFF);
    expect(shedLevelOf(null)).toBe(SHED_OFF);
    expect(shedLevelOf({})).toBe(SHED_OFF);
  });

  it('FAILS OPEN on anything unrecognized — a typo must not brick the app', () => {
    // A fat-fingered `db put` during the rush is the likeliest way this doc is
    // ever wrong. Unknown → off, never "shed everything".
    expect(shedLevelOf({ level: 'readonly' })).toBe(SHED_OFF);
    expect(shedLevelOf({ level: 'ON' })).toBe(SHED_OFF);
    expect(shedLevelOf({ level: 42 })).toBe(SHED_OFF);
    expect(shedLevelOf({ level: null })).toBe(SHED_OFF);
  });

  it('tolerates case and stray whitespace in a hand-typed level', () => {
    expect(shedLevelOf({ level: ' Read-Only ' })).toBe(SHED_READ_ONLY);
    expect(shedLevelOf({ level: 'SCHEDULE-ONLY' })).toBe(SHED_SCHEDULE_ONLY);
  });
});

describe('shedLevelFromDocs — the client reads a live query, not one doc', () => {
  it('picks the config doc out of a type-keyed query result', () => {
    expect(shedLevelFromDocs([{ _id: LOADSHED_ID, type: LOADSHED_TYPE, level: 'read-only' }])).toBe(
      SHED_READ_ONLY
    );
  });

  it('ignores a stray doc that is not the config id (nobody else may shed us)', () => {
    // access.js is owner-only-WRITE, so this shouldn't be reachable — but the
    // client should key on the id it owns rather than "whatever came back".
    expect(
      shedLevelFromDocs([{ _id: 'loadshed-forged', type: LOADSHED_TYPE, level: 'schedule-only' }])
    ).toBe(SHED_OFF);
  });

  it('an empty or missing read is normal operation', () => {
    expect(shedLevelFromDocs([])).toBe(SHED_OFF);
    expect(shedLevelFromDocs(undefined)).toBe(SHED_OFF);
  });
});

describe('what each level pauses', () => {
  it('off pauses nothing', () => {
    expect(picksPaused(SHED_OFF)).toBe(false);
    expect(socialPaused(SHED_OFF)).toBe(false);
  });

  it('read-only pauses writes but keeps the social views', () => {
    expect(picksPaused(SHED_READ_ONLY)).toBe(true);
    expect(socialPaused(SHED_READ_ONLY)).toBe(false);
  });

  it('schedule-only pauses writes AND the follower-fan-out views', () => {
    expect(picksPaused(SHED_SCHEDULE_ONLY)).toBe(true);
    expect(socialPaused(SHED_SCHEDULE_ONLY)).toBe(true);
  });
});
