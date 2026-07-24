import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useFireproof } from 'use-fireproof';
import { useSocial, useViewer, useVibe } from 'use-vibes';
import {
  FESTIVAL,
  FESTIVAL_2026,
  LOGO_URL,
  HINTERLAND_SCHEDULE,
  NAV_TABS,
  visibleTabs,
  ensureT,
  toFestivalDate,
  festivalDayFor,
  setsOnNow,
  upNextSets,
  fmtTime,
  fmtDate,
  decodeEntities,
} from './festival-utils.js';
import { c } from './styles.js';
import ScheduleView from './ScheduleView.jsx';
import BandsView from './BandsView.jsx';
import NowView from './NowView.jsx';
import BrowseView from './BrowseView.jsx';
import FavoritesView from './FavoritesView.jsx';
import FriendsView, { ALL_FRIENDS } from './FriendsView.jsx';
import ShiftsView from './ShiftsView.jsx';

// Re-stamp a locally-stored doc onto the freshly signed-in handle when useFireproof's
// anonymousLocal store migrates local → cloud on first login. Owned docs are keyed by
// user, so favorites/notes re-key deterministically; shifts get a fresh _id.
// A friend-connect link arrives as `?friend=<handle>` on the vibes.diy URL, which
// the platform mirrors onto the app's own iframe URL. Read it, then strip it so a
// visitor who copies their address bar doesn't re-share someone else's friend link.
const readFriendParam = () => {
  try {
    const own = new URLSearchParams(window.location.search).get('friend');
    if (own) return own;
  } catch (e) {}
  try {
    if (window.top && window.top !== window)
      return new URLSearchParams(window.top.location.search).get('friend');
  } catch (e) {}
  return null;
};
const clearFriendParamFromUrl = () => {
  const strip = (loc, hist) => {
    try {
      const u = new URL(loc.href);
      if (u.searchParams.has('friend')) {
        u.searchParams.delete('friend');
        hist.replaceState(null, '', u.pathname + u.search + u.hash);
      }
    } catch (e) {}
  };
  strip(window.location, window.history);
  // The parent vibes.diy URL is cross-origin, so this usually no-ops — best effort.
  try {
    if (window.top && window.top !== window) strip(window.top.location, window.top.history);
  } catch (e) {}
};

// Stable index functions — passed to useLiveQuery so Fireproof doesn't rebuild the
// query on every render (an inline arrow is a new reference each time).
const byTypeUser = (doc) => [doc.type, doc.userId];

// Hinterland brand type + atmosphere, injected once. Fonts are the festival's own
// stack (Migra display serif on headings, Helvetica Now Text on body, Bible Script
// as a single accent). Hotlinked from their Webflow CDN; if the iframe CSP blocks
// font-src these fall through to the platform default and we swap to base64.
const BRAND_STYLE = `
@font-face{font-family:'PP Migra';font-weight:400;font-style:normal;font-display:swap;src:url('https://cdn.prod.website-files.com/66747fd020e5a41628a4a11d/6773183380bd75f7af28df97_PPMigra-Regular.woff2') format('woff2');}
@font-face{font-family:'PP Migra';font-weight:300;font-style:normal;font-display:swap;src:url('https://cdn.prod.website-files.com/66747fd020e5a41628a4a11d/6781df99a67afe34e7e21eaa_PPMigra-Light.woff2') format('woff2');}
@font-face{font-family:'Helvetica Now Text';font-weight:400;font-style:normal;font-display:swap;src:url('https://cdn.prod.website-files.com/66747fd020e5a41628a4a11d/673d5b4937d284a74ac2e80f_HelveticaNowText-Regular.woff2') format('woff2');}
@font-face{font-family:'Helvetica Now Text';font-weight:500;font-style:normal;font-display:swap;src:url('https://cdn.prod.website-files.com/66747fd020e5a41628a4a11d/6782eb1ddeb3c248c2729658_HelveticaNowText-Medium.woff2') format('woff2');}
@font-face{font-family:'Helvetica Now Text';font-weight:700;font-style:normal;font-display:swap;src:url('https://cdn.prod.website-files.com/66747fd020e5a41628a4a11d/6781ebc2e9bf82af7828fc21_HelveticaNowText-Bold.woff2') format('woff2');}
@font-face{font-family:'Bible Script';font-weight:400;font-style:normal;font-display:swap;src:url('https://cdn.prod.website-files.com/66747fd020e5a41628a4a11d/6769a9d2943b937423a19cb6_biblescriptstd-webfont.woff2') format('woff2');}
.hinter-root{font-family:'Helvetica Now Text','Helvetica Neue',Arial,system-ui,sans-serif;}
.hinter-root h1,.hinter-root h2,.hinter-root h3,.hinter-root h4{font-family:'PP Migra','Playfair Display',Georgia,serif;letter-spacing:-0.01em;}
.hinter-script{font-family:'Bible Script','Snell Roundhand',cursive;font-weight:400;letter-spacing:0.01em;}
/* Golden-hour sun-flare: a warm low-sun glow leaking in from the upper corner of
   the dark header, echoing the light-leaks in Hinterland's own photography. Screen
   blend so gold lifts the dark ink into warmth instead of muddying it. */
.hinter-flare{position:absolute;inset:0;z-index:0;pointer-events:none;mix-blend-mode:screen;background:radial-gradient(120% 150% at 88% -25%,rgba(242,180,65,0.60) 0%,rgba(247,177,146,0.32) 34%,rgba(247,177,146,0) 66%);}
/* A whisper of the same warmth washing the top of the page behind the content. */
.hinter-page-flare{position:fixed;top:0;left:0;right:0;height:46vh;z-index:0;pointer-events:none;background:radial-gradient(80% 100% at 82% 0%,rgba(242,180,65,0.13) 0%,rgba(242,180,65,0) 62%);}
`;

