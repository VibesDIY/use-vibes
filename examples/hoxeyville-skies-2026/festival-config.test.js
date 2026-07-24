import { describe, it, expect } from 'vitest';
import { FESTIVAL, SCHEDULE } from './festival-config.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NAIVE_TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

describe('FESTIVAL shape', () => {
  it('has the required identity fields', () => {
    expect(FESTIVAL.name).toBeTruthy();
    expect(FESTIVAL.slug).toMatch(/^[a-z0-9-]+-2026$/);
    expect(FESTIVAL.dbName).toMatch(/^[a-z0-9-]+$/);
    expect(FESTIVAL.year).toBe(2026);
    expect(FESTIVAL.tz).toMatch(/^America\//);
    expect(FESTIVAL.location).toMatch(/, [A-Z]{2}$/);
  });
  it('has ordered local calendar dates', () => {
    expect(FESTIVAL.dates.length).toBeGreaterThan(0);
    for (const d of FESTIVAL.dates) expect(d).toMatch(DATE_RE);
    expect([...FESTIVAL.dates].sort()).toEqual(FESTIVAL.dates);
  });
  it('declares a tier and provenance', () => {
    expect(['full', 'lineup']).toContain(FESTIVAL.tier);
    expect(FESTIVAL.sourceUrls.length).toBeGreaterThan(0);
    for (const u of FESTIVAL.sourceUrls) expect(u).toMatch(/^https:\/\//);
  });
  it('carries the five skin colors', () => {
    for (const k of ['bg', 'card', 'accent', 'text', 'muted'])
      expect(FESTIVAL.colors[k]).toMatch(/^#[0-9a-fA-F]{3,8}$/);
  });
});

describe('SCHEDULE shape', () => {
  it('has unique ids and provenance on every entry', () => {
    expect(SCHEDULE.length).toBeGreaterThan(0);
    const ids = SCHEDULE.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of SCHEDULE) {
      expect(e.band).toBeTruthy();
      expect(e.url).toMatch(/^https:\/\//);
    }
  });
  it('matches the declared tier', () => {
    if (FESTIVAL.tier === 'full') {
      for (const e of SCHEDULE) {
        expect(e.day && FESTIVAL.dates.includes(e.day)).toBe(true);
        expect(e.start).toMatch(NAIVE_TS_RE);
        // Hoxeyville publishes its two midnight "12:00 Acoustic" sets with a
        // start and no announced end. A null end records that faithfully
        // instead of inventing a duration; every set that HAS an end must
        // still be well-formed and strictly after its start.
        if (e.end !== null) {
          expect(e.end).toMatch(NAIVE_TS_RE);
          expect(e.start < e.end).toBe(true);
        }
        expect(FESTIVAL.stages).toContain(e.stage);
      }
    } else {
      for (const e of SCHEDULE) {
        expect(e.day).toBeNull();
        expect(e.start).toBeNull();
        expect(e.end).toBeNull();
        expect(e.stage).toBeNull();
      }
    }
  });
});
