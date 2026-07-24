import { describe, it, expect } from 'vitest';
import { FESTIVAL, SCHEDULE } from './festival-config.js';
import { FESTIVAL_2026, LOGO_URL, HINTERLAND_SCHEDULE } from './festival-utils.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NAIVE_TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
const STAGE_NAMES = FESTIVAL.stages.map((s) => s.name);

describe('FESTIVAL shape', () => {
  it('has the required identity fields', () => {
    expect(FESTIVAL.name).toBeTruthy();
    expect(FESTIVAL.slug).toMatch(/^[a-z0-9-]+-2026$/);
    expect(FESTIVAL.dbName).toMatch(/^[a-z0-9-]+$/);
    expect(FESTIVAL.year).toBe(2026);
    expect(FESTIVAL.tz).toMatch(/^America\//);
    expect(FESTIVAL.location).toMatch(/, [A-Z]{2}$/);
  });

  // THE load-bearing assertion of this whole file. hinterland-2026 is a LIVE app
  // with real users; the Fireproof database name is the address of every favorite,
  // note, and extra they have already saved. Renaming it orphans all of it.
  it('keeps the live database name', () => {
    expect(FESTIVAL.dbName).toBe('hinterland2026');
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

  // Live-app deviation from the template: stages are objects, because the stage
  // slug is baked into every stored favorite's eventId and the color drives the skin.
  it('names each stage with the slug used in event ids', () => {
    for (const st of FESTIVAL.stages) {
      expect(st.key).toMatch(/^[a-z0-9-]+$/);
      expect(st.name).toBeTruthy();
      expect(st.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
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
    expect(FESTIVAL.tier).toBe('full');
    for (const e of SCHEDULE) {
      expect(e.day && FESTIVAL.dates.includes(e.day)).toBe(true);
      expect(e.start).toMatch(NAIVE_TS_RE);
      expect(e.end).toMatch(NAIVE_TS_RE);
      expect(e.start < e.end).toBe(true);
      expect(STAGE_NAMES).toContain(e.stage);
    }
  });

  // eventIds are USER DATA: they are stored verbatim on live favorite docs. The
  // id must stay the deterministic date|HH:MM|stageSlug|titleSlug it shipped as.
  it('keeps ids consistent with their stage and start time', () => {
    const keyOf = (name) => FESTIVAL.stages.find((s) => s.name === name).key;
    for (const e of SCHEDULE) {
      const [datePart, timePart, stageSlug] = e.id.split('|');
      expect(datePart).toBe(e.start.slice(0, 10));
      expect(timePart).toBe(e.start.slice(11, 16));
      expect(stageSlug).toBe(keyOf(e.stage));
    }
  });
});

// The client reads derived shapes, not the config. These pin the derivation against
// the values the live app shipped with, so an edit to festival-config.js that would
// change what users see fails here instead of in production.
describe('derived live shapes', () => {
  it('rebuilds the weekday calendar the app navigates by', () => {
    expect(FESTIVAL_2026).toEqual({
      dayOrder: ['Thursday', 'Friday', 'Saturday', 'Sunday', 'Monday'],
      dates: {
        Thursday: '2026-07-30',
        Friday: '2026-07-31',
        Saturday: '2026-08-01',
        Sunday: '2026-08-02',
        Monday: '2026-08-03',
      },
      fallbackStart: '2026-07-30T00:00:00',
    });
  });

  it('projects the logo from the config', () => {
    expect(LOGO_URL).toBe(FESTIVAL.logoUrl);
    expect(LOGO_URL).toMatch(/^https:\/\//);
  });

  it('regroups SCHEDULE into the stage-keyed shape the views read', () => {
    expect(Object.keys(HINTERLAND_SCHEDULE)).toEqual(FESTIVAL.stages.map((s) => s.key));
    const flat = Object.values(HINTERLAND_SCHEDULE).flatMap((s) => s.events);
    expect(flat.length).toBe(SCHEDULE.length);
    for (const st of FESTIVAL.stages) {
      const bucket = HINTERLAND_SCHEDULE[st.key];
      expect(bucket.title).toBe(st.name);
      expect(bucket.color).toBe(st.color);
      for (const ev of bucket.events) {
        expect(ev.lineup).toEqual({ id: st.name, color: st.color });
        const src = SCHEDULE.find((e) => e.id === ev.id);
        expect(ev.title).toBe(src.band);
        expect(ev.start).toBe(src.start);
        expect(ev.end).toBe(src.end);
        expect(ev.url).toBe(src.url);
      }
    }
  });
});