const migrateHinterlandDoc = (doc, handle) => {
  if (doc.type === 'favorite')
    return { ...doc, userId: handle, _id: `favorite-${handle}-${doc.eventId}` };
  if (doc.type === 'note') return { ...doc, userId: handle, _id: `note-${handle}-${doc.eventId}` };
  if (doc.type === 'shift') {
    const { _id, ...rest } = doc;
    return { ...rest, userId: handle };
  }
  return { ...doc, userId: handle };
};

// The nav renders NAV_TABS' keys in order, so a tab can never exist without a
// canonical mapping — the tier gate below would silently hide it.
const NAV_ORDER = Object.keys(NAV_TABS);
const TIER_TABS = visibleTabs(FESTIVAL.tier);

export default function HinterlandPicker() {
  const { viewer, ViewerTag } = useViewer();
  // Optimistic writes + anonymous local writes (with sign-in migration) now come from
  // useFireproof itself: `anonymousLocal` runs put/del/useLiveQuery against a local
  // store while logged out and migrates on first sign-in; the returning-signed-out
  // guard is handled internally. So nothing below branches on auth.
  // FESTIVAL.dbName is the LIVE database name. It is pinned by a test — changing it
  // orphans every existing user's favorites, notes, and extras.
  const { database, useLiveQuery, useDocument } = useFireproof(FESTIVAL.dbName, {
    anonymousLocal: true,
    migrate: migrateHinterlandDoc,
  });
  const { can, ready } = useVibe(FESTIVAL.dbName);
  // The follow graph lives in the PLATFORM (Settings → Social) — the app stores
  // no edge docs. `ready` is false for anonymous viewers and during the initial
  // round-trip, so every social surface gates on it. Mutations resolve after the
  // shell pushes a refreshed snapshot, and expected refusals (self-follow,
  // blocked pair, unknown handle) resolve QUIETLY — render from the lists, don't
  // branch on errors that never arrive.
  const {
    ready: socialReady,
    following,
    followers,
    requests,
    follow,
    unfollow,
    approve,
    removeFollower,
  } = useSocial();

  const myHandle = viewer?.userHandle || 'anonymous';
  const userId = myHandle;
  const signedIn = Boolean(viewer?.userHandle);

  // Logged-out visitors favorite anonymously (local, migrated on sign-in). Notes/
  // shifts/friends stay signed-in. Gate signed-in writes on the app's own access.js
  // via useVibe().can — the same fn the server runs.
  const canFavorite = signedIn
    ? ready && Boolean(can?.create?.({ type: 'favorite', userId })?.ok)
    : true;
  const canWrite = ready && signedIn && Boolean(can?.create?.({ type: 'shift', userId })?.ok);

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDay, setSelectedDay] = useState('all');
  const [view, setView] = useState('now');
  const [superMode, setSuperMode] = useState(false);
  const [viewingUser, setViewingUser] = useState(null);
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [includeMyFaves, setIncludeMyFaves] = useState(false);
  const [linkedFriend, setLinkedFriend] = useState(null);
  const friendScrolledRef = useRef(false);
  // Handles this session already followed from a link, so a re-render doesn't
  // re-fire the follow.
  const handledFriendRef = useRef(new Set());
  const [pendingDelete, setPendingDelete] = useState(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const [icsError, setIcsError] = useState(null);
  const [icsCopied, setIcsCopied] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  // Mobile-first: render at device width and stop the wide header art / long rows
  // from inducing a *horizontal* scroll, via overflow-x:hidden (which leaves vertical
  // scroll untouched). We deliberately do NOT set maximum-scale/user-scalable — that
  // locked the visual viewport and also blocked vertical scrolling. Accidental
  // double-tap zoom on a heart is instead handled by touch-action:manipulation on the
  // root (see the outer div), which disables tap-zoom without affecting scroll/pinch.
  useEffect(() => {
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'viewport';
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', 'width=device-width, initial-scale=1');
    const root = document.documentElement;
    const prev = root.style.overflowX;
    root.style.overflowX = 'hidden';
    return () => {
      root.style.overflowX = prev;
    };
  }, []);

  useEffect(() => {
    try {
      const w =
        typeof window !== 'undefined' && window.top && window.top !== window ? window.top : window;
      const params = new URLSearchParams(w.location.search);
      if (params.get('super') === '1') setSuperMode(true);
    } catch (e) {
      const params = new URLSearchParams(window.location.search);
      if (params.get('super') === '1') setSuperMode(true);
    }
  }, []);

  // Capture a `?friend=<handle>` link once, then strip it from the URL. Friend
  // features need a login, so we hold the handle and act on it after sign-in.
  useEffect(() => {
    const fp = readFriendParam();
    if (!fp) return;
    setLinkedFriend(fp);
    clearFriendParamFromUrl();
  }, []);

  // Scroll to the friend's schedule once it's rendered (one-time).
  useEffect(() => {
    if (friendScrolledRef.current || !signedIn || !linkedFriend) return;
    if (view !== 'friends' || selectedFriend !== linkedFriend) return;
    const el = document.getElementById('friend-schedule');
    if (el) {
      friendScrolledRef.current = true;
      setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
    }
  }, [signedIn, linkedFriend, view, selectedFriend, events.length]);

  useEffect(() => {
    if (!pendingDelete) return;
    const handler = (e) => {
      if (!e.target.closest('[data-pending-delete]')) setPendingDelete(null);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [pendingDelete]);

  useEffect(() => {
    fetchSchedule();
  }, []);

  // Door 3: the Hinterland lineup is FINAL and ships no structured feed, so the
  // schedule is a hand-curated snapshot embedded in festival-utils.js (mirrored in
  // backend.js for the .ics feed) — no network fetch, no cron. Kept as a function
  // so the error-retry button and the mount effect share one entry point.
  const fetchSchedule = () => {
    try {
      ingest(HINTERLAND_SCHEDULE);
      setError(null);
    } catch (e) {
      console.error(e);
      setError('Failed to load schedule');
    } finally {
      setLoading(false);
    }
  };

  const ingest = (data) => {
    const list = [];
    for (const vid in data) {
      const v = data[vid];
      for (const e of v.events) {
        const start = ensureT(e.start);
        const end = ensureT(e.end);
        list.push({
          eventId: e.id,
          title: decodeEntities(e.title),
          start,
          end,
          url: e.url,
          venueTitle: decodeEntities(v.title),
          venueColor: v.color,
          lineup: e.lineup || {},
          // Hinterland runs late (Campfire sets past midnight), so a set is grouped by the
          // *festival night* it belongs
          // to, not its raw calendar date: anything before 4 AM counts as the prior day
          // (e.g. a 1 AM Sunday set lives under Saturday). festivalDayFor applies that
          // cutoff, and it's the same rule the faves/friends schedules already use.
          day: festivalDayFor(start),
        });
      }
    }
    setEvents(list);
  };

  const getDateForDay = (day) => {
    // Prefer the festival day's canonical calendar date. Since a day now groups
    // after-midnight sets from the *next* calendar date (4 AM cutoff), we must not
    // derive the header date from a stray early-morning event's start.
    if (FESTIVAL_2026.dates[day]) return FESTIVAL_2026.dates[day];
    const evt = events.find((e) => e.day === day);
    if (evt) return evt.start.split('T')[0];
    const base = new Date(FESTIVAL_2026.fallbackStart);
    const idx = FESTIVAL_2026.dayOrder.indexOf(day);
    const d = new Date(base);
    d.setDate(base.getDate() + Math.max(0, idx));
    return d.toISOString().split('T')[0];
  };

  const { docs: shifts } = useLiveQuery(byTypeUser, { key: ['shift', userId] });
  const { docs: notesDocs } = useLiveQuery(byTypeUser, {
    key: ['note', userId],
  });
  const notes = useMemo(
    () => Object.fromEntries(notesDocs.map((n) => [n.eventId, n.notes])),
    [notesDocs]
  );

  const { docs: allFavorites } = useLiveQuery('type', { key: 'favorite' });

  // Global pick counts / leaderboard are only shown in super mode, and they scan every
  // readable favorite — so don't compute them on normal renders.
  const favCounts = useMemo(() => {
    if (!superMode) return {};
    const m = {};
    for (const f of allFavorites) m[f.eventId] = (m[f.eventId] || 0) + 1;
    return m;
  }, [allFavorites, superMode]);

  const favUsers = useMemo(() => {
    if (!superMode) return [];
    const map = new Map();
    for (const f of allFavorites) {
      const uid = f.userId || 'anonymous';
      if (!map.has(uid)) map.set(uid, { userId: uid, count: 0 });
      map.get(uid).count++;
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [allFavorites, superMode]);

  // useFireproof applies the write optimistically, so useLiveQuery already reflects a
  // toggle before the server confirms — no app-side overlay needed. Memoized so a stable
  // Set/array identity doesn't re-render every child on unrelated state changes.
  const myFavorites = useMemo(
    () => allFavorites.filter((f) => (f.userId || 'anonymous') === userId),
    [allFavorites, userId]
  );
  const myFavIds = useMemo(() => new Set(myFavorites.map((f) => f.eventId)), [myFavorites]);

  // Whose picks I can see = handles I follow with an ACTIVE edge. A follow into
  // a private account sits at state "requested" until they approve — it grants
  // no reads, so including it would only render empty schedule sections.
  const followedHandles = useMemo(
    () => new Set(following.filter((f) => f.state === 'active').map((f) => f.handle)),
    [following]
  );

  // A captured ?friend link now just FOLLOWS the scanned handle once signed in.
  // Following is one-directional — it exposes nothing of YOURS (they see your
  // picks only if they follow you back) — so the old add-friend confirmation
  // dialog is gone: the action is low-stakes and one tap undoes it. A follow
  // into a private account lands as "requested" and their schedule stays empty
  // until they approve.
  useEffect(() => {
    if (!signedIn || !socialReady || !linkedFriend || linkedFriend === viewer.userHandle) return;
    if (handledFriendRef.current.has(linkedFriend)) return;
    handledFriendRef.current.add(linkedFriend);
    const go = () => {
      setSelectedFriend(linkedFriend);
      setView('friends');
    };
    if (followedHandles.has(linkedFriend)) {
      go();
      return;
    }
    follow(linkedFriend).then(go, go);
  }, [signedIn, socialReady, linkedFriend, followedHandles, viewer?.userHandle, follow]);

  const friendFavIds = useMemo(() => {
    const s = new Set();
    for (const f of allFavorites) {
      if (followedHandles.has(f.userId || 'anonymous')) s.add(f.eventId);
    }
    return s;
  }, [allFavorites, followedHandles]);

  // Selecting ALL_FRIENDS unifies everyone you FOLLOW (active edges — plus
  // yourself, when "include my faves" is on) into one schedule;
  // each event carries `pickedBy` handles so the unified view can attribute picks.
  // A single friend keeps the plain per-handle filter.
  const friendFavoriteEvents = useMemo(() => {
    if (!selectedFriend) return [];
    const unified = selectedFriend === ALL_FRIENDS;
    const inUnion = (uid) => followedHandles.has(uid) || (includeMyFaves && uid === userId);
    const pickedBy = new Map();
    for (const f of allFavorites) {
      const uid = f.userId || 'anonymous';
      if (unified ? inUnion(uid) : uid === selectedFriend) {
        if (!pickedBy.has(f.eventId)) pickedBy.set(f.eventId, []);
        pickedBy.get(f.eventId).push(uid);
      }
    }
    return events
      .filter((e) => pickedBy.has(e.eventId))
      .map((e) => (unified ? { ...e, pickedBy: pickedBy.get(e.eventId).sort() } : e))
      .sort((a, b) => toFestivalDate(a.start) - toFestivalDate(b.start));
  }, [selectedFriend, allFavorites, events, followedHandles, includeMyFaves, userId]);

  const { docs: allShifts } = useLiveQuery('type', { key: 'shift' });
  const friendShifts = useMemo(() => {
    if (!selectedFriend) return [];
    const unified = selectedFriend === ALL_FRIENDS;
    return allShifts
      .filter((s) => {
        const uid = s.userId || 'anonymous';
        return s.shareWithFriends && (unified ? followedHandles.has(uid) : uid === selectedFriend);
      })
      .map((s) => (unified ? { ...s, pickedBy: [s.userId || 'anonymous'] } : s));
  }, [selectedFriend, allShifts, followedHandles]);

  // Only days that actually have events or shifts, ordered by the festival day order.
  // We deliberately do NOT seed with the full dayOrder — a festival day with nothing on
  // it (e.g. Monday) shouldn't show up in the picker or as an empty section.
  const displayDays = useMemo(() => {
    const present = new Set(
      [...events.map((e) => e.day), ...shifts.map((s) => s.day)].filter(Boolean)
    );
    const o = FESTIVAL_2026.dayOrder;
    return [...present].sort((a, b) => {
      const ai = o.indexOf(a),
        bi = o.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [events, shifts]);

  const {
    doc: shiftForm,
    merge: mergeShift,
    reset: resetShift,
  } = useDocument({
    type: 'shift',
    day: 'Thursday',
    startTime: '09:00',
    endTime: '17:00',
    kind: 'Shift',
    shareWithFriends: false,
  });

  const storeShiftTime = (dayISO, time) => `${dayISO}T${time}:00`;

  const submitShift = async (e) => {
    e?.preventDefault();
    // A cleared time input is an empty string, which would store a malformed
    // `<date>T:00`; require both times so we never persist an unformattable shift.
    if (!shiftForm.startTime || !shiftForm.endTime) return;
    const dayISO = getDateForDay(shiftForm.day);
    await database.put({
      type: 'shift',
      day: shiftForm.day,
      startTime: shiftForm.startTime,
      endTime: shiftForm.endTime,
      start: storeShiftTime(dayISO, shiftForm.startTime),
      end: storeShiftTime(dayISO, shiftForm.endTime),
      kind: shiftForm.kind || 'Shift',
      shareWithFriends: !!shiftForm.shareWithFriends,
      userId,
    });
    resetShift();
  };

  const toggleFavorite = async (event) => {
    const id = event.eventId;
    // useFireproof's optimistic overlay flips the heart immediately and rolls back if
    // the write throws, so this is just the plain put/del.
    if (myFavIds.has(id)) {
      const fav = myFavorites.find((f) => f.eventId === id);
      if (fav) await database.del(fav._id);
    } else {
      await database.put({
        _id: `favorite-${userId}-${id}`,
        type: 'favorite',
        eventId: id,
        userId,
      });
    }
  };

  // Called by NoteField on blur (not per keystroke). NoteField buffers the text.
  const saveNote = async (eventId, noteText) => {
    const existing = notesDocs.find((n) => n.eventId === eventId);
    if (existing) await database.put({ ...existing, notes: noteText });
    else
      await database.put({
        _id: `note-${userId}-${eventId}`,
        type: 'note',
        eventId,
        notes: noteText,
        userId,
      });
  };

  const deleteShift = async (shiftId) => {
    await database.del(shiftId);
  };

  // The persistent-subscription URL (webcal:// opens the iPhone/macOS Calendar
  // subscribe flow; Google Calendar takes the https form via copy). It carries
  // ONLY the handle, so it's a LIVE feed: backend.js re-aggregates favorites
  // from the db every few minutes and re-joins set times against the schedule
  // feed on each refresh — new picks reach subscribers automatically, and
  // sharing the link lets a friend follow your faves. Signed-in only:
  // anonymous faves live in this browser and never reach the cloud.
  // Offer it only when the feed would actually carry something: favorites, or
  // extras the user marked shareWithFriends — private extras deliberately never
  // enter the subscription (they're still in the Download .ics), so a
  // private-extras-only schedule must not advertise a live link that syncs empty.
  const hasSubscribable = signedIn && (myFavIds.size > 0 || shifts.some((s) => s.shareWithFriends));
  // LOCAL MINTING of the calendar capability token: generated client-side the
  // moment the schedule tab opens with subscribable content. The optimistic
  // write makes it visible to the live query (and the button URL) instantly;
  // until the backend's ≤1m tick learns it, the endpoint serves the valid
  // anchor-only calendar, so even an immediate subscribe tap can't fail.
  // Opt-in: users who never open this tab get no token and no ics aggregate.
  // The token (not the handle) rides the URL — unguessable, revocable.
  const { docs: calTokens } = useLiveQuery(byTypeUser, {
    key: ['caltoken', userId],
  });
  const calToken = calTokens[0]?.token || null;
  useEffect(() => {
    if (view !== 'schedule' || !hasSubscribable || calToken) return;
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    const token = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    database
      .put({
        _id: `caltoken-${userId}`,
        type: 'caltoken',
        userId,
        token,
        createdAt: Date.now(),
      })
      .catch(() => {});
  }, [view, hasSubscribable, calToken, userId, database]);
  const icsSubPath =
    hasSubscribable && calToken
      ? `/_api/faves.ics?t=${encodeURIComponent(calToken)}&n=${encodeURIComponent(userId)}`
      : null;
  // webcal:// — settled ON-DEVICE (2026-07): iOS Safari rejects webcals:// with
  // "address is invalid", so the secure-scheme variant is a dead button. Bare
  // webcal maps to http, which costs one "Insecure Connection" prompt whose
  // Continue works (the actual fetches ride the http→https redirect). Pasting
  // the Copy-link https URL into Settings → Calendar → Add Subscribed Calendar
  // is the prompt-free path.
  const icsSubWebcal = icsSubPath ? `webcal://${window.location.host}${icsSubPath}` : null;

  const copySubscribeLink = async () => {
    if (!icsSubPath) return;
    try {
      await navigator.clipboard.writeText(`https://${window.location.host}${icsSubPath}`);
      setIcsCopied(true);
      setTimeout(() => setIcsCopied(false), 2000);
    } catch (e) {
      setIcsError("Couldn't copy — long-press the Subscribe button instead");
    }
  };

  const shiftStartRaw = (s) => s.start ?? s.startISO ?? `${getDateForDay(s.day)}T${s.startTime}:00`;
  const shiftEndRaw = (s) => s.end ?? s.endISO ?? `${getDateForDay(s.day)}T${s.endTime}:00`;

  const bandsList = useMemo(() => {
    const map = new Map();
    for (const e of events) {
      const key = e.title;
      if (!map.has(key))
        map.set(key, {
          title: key,
          url: e.url,
          events: [],
          lineup: e.lineup,
          venues: new Set(),
        });
      const band = map.get(key);
      band.events.push(e);
      band.venues.add(e.venueTitle);
    }
    for (const b of map.values()) {
      b.events.sort((a, b) => toFestivalDate(a.start) - toFestivalDate(b.start));
      b.venueList = [...b.venues];
    }
    return [...map.values()].sort((a, b) => a.title.localeCompare(b.title));
  }, [events]);

  const nowSets = useMemo(
    () => setsOnNow(events, nowTick).sort((a, b) => a.venueTitle.localeCompare(b.venueTitle)),
    [events, nowTick]
  );
  const nextSets = useMemo(() => upNextSets(events, nowTick), [events, nowTick]);

  const filteredEvents = useMemo(
    () =>
      events
        .filter(
          (e) =>
            e.title.toLowerCase().includes(searchTerm.toLowerCase()) &&
            (selectedDay === 'all' || e.day === selectedDay)
        )
        .sort((a, b) => toFestivalDate(a.start) - toFestivalDate(b.start)),
    [events, searchTerm, selectedDay]
  );

  const favoriteEvents = useMemo(
    () =>
      events
        .filter((e) => myFavIds.has(e.eventId))
        .sort((a, b) => toFestivalDate(a.start) - toFestivalDate(b.start)),
    [events, myFavIds]
  );

  // Super-mode peer picker: when a picker is selected, the favorites list must
  // show THEIR picks (from the readable firehose), not the current user's.
  const viewedFavoriteEvents = useMemo(() => {
    if (!viewingUser || viewingUser === userId) return favoriteEvents;
    const ids = new Set(
      allFavorites.filter((f) => (f.userId || 'anonymous') === viewingUser).map((f) => f.eventId)
    );
    return events
      .filter((e) => ids.has(e.eventId))
      .sort((a, b) => toFestivalDate(a.start) - toFestivalDate(b.start));
  }, [viewingUser, userId, favoriteEvents, allFavorites, events]);

  const makeSchedule = (day) => {
    const ev = favoriteEvents.filter((e) => festivalDayFor(e.start) === day);
    const sh = shifts.filter((s) => festivalDayFor(shiftStartRaw(s)) === day);
    return [
      ...ev.map((e) => ({
        type: 'event',
        id: e.eventId,
        title: e.title,
        sort: toFestivalDate(e.start),
        venue: e.venueTitle,
        data: e,
      })),
      ...sh.map((s) => ({
        type: 'shift',
        id: s._id,
        sort: toFestivalDate(shiftStartRaw(s)),
        data: s,
      })),
    ].sort((a, b) => a.sort - b.sort || (a.type === 'shift' ? -1 : 1));
  };

  const makeFriendSchedule = (day) => {
    const ev = friendFavoriteEvents.filter((e) => festivalDayFor(e.start) === day);
    const sh = friendShifts.filter((s) => festivalDayFor(shiftStartRaw(s)) === day);
    return [
      ...ev.map((e) => ({
        type: 'event',
        id: e.eventId,
        title: e.title,
        sort: toFestivalDate(e.start),
        venue: e.venueTitle,
        data: e,
      })),
      ...sh.map((s) => ({
        type: 'shift',
        id: s._id,
        sort: toFestivalDate(shiftStartRaw(s)),
        data: s,
      })),
    ].sort((a, b) => a.sort - b.sort || (a.type === 'shift' ? -1 : 1));
  };

  const renderDeleteX = (docId) => (
    <button
      data-pending-delete
      onClick={(e) => {
        e.stopPropagation();
        if (pendingDelete === docId) {
          database.del(docId).catch(() => {});
          setPendingDelete(null);
        } else {
          setPendingDelete(docId);
        }
      }}
      className={c.deleteX(pendingDelete === docId)}
      title={pendingDelete === docId ? 'Tap to confirm' : 'Remove'}
    >
      {pendingDelete === docId ? 'Confirm' : '×'}
    </button>
  );

  // The schedule feed loads behind the full UI: header + nav render immediately,
  // and only the content area shows a loading/error state until events arrive.
  const scheduleLoading = loading && events.length === 0;
  const scheduleError = error && events.length === 0;

  const connectUrl = `https://vibes.diy/vibe/festival/hinterland-2026/?friend=${encodeURIComponent(userId)}`;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(connectUrl)}`;

  return (
    <div
      className={`hinter-root min-h-screen relative ${c.pageBg}`}
      style={{ touchAction: 'manipulation' }}
    >
      <style>{BRAND_STYLE}</style>
      <div
        className={`max-w-6xl mx-auto relative z-10 ${c.cardBg} shadow-2xl ${c.border} overflow-hidden`}
      >
        <div className={`${c.headerBg} p-3 relative`}>
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-1.5">
            <span className="order-2 sm:order-1 text-[11px] font-bold uppercase tracking-[0.22em] text-[#353329]/70">
              {superMode ? 'Super' : ''}
            </span>
            <a
              href="https://www.hinterlandiowa.com"
              target="_blank"
              rel="noopener noreferrer"
              className="order-1 sm:order-2 shrink-0"
            >
              <h1 className="text-4xl sm:text-5xl leading-none tracking-tight text-[#353329] font-normal">
                Hinterland
              </h1>
            </a>
            <span className="order-3 text-[12px] font-bold leading-tight text-[#353329]/80 text-center sm:text-right">
              Jul 30 – Aug 2, 2026
              <br />
              St. Charles, Iowa
            </span>
          </div>
          {error && error.includes('cached') && (
            <div
              className={`mt-0.5 ${c.pinkBg} text-white px-[3px] py-0.5 text-sm font-bold relative z-10`}
            >
              {error}
            </div>
          )}
        </div>

        <div className={`${c.navBg} ${c.border} p-2`}>
          <div className="flex flex-wrap gap-[3px]">
            {NAV_ORDER
              // Tier gate on top of the live auth gate. `now` and `bands` are this
              // app's own extra tabs and map onto the canonical `browse`. Hinterland
              // is `full` tier (set times are announced), so this drops nothing today
              // — it's the seam that would hide the time-based views on a lineup-tier
              // festival built from this same client.
              .filter((v) => TIER_TABS.includes(NAV_TABS[v]))
              .filter((v) => {
                if (v === 'now' || v === 'browse' || v === 'bands') return true;
                if (v === 'favorites') return superMode && canWrite; // super-mode peer picker
                if (v === 'schedule') return canFavorite; // anon can view their own favorites schedule
                return canWrite; // friends + extras need a real sign-in
              })
              .map((viewName) => (
                <button
                  key={viewName}
                  onClick={() => setView(viewName)}
                  className={c.navBtn(view === viewName)}
                >
                  {viewName === 'now' && `Now`}
                  {viewName === 'browse' && `All Events`}
                  {viewName === 'bands' && `Bands`}
                  {viewName === 'favorites' && `Favorites (${myFavIds.size})`}
                  {viewName === 'friends' && `Follows`}
                  {viewName === 'shifts' && `Extras`}
                  {viewName === 'schedule' &&
                    `My Faves${myFavIds.size > 0 ? ` (${myFavIds.size})` : ''}`}
                </button>
              ))}
          </div>
        </div>

        <div className="p-1.5">
          {scheduleLoading ? (
            <div className="flex flex-col items-center justify-center gap-[5px] py-5">
              <div className="w-16 h-16 rounded-full border-4 border-current border-t-transparent animate-spin"></div>
              <h2 className={`text-3xl font-black text-center ${c.bodyText}`}>
                Loading the schedule...
              </h2>
            </div>
          ) : scheduleError ? (
            <div className="py-4 text-center">
              <h2 className={`text-3xl font-black mb-1 ${c.bodyText}`}>
                Couldn't load the schedule
              </h2>
              <p className={`text-lg ${c.bodyText} mb-1`}>{error}</p>
              <button onClick={fetchSchedule} className={c.btnPink}>
                Retry
              </button>
            </div>
          ) : (
            <>
              {view === 'now' && (
                <NowView
                  nowSets={nowSets}
                  nextSets={nextSets}
                  nowTick={nowTick}
                  myFavIds={myFavIds}
                  friendFavIds={friendFavIds}
                  canWrite={canFavorite}
                  toggleFavorite={toggleFavorite}
                  c={c}
                />
              )}

              {view === 'browse' && (
                <BrowseView
                  filteredEvents={filteredEvents}
                  searchTerm={searchTerm}
                  setSearchTerm={setSearchTerm}
                  selectedDay={selectedDay}
                  setSelectedDay={setSelectedDay}
                  displayDays={displayDays}
                  getDateForDay={getDateForDay}
                  myFavIds={myFavIds}
                  canWrite={canWrite}
                  canFavorite={canFavorite}
                  toggleFavorite={toggleFavorite}
                  notes={notes}
                  saveNote={saveNote}
                  superMode={superMode}
                  favCounts={favCounts}
                  c={c}
                />
              )}

              {view === 'bands' && (
                <BandsView
                  bandsList={bandsList}
                  myFavIds={myFavIds}
                  canWrite={canFavorite}
                  toggleFavorite={toggleFavorite}
                  favCounts={favCounts}
                  superMode={superMode}
                  c={c}
                  database={database}
                  userId={userId}
                />
              )}

              {view === 'favorites' && superMode && (
                <FavoritesView
                  favoriteEvents={viewedFavoriteEvents}
                  favUsers={favUsers}
                  viewingUser={viewingUser}
                  setViewingUser={setViewingUser}
                  userId={userId}
                  myFavIds={myFavIds}
                  canWrite={canFavorite}
                  toggleFavorite={toggleFavorite}
                  notes={notes}
                  ViewerTag={ViewerTag}
                  c={c}
                />
              )}

              {view === 'friends' && (
                <FriendsView
                  socialReady={socialReady}
                  following={following}
                  followers={followers}
                  requests={requests}
                  follow={follow}
                  unfollow={unfollow}
                  approve={approve}
                  removeFollower={removeFollower}
                  selectedFriend={selectedFriend}
                  setSelectedFriend={setSelectedFriend}
                  includeMyFaves={includeMyFaves}
                  setIncludeMyFaves={setIncludeMyFaves}
                  friendFavoriteEvents={friendFavoriteEvents}
                  friendShifts={friendShifts}
                  canWrite={canWrite}
                  toggleFavorite={toggleFavorite}
                  myFavIds={myFavIds}
                  displayDays={displayDays}
                  getDateForDay={getDateForDay}
                  makeFriendSchedule={makeFriendSchedule}
                  shiftStartRaw={shiftStartRaw}
                  shiftEndRaw={shiftEndRaw}
                  fmtTime={fmtTime}
                  connectUrl={connectUrl}
                  qrSrc={qrSrc}
                  ViewerTag={ViewerTag}
                  c={c}
                />
              )}

              {view === 'shifts' && (
                <ShiftsView
                  shifts={shifts}
                  shiftForm={shiftForm}
                  mergeShift={mergeShift}
                  submitShift={submitShift}
                  displayDays={displayDays}
                  getDateForDay={getDateForDay}
                  shiftStartRaw={shiftStartRaw}
                  shiftEndRaw={shiftEndRaw}
                  canWrite={canWrite}
                  deleteShift={deleteShift}
                  database={database}
                  c={c}
                />
              )}

              {view === 'schedule' && (
                <div>
                  <div className="flex items-center justify-between flex-wrap gap-0.5 mb-1.5">
                    <h2 className={`text-2xl font-black ${c.bodyText}`}>
                      My Personal Festival Schedule
                    </h2>
                    {(favoriteEvents.length > 0 || shifts.length > 0) && (
                      <div className="flex items-center flex-wrap gap-0">
                        {icsSubWebcal && (
                          <a
                            href={icsSubWebcal}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`${c.btnPink} inline-flex items-center gap-1`}
                            title="Subscribe in your phone's calendar — it follows your faves live. iOS may warn about an insecure connection; tap Continue (the feed itself is served over https). Share the link and friends can subscribe to your picks."
                          >
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <rect x="3" y="4" width="18" height="18" rx="0" />
                              <line x1="3" y1="9" x2="21" y2="9" />
                              <line x1="8" y1="2" x2="8" y2="6" />
                              <line x1="16" y1="2" x2="16" y2="6" />
                            </svg>
                            Subscribe on iPhone
                          </a>
                        )}
                        {icsSubPath && (
                          <button
                            onClick={copySubscribeLink}
                            className={c.linkBtn}
                            title="Copy the subscription URL — paste into Google Calendar (From URL) or send to a friend"
                            aria-label="Copy subscription link"
                          >
                            <span className="font-bold text-sm">
                              {icsCopied ? 'Copied' : 'Copy'}
                            </span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {icsError && <div className={c.readOnlyBanner}>{icsError}</div>}
                  <ScheduleView
                    days={displayDays}
                    getDateForDay={getDateForDay}
                    buildSchedule={makeSchedule}
                    fmtTime={fmtTime}
                    notes={notes}
                    c={c}
                    shiftStartRaw={shiftStartRaw}
                    shiftEndRaw={shiftEndRaw}
                    emptyMessage="No events or shifts scheduled"
                    saveNote={saveNote}
                    canWrite={canWrite}
                    onToggleFavorite={canFavorite ? toggleFavorite : null}
                    myFavIds={myFavIds}
                    allEvents={events}
                    showGaps={true}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <footer className="max-w-6xl mx-auto px-3 py-4 text-center">
        <a
          href="https://www.hinterlandiowa.com/set-times-2026"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm font-bold text-[#FBF6EF]/80 hover:text-[#FBF6EF] transition-all underline"
        >
          Official Hinterland set times
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </a>
      </footer>

      {!signedIn && (
        // Full-width bar on mobile that cradles the Vibes switch; on desktop it shrinks
        // and right-justifies next to the logo. The invisible spacer reserves the
        // switch/logo footprint (bottom-right platform chrome) so the text sits to its left.
        <div className="fixed bottom-[10px] left-3 right-3 sm:left-auto z-40 pointer-events-none flex justify-end">
          <div className={c.signInCallout}>
            <span className="min-w-0 flex-1 sm:flex-none sm:w-[190px] text-left">
              {linkedFriend
                ? 'Sign in via the Vibes DIY logo to follow people'
                : 'Sign in via the Vibes DIY logo — followers can see your picks'}
            </span>
            <div className="w-[120px] shrink-0 self-stretch" aria-hidden="true" />
          </div>
        </div>
      )}
    </div>
  );
}
