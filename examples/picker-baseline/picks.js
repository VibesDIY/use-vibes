// Joining favorite/shift docs to the schedule for a given audience. Pure.
//
// Read-visibility is NOT enforced here — the platform already decided which docs this
// client can read (access.js `audience: { followersOf }`), so a handle whose picks
// aren't shared simply has no favorite docs in the local store and lands as an empty
// list. These helpers only ever filter what already arrived.
import { byStart } from './schedule-build.js';

// Favorites and shifts written while signed out carry no userId.
export const ownerOf = (doc) => doc.userId || 'anonymous';

export const favoriteEventsFor = (handle, allFavorites, events) => {
  const ids = new Set(allFavorites.filter((f) => ownerOf(f) === handle).map((f) => f.eventId));
  return events.filter((e) => ids.has(e.eventId)).sort(byStart);
};

// Private extras deliberately never leave their owner: only `shareWithFriends` ones.
export const sharedShiftsFor = (handle, allShifts) =>
  allShifts.filter((s) => s.shareWithFriends && ownerOf(s) === handle);

// One handle's schedule, or (unified) everyone in `union` merged with each event
// carrying the `pickedBy` handles so the view can attribute picks.
export const audienceFavoriteEvents = ({ allFavorites, events, union, only }) => {
  const pickedBy = new Map();
  for (const f of allFavorites) {
    const uid = ownerOf(f);
    if (union ? union.has(uid) : uid === only) {
      if (!pickedBy.has(f.eventId)) pickedBy.set(f.eventId, []);
      pickedBy.get(f.eventId).push(uid);
    }
  }
  return events
    .filter((e) => pickedBy.has(e.eventId))
    .map((e) => (union ? { ...e, pickedBy: pickedBy.get(e.eventId).sort() } : e))
    .sort(byStart);
};

export const audienceShifts = ({ allShifts, union, only }) =>
  allShifts
    .filter((s) => s.shareWithFriends && (union ? union.has(ownerOf(s)) : ownerOf(s) === only))
    .map((s) => (union ? { ...s, pickedBy: [ownerOf(s)] } : s));

// Per-event: handles you FOLLOW who picked it (never yourself), so the All Events list
// can show their tags at a glance. Independent of any schedule selection.
export const picksByEvent = (allFavorites, followedHandles, selfHandle) => {
  const m = new Map();
  for (const f of allFavorites) {
    const uid = ownerOf(f);
    if (uid !== selfHandle && followedHandles.has(uid)) {
      const arr = m.get(f.eventId);
      if (arr) arr.push(uid);
      else m.set(f.eventId, [uid]);
    }
  }
  for (const arr of m.values()) arr.sort();
  return m;
};

// Super-mode aggregates. Both scan every readable favorite, so callers compute them
// only in super mode.
export const countsByEvent = (allFavorites) => {
  const m = {};
  for (const f of allFavorites) m[f.eventId] = (m[f.eventId] || 0) + 1;
  return m;
};

export const pickersByCount = (allFavorites) => {
  const map = new Map();
  for (const f of allFavorites) {
    const uid = ownerOf(f);
    if (!map.has(uid)) map.set(uid, { userId: uid, count: 0 });
    map.get(uid).count++;
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
};
