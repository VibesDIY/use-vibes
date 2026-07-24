import { describe, it, expect } from 'vitest';
import { FESTIVAL } from './festival-config.js';
import { NAV_TABS, visibleTabs } from './festival-utils.js';

describe('visibleTabs', () => {
  it('full tier shows the whole picker', () => {
    expect(visibleTabs('full')).toEqual(['browse', 'favorites', 'shifts', 'schedule', 'friends']);
  });

  // Following friends is the sharing loop these apps exist for, and a friend's
  // FAVORITES exist whether or not the festival has announced set times. Only the
  // time-based views (the day-by-day schedule and the extras planner built on it)
  // drop out on a lineup-tier festival.
  it('lineup tier hides only the time-based views, never follows', () => {
    expect(visibleTabs('lineup')).toEqual(['browse', 'favorites', 'friends']);
  });
});

describe("Hinterland's tier", () => {
  it('is full — the set times are announced', () => {
    expect(FESTIVAL.tier).toBe('full');
    for (const e of [...visibleTabs(FESTIVAL.tier)])
      expect(['browse', 'favorites', 'shifts', 'schedule', 'friends']).toContain(e);
  });

  // The nav gate is only meaningful if every tab this app renders maps onto a
  // canonical tab — an unmapped tab would be silently hidden. App.jsx renders
  // Object.keys(NAV_TABS), so coverage holds by construction; pin the shipped
  // tab list and its targets so a rename can't quietly drop a view.
  it('maps every nav tab onto a canonical tab', () => {
    expect(Object.keys(NAV_TABS)).toEqual([
      'now',
      'browse',
      'bands',
      'favorites',
      'friends',
      'shifts',
      'schedule',
    ]);
    const canonical = visibleTabs('full');
    for (const target of Object.values(NAV_TABS)) expect(canonical).toContain(target);
  });

  it('keeps every nav tab visible at full tier', () => {
    const shown = Object.keys(NAV_TABS).filter((v) => visibleTabs('full').includes(NAV_TABS[v]));
    expect(shown).toEqual(Object.keys(NAV_TABS));
  });
});
