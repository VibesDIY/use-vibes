import { describe, it, expect } from 'vitest';
import {
  ownerOf,
  favoriteEventsFor,
  sharedShiftsFor,
  audienceFavoriteEvents,
  audienceShifts,
  picksByEvent,
  countsByEvent,
  pickersByCount,
} from './picks.js';
import { eventsFromScheduleDocs } from './schedule-build.js';

const events = eventsFromScheduleDocs([
  { eventId: 'a', title: 'A', start: '2026-07-31T18:00:00', end: '2026-07-31T19:00:00' },
  { eventId: 'b', title: 'B', start: '2026-07-31T20:00:00', end: '2026-07-31T21:00:00' },
  { eventId: 'c', title: 'C', start: '2026-08-01T18:00:00', end: '2026-08-01T19:00:00' },
]);

const fav = (userId, eventId) => ({
  _id: `favorite-${userId}-${eventId}`,
  type: 'favorite',
  userId,
  eventId,
});

describe('ownerOf', () => {
  it('treats a doc with no userId as anonymous (signed-out writes)', () => {
    expect(ownerOf({})).toBe('anonymous');
    expect(ownerOf({ userId: 'alice' })).toBe('alice');
  });
});

describe('favoriteEventsFor', () => {
  it('returns that handle picks only, in start order', () => {
    const all = [fav('alice', 'b'), fav('alice', 'a'), fav('bob', 'c')];
    expect(favoriteEventsFor('alice', all, events).map((e) => e.eventId)).toEqual(['a', 'b']);
  });

  it('is empty for a handle with nothing readable', () => {
    expect(favoriteEventsFor('nobody', [fav('alice', 'a')], events)).toEqual([]);
  });

  it('ignores a favorite whose event is not in the schedule', () => {
    expect(favoriteEventsFor('alice', [fav('alice', 'gone')], events)).toEqual([]);
  });

  it('deduplicates repeated favorites of the same event', () => {
    const all = [fav('alice', 'a'), { ...fav('alice', 'a'), _id: 'dupe' }];
    expect(favoriteEventsFor('alice', all, events)).toHaveLength(1);
  });
});

describe('sharedShiftsFor', () => {
  const shifts = [
    { _id: 's1', userId: 'alice', shareWithFriends: true },
    { _id: 's2', userId: 'alice', shareWithFriends: false },
    { _id: 's3', userId: 'bob', shareWithFriends: true },
  ];

  it('never leaks a private extra', () => {
    expect(sharedShiftsFor('alice', shifts).map((s) => s._id)).toEqual(['s1']);
  });
});

describe('audienceFavoriteEvents', () => {
  const all = [fav('alice', 'a'), fav('bob', 'a'), fav('bob', 'c')];

  it('filters to one handle without a pickedBy tag', () => {
    const out = audienceFavoriteEvents({ allFavorites: all, events, only: 'bob' });
    expect(out.map((e) => e.eventId)).toEqual(['a', 'c']);
    expect(out[0].pickedBy).toBeUndefined();
  });

  it('unifies a set of handles and attributes each pick, sorted', () => {
    const out = audienceFavoriteEvents({
      allFavorites: all,
      events,
      union: new Set(['bob', 'alice']),
    });
    expect(out.map((e) => e.eventId)).toEqual(['a', 'c']);
    expect(out[0].pickedBy).toEqual(['alice', 'bob']);
  });

  it('keeps start order across days', () => {
    const out = audienceFavoriteEvents({
      allFavorites: [fav('bob', 'c'), fav('bob', 'a')],
      events,
      only: 'bob',
    });
    expect(out.map((e) => e.eventId)).toEqual(['a', 'c']);
  });
});

describe('audienceShifts', () => {
  const shifts = [
    { _id: 's1', userId: 'alice', shareWithFriends: true },
    { _id: 's2', userId: 'bob', shareWithFriends: true },
    { _id: 's3', userId: 'bob', shareWithFriends: false },
  ];

  it('tags each unified extra with its owner', () => {
    const out = audienceShifts({ allShifts: shifts, union: new Set(['alice', 'bob']) });
    expect(out.map((s) => s._id)).toEqual(['s1', 's2']);
    expect(out[1].pickedBy).toEqual(['bob']);
  });

  it('leaves a single-handle extra untagged', () => {
    const [only] = audienceShifts({ allShifts: shifts, only: 'alice' });
    expect(only.pickedBy).toBeUndefined();
  });
});

describe('picksByEvent', () => {
  it('maps events to the followed handles who picked them, excluding me', () => {
    const all = [fav('me', 'a'), fav('alice', 'a'), fav('bob', 'a'), fav('stranger', 'b')];
    const m = picksByEvent(all, new Set(['alice', 'bob']), 'me');
    expect(m.get('a')).toEqual(['alice', 'bob']);
    expect(m.has('b')).toBe(false);
  });
});

describe('super-mode aggregates', () => {
  const all = [fav('alice', 'a'), fav('bob', 'a'), fav('bob', 'c')];

  it('counts picks per event', () => {
    expect(countsByEvent(all)).toEqual({ a: 2, c: 1 });
  });

  it('ranks pickers by pick count', () => {
    expect(pickersByCount(all)).toEqual([
      { userId: 'bob', count: 2 },
      { userId: 'alice', count: 1 },
    ]);
  });
});
