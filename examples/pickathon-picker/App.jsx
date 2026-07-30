import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useFireproof } from 'use-fireproof';
import { useSocial, useViewer, useVibe } from 'use-vibes';
import { LOGO_URL, FESTIVAL_TZ, fmtTime, setsOnNow, upNextSets } from './festival-utils.js';
import {
  readFriendParam,
  writeFriendParamToUrl,
  readSuperParam,
  readNowParam,
} from './url-state.js';
import {
  eventsFromScheduleDocs,
  byStart,
  getDateForDay as dateForDay,
  displayDaysFor,
  buildDaySchedule,
  makeShiftBounds,
  retainEvents,
  parseTestClock,
} from './schedule-build.js';
import {
  favoriteEventsFor,
  sharedShiftsFor,
  audienceFavoriteEvents,
  audienceShifts,
  picksByEvent,
  countsByEvent,
  pickersByCount,
} from './picks.js';
import {
  activeFollowHandles,
  followStateMap,
  profilePicksVisible,
  armPath,
} from './social-logic.js';
import { favoriteDocId, noteDocId, migratePickathonDoc, icsSubscribePath, ensureCalToken } from './docs.js';
import {
  LOADSHED_TYPE,
  shedLevelFromDocs,
  picksPaused as picksPausedAt,
  socialPaused as socialPausedAt,
  SHED_BANNER,
  SHED_SOCIAL_LINE,
} from './loadshed.js';
import { c } from './styles.js';
import ScheduleView from './ScheduleView.jsx';
import BandsView from './BandsView.jsx';
import BrowseView from './BrowseView.jsx';
import FavoritesView from './FavoritesView.jsx';
import FriendsView, { ALL_FRIENDS } from './FriendsView.jsx';
import ProfileView from './ProfileView.jsx';
import NowView from './NowView.jsx';
import ShiftsView from './ShiftsView.jsx';
import { ClipboardIcon, CheckIcon } from './icons.jsx';

// The on-site home screen. Temporarily on for owner testing — flip to false (or drop
// 'now' from the tab array below) to hide the tab, its render, and its feeders.
const NOW_VIEW_ENABLED = true;

// Stable index functions — passed to useLiveQuery so Fireproof doesn't rebuild the
// query on every render (an inline arrow is a new reference each time).
const byTypeUser = (doc) => [doc.type, doc.userId];

// Header logo with an offline-safe fallback: the remote PNG is decoration, so when it
// can't load (offline, or the cached view's CSP blocks remote images) swap in an
// inline placeholder instead of a broken-image icon.
function Logo() {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <div
        className="h-32 w-20 shrink-0 flex items-center justify-center text-center leading-tight font-black text-lg text-[#4A4A4A] dark:text-[#e9e9e9]"
        role="img"
        aria-label="Pickathon"
      >
        Pickathon
      </div>
    );
  return (
    <img src={LOGO_URL} alt="Pickathon" className="h-32 w-auto" onError={() => setFailed(true)} />
  );
}

export default function PickathonPicker() {
  const { viewer, ViewerTag } = useViewer();
  // Optimistic writes + anonymous local writes (with sign-in migration) now come from
  // useFireproof itself: local-first writes with cloud+overlay reads are the default
  // for every vibe (the old `anonymousLocal` flag is deprecated and ignored), and the
  // returning-signed-out guard is handled internally. So nothing below branches on auth.
  const { database, useLiveQuery, useDocument } = useFireproof('pickathon', {
    migrate: migratePickathonDoc,
  });
  const { can, ready } = useVibe('pickathon');
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
    followersEnabled,
    requestFollowersAccess,
    setVisibility,
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

  // ── Load shedding (loadshed.js) ─────────────────────────────────────────────
  // One owner-written doc (`0-load-shed`) whose `level` lets the owner pause the
  // expensive viewer-driven parts of the app during the festival rush, with no
  // redeploy. It replicates to EVERY client — anonymous included — because
  // access.js publishes it on the same public channel as the schedule, so this
  // read is a local-store read like the schedule's, not a network round-trip.
  //   ABSENT doc, level "off", or any unrecognized level = FULLY NORMAL
  //   OPERATION. The switch fails open by construction (shedLevelOf): a typo'd
  //   `db put` at 11pm on a Saturday must never brick the app.
  //   "read-only"     — schedule/browse/bands/now keep full function; every write
  //                     affordance goes inert (hearts, band heart, notes, extras).
  //   "schedule-only" — read-only, PLUS the Friends tab and profile views render
  //                     one paused line INSTEAD of mounting their live queries
  //                     (the lazy wrappers below are what makes that a real
  //                     saving: the query lives inside the component).
  // Signed-in and anonymous behave identically. This costs one extra live query
  // — at most one doc — which is the price of the switch being readable at all.
  const { docs: shedDocs } = useLiveQuery('type', { key: LOADSHED_TYPE });
  const shedLevel = shedLevelFromDocs(shedDocs);
  // `picksHeld`: writes are paused. `socialHeld`: the follower fan-out views are
  // paused too. Named as state of the app, not as a permission — `canWrite` and
  // `canFavorite` above stay exactly what access.js says, and the tab bar keeps
  // using those, so shedding never makes a tab vanish.
  const picksHeld = picksPausedAt(shedLevel);
  const socialHeld = socialPausedAt(shedLevel);

  // Docs-first schedule: the festival schedule is server-maintained. A 1-minute
  // `scheduled` tick in backend.js mirrors the pickathon.com feed into public,
  // world-readable `scheduleitem` docs in this same `pickathon` db (access.js).
  // Every client — including anonymous/signed-out — pulls those docs into its
  // LOCAL store on first use of the db, so the schedule renders OFFLINE with no
  // network fetch and no per-user keying. There is no client-side feed fetch.
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDay, setSelectedDay] = useState('all');
  const [view, setView] = useState('browse');
  const [superMode, setSuperMode] = useState(false);
  const [viewingUser, setViewingUser] = useState(null);
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [includeMyFaves, setIncludeMyFaves] = useState(false);
  // Whose profile is open (null = none). It takes over the content area rather than
  // being a tab, and is mirrored to `#friend=` in the URL — so the URL, not a tab
  // selection, is what says a profile is showing.
  const [profileHandle, setProfileHandle] = useState(null);

  // Platform audience-arm consent (#3484): followers see your picks only after
  // YOU arm audience visibility for this app — default off, so every user who
  // shared picks before the gate landed reads as "hasn't picked anything" to
  // their followers. Opening the Follows tab is the clear social-intent moment:
  // invite the not-yet-armed viewer once per session (the platform modal handles
  // prior deny / never-ask policies by resolving quietly — invite, never nag).
  // Someone who just turned pick-sharing OFF must not be invited to turn it back on
  // at the next tab open — that's nagging, not inviting.
  const disarmedRef = useRef(false);
  const askedFollowersRef = useRef(false);
  useEffect(() => {
    if (view !== 'friends' || !signedIn || !socialReady || followersEnabled) return;
    // While shedding at "schedule-only" the Friends tab is a paused line, not the
    // tab — inviting someone to arm pick-sharing for a surface they can't see
    // would be a modal out of nowhere.
    if (socialHeld) return;
    if (askedFollowersRef.current || disarmedRef.current) return;
    askedFollowersRef.current = true;
    requestFollowersAccess();
  }, [view, signedIn, socialReady, followersEnabled, socialHeld, requestFollowersAccess]);

  // The pick-sharing arm is reversible: `setVisibility('private')` turns it back off.
  // NOTE this is the per-app PICKS knob, not account privacy (whether follows need
  // approval) — that one has no setter on this hook at all (platform #4319).
  // Re-arming has two paths and the snapshot can't tell them apart, so we remember who
  // turned it off: someone who disarmed in this session has already consented, and
  // requestFollowersAccess() would re-route the consent matrix (a prior standing deny
  // would no-op confusingly), so that case is a plain level flip. A first-ever arm
  // still goes through requestFollowersAccess — the invite the platform matrix owns.
  const [sharingBusy, setSharingBusy] = useState(false);
  const runSharing = (p) => {
    setSharingBusy(true);
    Promise.resolve(p).finally(() => setSharingBusy(false));
  };
  const stopSharing = () => {
    if (!setVisibility) return;
    disarmedRef.current = true;
    runSharing(setVisibility('private'));
  };
  // `stop` is null on a runtime with no visibility setter — the reverser then simply
  // isn't offered rather than dead-ending.
  const sharingControls = {
    enabled: followersEnabled,
    busy: sharingBusy,
    arm: () => armSharing(),
    stop: setVisibility ? () => stopSharing() : null,
  };
  const armSharing = () => {
    const path = armPath({ disarmed: disarmedRef.current, canSetVisibility: Boolean(setVisibility) });
    runSharing(path === 'level' ? setVisibility('followers') : requestFollowersAccess());
  };

  const [nowTick, setNowTick] = useState(Date.now());

  // The docs-first read: the server-maintained `scheduleitem` docs (one per event,
  // stable _id `schedule-event-<eventId>`) replicated into this client's local
  // store. Issued unconditionally at every mount with a stable shape so the offline
  // read mirror stays warm; anonymous viewers read them too (world-readable via
  // access.js `grant.public`).
  // `fromCache` (platform #4348) is truthful per database: true while these rows come
  // from the local replica with no completed initial pull confirming them this session.
  // It is an affordance, never a paint gate — and it is simply undefined on a runtime
  // that predates it, which reads as "settled" and shows nothing.
  const { docs: scheduleItemDocs } = useLiveQuery('type', {
    key: 'scheduleitem',
  });
  const liveEvents = useMemo(() => eventsFromScheduleDocs(scheduleItemDocs), [scheduleItemDocs]);

  // Retention (see retainEvents): a transient zero-row read must not take the screen away
  // from a visitor who is already looking at the schedule. Writing the ref during render
  // is idempotent — it only ever caches the value we are about to render.
  const lastEventsRef = useRef(liveEvents);
  if (liveEvents.length > 0) lastEventsRef.current = liveEvents;
  const events = retainEvents(liveEvents, lastEventsRef.current);

  // Writes are refused in the offline cached view — surface a notice instead of
  // crashing or silently eating the tap. Success returns the put/del result, so
  // callers that need to know (e.g. the extras form) can check for it.
  const [writeNotice, setWriteNotice] = useState(null);
  const writeNoticeTimer = useRef(null);
  const reportWriteFailure = (e) => {
    console.warn('write refused (offline?)', e);
    setWriteNotice(
      "Couldn't save — you're viewing an offline copy. Make this change again when you're back online."
    );
    clearTimeout(writeNoticeTimer.current);
    writeNoticeTimer.current = setTimeout(() => setWriteNotice(null), 6000);
    return undefined;
  };
  const safeDb = useMemo(
    () => ({
      put: (doc) => database.put(doc).catch(reportWriteFailure),
      del: (id) => database.del(id).catch(reportWriteFailure),
    }),
    [database]
  );


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
    if (readSuperParam()) setSuperMode(true);
  }, []);

  // A `#friend=<handle>` link opens that handle's PROFILE — no sign-in required, and
  // nothing is followed on the visitor's behalf. The platform delivers the host hash
  // into the iframe around boot and fires hashchange if it lands after mount, so
  // listen for both. The param is not consumed: it stays as the open profile's URL.
  // The URL is the source of truth for which profile is open, so a hashchange SETS,
  // SWITCHES, or (browser back to a fragment-less URL) CLOSES it.
  useEffect(() => {
    const sync = () => {
      const fp = readFriendParam();
      setProfileHandle(fp || null);
      // Normalizes a legacy `?friend=` QR to the hash form; a hash link is unchanged.
      if (fp) writeFriendParamToUrl(fp);
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  // Stable across renders: both only call the state setter and the URL mirror.
  // QA scaffolding (`#now=2026-07-31T20:00`): reason from a fixed instant so the Now tab
  // can be checked before the festival starts. Ships harmlessly — an end user who sets
  // it only time-travels their own Now tab, and nothing is written.
  const [testClockRaw, setTestClockRaw] = useState(null);
  useEffect(() => {
    const sync = () => setTestClockRaw(readNowParam());
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  const testClockMs = useMemo(() => parseTestClock(testClockRaw), [testClockRaw]);
  const nowMs = testClockMs ?? nowTick;

  const openProfile = useMemo(
    () => (handle) => {
      if (!handle) return;
      setProfileHandle(handle);
      writeFriendParamToUrl(handle);
    },
    []
  );
  const closeProfile = useMemo(
    () => () => {
      setProfileHandle(null);
      writeFriendParamToUrl(null);
    },
    []
  );

  // Every handle in the app is a link to that handle's profile. ViewerTag exposes no
  // onClick, so wrap it. Most tags sit INSIDE another control (a chip that selects a
  // schedule, a row with an × remove) — stopPropagation lets the tag claim its own hit
  // area without breaking the control around it. Memoized: a fresh component identity
  // every render would remount (and re-fetch) every avatar.
  const ProfileTag = useMemo(() => {
    const Tag = ({ userHandle, ...rest }) => (
      <span
        className="inline-flex cursor-pointer"
        onClick={(e) => {
          e.stopPropagation();
          openProfile(userHandle);
        }}
        title={`See @${userHandle}'s profile`}
      >
        <ViewerTag userHandle={userHandle} {...rest} />
      </span>
    );
    return Tag;
  }, [ViewerTag, openProfile]);

  const getDateForDay = (day) => dateForDay(day, events);

  const { docs: shifts } = useLiveQuery(byTypeUser, { key: ['shift', userId] });
  const { docs: notesDocs } = useLiveQuery(byTypeUser, { key: ['note', userId] });
  const notes = useMemo(
    () => Object.fromEntries(notesDocs.map((n) => [n.eventId, n.notes])),
    [notesDocs]
  );

  const { docs: allFavorites } = useLiveQuery('type', { key: 'favorite' });

  // Global pick counts / leaderboard are only shown in super mode, and they scan every
  // readable favorite — so don't compute them on normal renders.
  const favCounts = useMemo(
    () => (superMode ? countsByEvent(allFavorites) : {}),
    [allFavorites, superMode]
  );

  const favUsers = useMemo(
    () => (superMode ? pickersByCount(allFavorites) : []),
    [allFavorites, superMode]
  );

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
  const followedHandles = useMemo(() => activeFollowHandles(following), [following]);

  // Per-event: the handles of people you FOLLOW who have this set on their picks
  // (excludes yourself), so the All Events list can show their tags at a glance.
  // Independent of the friends-schedule selection — always from the follow graph.
  const nowActive = NOW_VIEW_ENABLED && view === 'now';
  const nowSets = useMemo(
    () =>
      nowActive
        ? setsOnNow(events, nowMs).sort((a, b) => a.venueTitle.localeCompare(b.venueTitle))
        : [],
    [nowActive, events, nowMs]
  );
  const nextSets = useMemo(
    () => (nowActive ? upNextSets(events, nowMs) : []),
    [nowActive, events, nowMs]
  );

  const friendPicksByEvent = useMemo(
    () => picksByEvent(allFavorites, followedHandles, userId),
    [allFavorites, followedHandles, userId]
  );

  // Selecting ALL_FRIENDS unifies everyone you FOLLOW (active edges — plus
  // yourself, when "include my faves" is on) into one schedule;
  // each event carries `pickedBy` handles so the unified view can attribute picks.
  // A single friend keeps the plain per-handle filter.
  // NowView flags a card as a followed pick from the same join the browse list uses —
  // its keys are exactly the events someone you follow has picked (never your own).
  const friendFavIds = useMemo(
    () => (nowActive ? new Set(friendPicksByEvent.keys()) : new Set()),
    [nowActive, friendPicksByEvent]
  );

  const friendUnion = useMemo(() => {
    if (selectedFriend !== ALL_FRIENDS) return null;
    const u = new Set(followedHandles);
    if (includeMyFaves) u.add(userId);
    return u;
  }, [selectedFriend, followedHandles, includeMyFaves, userId]);

  const friendFavoriteEvents = useMemo(
    () =>
      selectedFriend
        ? audienceFavoriteEvents({
            allFavorites,
            events,
            union: friendUnion,
            only: selectedFriend,
          })
        : [],
    [selectedFriend, friendUnion, allFavorites, events]
  );

  // ── Profile page ────────────────────────────────────────────────────────────
  // The profile renders what a FOLLOWER of `profileHandle` sees. For someone else
  // that's the same gate the friends schedule uses (an active follow edge). For your
  // OWN profile we deliberately do NOT fall back to your local favorites: the whole
  // point of previewing your profile is to see what others get, and an account that
  // hasn't armed audience visibility (#3484) shows its followers nothing.
  const followStates = useMemo(() => followStateMap(following), [following]);
  const profileIsSelf = Boolean(profileHandle) && signedIn && profileHandle === myHandle;
  const profileVisible = profilePicksVisible({
    handle: profileHandle,
    isSelf: profileIsSelf,
    followersEnabled,
    followedHandles,
  });

  const profileFavoriteEvents = useMemo(
    () => (profileVisible ? favoriteEventsFor(profileHandle, allFavorites, events) : []),
    [profileHandle, profileVisible, allFavorites, events]
  );

  // Only days that actually have events or shifts, ordered by the festival day order.
  // We deliberately do NOT seed with the full dayOrder — a festival day with nothing on
  // it (e.g. Monday) shouldn't show up in the picker or as an empty section.
  const displayDays = useMemo(() => displayDaysFor(events, shifts), [events, shifts]);

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
    if (picksHeld) return;
    // A cleared time input is an empty string, which would store a malformed
    // `<date>T:00`; require both times so we never persist an unformattable shift.
    if (!shiftForm.startTime || !shiftForm.endTime) return;
    const dayISO = getDateForDay(shiftForm.day);
    const res = await safeDb.put({
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
    if (res) resetShift(); // keep the form on a refused (offline) write
  };

  const toggleFavorite = async (event) => {
    // Belt to the inert-control braces: a render that predates the shed flip (or
    // a stray keyboard activation) must not write. Silent by design — the banner
    // above is already on screen saying picks are paused.
    if (picksHeld) return;
    const id = event.eventId;
    // useFireproof's optimistic overlay flips the heart immediately and rolls back if
    // the write throws; safeDb turns an offline refusal into the notice.
    if (myFavIds.has(id)) {
      const fav = myFavorites.find((f) => f.eventId === id);
      if (fav) await safeDb.del(fav._id);
    } else {
      await safeDb.put({
        _id: favoriteDocId(userId, id),
        type: 'favorite',
        eventId: id,
        userId,
      });
    }
  };

  // Called by NoteField on blur (not per keystroke). NoteField buffers the text.
  const saveNote = async (eventId, noteText) => {
    if (picksHeld) return;
    const existing = notesDocs.find((n) => n.eventId === eventId);
    if (existing) await safeDb.put({ ...existing, notes: noteText });
    else
      await safeDb.put({
        _id: noteDocId(userId, eventId),
        type: 'note',
        eventId,
        notes: noteText,
        userId,
      });
  };

  const deleteShift = async (shiftId) => {
    if (picksHeld) return;
    await safeDb.del(shiftId);
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
  // (The token itself is minted and read inside MyFavesTab — see below.)
  const hasSubscribable = signedIn && (myFavIds.size > 0 || shifts.some((s) => s.shareWithFriends));

  const { shiftStartRaw, shiftEndRaw } = useMemo(() => makeShiftBounds(events), [events]);

  const bandsList = useMemo(() => {
    const map = new Map();
    for (const e of events) {
      const key = e.title;
      if (!map.has(key))
        map.set(key, { title: key, url: e.url, events: [], lineup: e.lineup, venues: new Set() });
      const band = map.get(key);
      band.events.push(e);
      band.venues.add(e.venueTitle);
    }
    for (const b of map.values()) {
      b.events.sort(byStart);
      b.venueList = [...b.venues];
    }
    return [...map.values()].sort((a, b) => a.title.localeCompare(b.title));
  }, [events]);

  const filteredEvents = useMemo(
    () =>
      events
        .filter(
          (e) =>
            e.title.toLowerCase().includes(searchTerm.toLowerCase()) &&
            (selectedDay === 'all' || e.day === selectedDay)
        )
        .sort(byStart),
    [events, searchTerm, selectedDay]
  );

  const favoriteEvents = useMemo(
    () =>
      events
        .filter((e) => myFavIds.has(e.eventId))
        .sort(byStart),
    [events, myFavIds]
  );

  // Super-mode peer picker: when a picker is selected, the favorites list must
  // show THEIR picks (from the readable firehose), not the current user's.
  const viewedFavoriteEvents = useMemo(
    () =>
      !viewingUser || viewingUser === userId
        ? favoriteEvents
        : favoriteEventsFor(viewingUser, allFavorites, events),
    [viewingUser, userId, favoriteEvents, allFavorites, events]
  );

  const makeSchedule = (day) => buildDaySchedule(day, favoriteEvents, shifts, shiftStartRaw);
  // The friend/profile schedules also need the SHARED-extras firehose, so they're
  // built inside the lazy-mounted tab components below (see the block comment there).

  // Hash, not query: hash links stay on the warm HTML-cache path (a query param bypasses
  // it — full SSR on every visit) and the platform's url-state mirror forwards the hash
  // into the iframe. No trailing slash (it costs a 301). Old query QR codes keep working
  // indefinitely via the fallback. The canonical host URL isn't knowable from inside the
  // sandbox, so the vibe path is hardcoded.
  // (When iterating on the qa copy, point this at qa/pickathon-picker so scanned QRs
  // stay inside the test app; flip back to og before promoting.)
  const connectUrl = `https://vibes.diy/vibe/og/pickathon-picker#friend=${encodeURIComponent(userId)}`;

  return (
    <div className={`min-h-screen ${c.pageBg}`} style={{ touchAction: 'manipulation' }}>
      <div className={`max-w-6xl mx-auto ${c.cardBg} shadow-2xl ${c.border} overflow-hidden`}>
        <div className={`${c.headerBg} ${c.border} p-2.5`}>
          <div className="flex items-start justify-between gap-1 flex-wrap">
            <div className="flex items-center gap-1">
              <a
                href="https://pickathon.com"
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0"
              >
                <Logo />
              </a>
              <div>
                <h1 className={`text-4xl font-black ${c.bodyText} mb-[1px]`}>
                  {superMode ? 'SUPER PICKATHON PICKER' : 'PICKATHON PICKER'}
                </h1>
                <p className={`${c.bodyText} text-base font-bold`}>
                  Jul 30 – Aug 2, 2026 · Pendarvis Farm, Happy Valley, OR
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className={`${c.navBg} ${c.border} p-2`}>
          <div className="flex flex-wrap gap-[3px]">
            {['browse', 'bands', 'favorites', 'friends', 'shifts', 'schedule', 'now']
              .filter((v) => {
                if (v === 'now') return NOW_VIEW_ENABLED;
                if (v === 'browse' || v === 'bands') return true;
                if (v === 'favorites') return superMode && canWrite; // super-mode peer picker
                if (v === 'schedule') return canFavorite; // anon can view their own favorites schedule
                return canWrite; // friends + extras need a real sign-in
              })
              .map((viewName) => (
                <button
                  key={viewName}
                  onClick={() => {
                    // An open profile supersedes the tab content, so any tab press
                    // must also leave the profile (and drop #friend= from the URL).
                    closeProfile();
                    setView(viewName);
                  }}
                  className={c.navBtn(!profileHandle && view === viewName)}
                >
                  {viewName === 'now' && `Now`}
                  {viewName === 'browse' && `All Events`}
                  {viewName === 'bands' && `Bands`}
                  {viewName === 'favorites' && `Favorites (${myFavIds.size})`}
                  {/* Display label only (owner's call). The view key, the state and every
                      descriptive sentence keep the followers/following language — the
                      platform copy rule governs data-visibility wording, not this tab. */}
                  {viewName === 'friends' && `Friends`}
                  {viewName === 'shifts' && `Extras`}
                  {viewName === 'schedule' &&
                    `My Faves${myFavIds.size > 0 ? ` (${myFavIds.size})` : ''}`}
                </button>
              ))}
            {superMode && (
              <a
                href="https://pickathon.com/wp-content/uploads/2025/07/2025-Pickathon-Festival-Map_Web_Hyperlinks.pdf"
                target="map"
                rel="noopener noreferrer"
                className={c.navBtn(false)}
              >
                Map (PDF)
              </a>
            )}
          </div>
        </div>

        <div className="p-1.5">
          {/* Load shedding: ONE calm line, above whatever view is open, in the
              same style as the app's other notices. Copy rule
              (agents/local-first-copy-rules.md): say what is paused and that
              nothing is lost — never imply data loss, never promise a time. */}
          {picksHeld && <div className={c.readOnlyBanner}>{SHED_BANNER}</div>}
          {/* An open profile takes over the content area — header and nav stay put,
              and any tab press exits it. */}
          {/* Local-first: the schedule arrives once and then lives in this device's
              store, so this state is a first-visit thing only — never a spinner the
              user meets again. A search with no hits is NOT this state. */}
          {profileHandle && socialHeld ? (
            // "schedule-only": gate BEFORE mounting ProfileTab, which is where the
            // all-users shared-extras live query lives — the whole point of the
            // lazy wrapper. Rendering a line instead of the component is what
            // actually drops the subscription; hiding it with CSS would not.
            <div className={c.readOnlyBanner}>{SHED_SOCIAL_LINE}</div>
          ) : profileHandle ? (
            <ProfileTab
              useLiveQuery={useLiveQuery}
              visible={profileVisible}
              profileFavoriteEvents={profileFavoriteEvents}
              shiftStartRaw={shiftStartRaw}
              handle={profileHandle}
              isSelf={profileIsSelf}
              signedIn={signedIn}
              socialReady={socialReady}
              followState={followStates.get(profileHandle) || null}
              follow={follow}
              unfollow={unfollow}
              sharing={sharingControls}
              schedule={{
                days: displayDays,
                getDateForDay,
                shiftEndRaw,
                fmtTime,
              }}
              ViewerTag={ViewerTag}
              ProfileTag={ProfileTag}
              c={c}
            />
          ) : events.length === 0 && ['now', 'browse', 'bands'].includes(view) ? (
            // Retention means this is now reachable ONLY when the session never held a
            // non-empty schedule — a genuinely empty first visit, which this states
            // correctly. A transient empty read keeps the schedule on screen instead.
            <div className="text-center py-3">
              <h3 className={`text-2xl font-black mb-0.5 ${c.bodyText}`}>
                Downloading the schedule for offline access
              </h3>
            </div>
          ) : (
            <>
              {NOW_VIEW_ENABLED && view === 'now' && (
                <>
                  {testClockMs !== null && (
                    <div className={c.readOnlyBanner}>
                      Test clock:{' '}
                      {new Date(testClockMs)
                        .toLocaleString('en-US', {
                          weekday: 'short',
                          hour: 'numeric',
                          minute: '2-digit',
                          timeZone: FESTIVAL_TZ,
                        })
                        .replace(',', '')}
                    </div>
                  )}
                  <NowView
                    nowSets={nowSets}
                    nextSets={nextSets}
                    nowTick={nowMs}
                    myFavIds={myFavIds}
                    friendPicksByEvent={friendPicksByEvent}
                    ViewerTag={ProfileTag}
                    notes={notes}
                    superMode={superMode}
                    favCounts={favCounts}
                    canWrite={canFavorite}
                    picksPaused={picksHeld}
                    toggleFavorite={toggleFavorite}
                    c={c}
                  />
                </>
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
                  picksPaused={picksHeld}
                  toggleFavorite={toggleFavorite}
                  notes={notes}
                  saveNote={saveNote}
                  superMode={superMode}
                  favCounts={favCounts}
                  friendPicksByEvent={friendPicksByEvent}
                  ViewerTag={ProfileTag}
                  nowTick={nowTick}
                  c={c}
                />
              )}

              {view === 'bands' && (
                <BandsView
                  bandsList={bandsList}
                  myFavIds={myFavIds}
                  canWrite={canFavorite}
                  picksPaused={picksHeld}
                  toggleFavorite={toggleFavorite}
                  favCounts={favCounts}
                  superMode={superMode}
                  c={c}
                  database={safeDb}
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
                  picksPaused={picksHeld}
                  toggleFavorite={toggleFavorite}
                  notes={notes}
                  ViewerTag={ProfileTag}
                  c={c}
                />
              )}

              {/* "schedule-only": same gate as the profile above — the Friends tab
                  is the per-viewer follower fan-out (shared-extras firehose + the
                  social lists), so it is not mounted at all while shedding. */}
              {view === 'friends' && socialHeld && (
                <div className={c.readOnlyBanner}>{SHED_SOCIAL_LINE}</div>
              )}
              {view === 'friends' && !socialHeld && (
                <FriendsTab
                  useLiveQuery={useLiveQuery}
                  followedHandles={followedHandles}
                  socialReady={socialReady}
                  following={following}
                  followers={followers}
                  requests={requests}
                  follow={follow}
                  unfollow={unfollow}
                  approve={approve}
                  removeFollower={removeFollower}
                  sharing={sharingControls}
                  selectedFriend={selectedFriend}
                  setSelectedFriend={setSelectedFriend}
                  includeMyFaves={includeMyFaves}
                  setIncludeMyFaves={setIncludeMyFaves}
                  friendFavoriteEvents={friendFavoriteEvents}
                  canWrite={canWrite}
                  picksPaused={picksHeld}
                  toggleFavorite={toggleFavorite}
                  myFavIds={myFavIds}
                  displayDays={displayDays}
                  getDateForDay={getDateForDay}
                  shiftStartRaw={shiftStartRaw}
                  shiftEndRaw={shiftEndRaw}
                  fmtTime={fmtTime}
                  connectUrl={connectUrl}
                  myHandle={signedIn ? myHandle : null}
                  onOpenProfile={openProfile}
                  ViewerTag={ProfileTag}
                  c={c}
                />
              )}

              {/* The extras list still reads; only the form and its delete/share
                  controls stand down while shedding (canWrite is their only gate,
                  so it arrives already ANDed with the shed level). */}
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
                  canWrite={canWrite && !picksHeld}
                  deleteShift={deleteShift}
                  database={safeDb}
                  c={c}
                />
              )}

              {view === 'schedule' && (
                <MyFavesTab
                  useLiveQuery={useLiveQuery}
                  database={database}
                  userId={userId}
                  hasSubscribable={hasSubscribable}
                  favoriteEvents={favoriteEvents}
                  shifts={shifts}
                  displayDays={displayDays}
                  getDateForDay={getDateForDay}
                  buildSchedule={makeSchedule}
                  notes={notes}
                  saveNote={saveNote}
                  canWrite={canWrite && !picksHeld}
                  canFavorite={canFavorite}
                  picksPaused={picksHeld}
                  toggleFavorite={toggleFavorite}
                  myFavIds={myFavIds}
                  events={events}
                  shiftStartRaw={shiftStartRaw}
                  shiftEndRaw={shiftEndRaw}
                  c={c}
                />
              )}
            </>
          )}
        </div>
      </div>

      {writeNotice && (
        <div className="fixed bottom-24 inset-x-3 z-50 flex justify-center pointer-events-none">
          <div className="bg-[#B22222] text-white px-2.5 py-[7px] rounded-2xl text-sm font-bold shadow-lg text-center max-w-[420px]">
            {writeNotice}
          </div>
        </div>
      )}

      {!signedIn && (
        // Full-width bar on mobile that cradles the Vibes switch; on desktop it shrinks
        // and right-justifies next to the logo. The invisible spacer reserves the
        // switch/logo footprint (bottom-right platform chrome) so the text sits to its left.
        <div className="fixed bottom-[10px] left-3 right-3 sm:left-auto z-40 pointer-events-none flex justify-end">
          <div className={c.signInCallout}>
            <span className="min-w-0 flex-1 sm:flex-none sm:w-[190px] text-left">
              {profileHandle
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

// ── Lazy-mounted, tab-scoped live queries ───────────────────────────────────
// Every useLiveQuery a client holds open is a subscription the platform has to
// service for that viewer's whole visit, and they all land on one single-
// threaded Sessions Durable Object. Two of this app's queries are read on every
// tab and stay mounted at the top: the public `scheduleitem` mirror (the
// schedule itself, and the offline read mirror it keeps warm) and the
// `favorite` firehose (my picks, follower picks, counts, the tab badges).
//
// The rest are not: the all-users SHARED-EXTRAS firehose (`type: 'shift'`) is
// read only by the Friends tab and an open profile, and the calendar token only
// by My Faves. React hooks can't be conditional, so the mechanism is to move the
// hook into the component that is conditionally RENDERED — each of these is
// genuinely unmounted when its tab isn't showing (the tab bodies are `&&`-gated,
// not hidden with CSS), so a viewer who only browses the schedule now opens
// three subscriptions instead of six.
//
// NOT lazy-mounted, deliberately: the private `note` docs. They render on
// Browse — which is the DEFAULT tab, so scoping them would save nothing for the
// common viewer — as well as on Favorites and My Faves, and saveNote reads the
// same docs to decide upsert-vs-create. Splitting that across three mounts
// would trade a real behaviour risk for no measurable fan-out win.
//
// The one thing lazy mounting costs: on the first render after the tab opens
// these queries return [] until the local store answers, so a friend's shared
// extras can appear a frame after their picks. Nothing destructive — but see
// MyFavesTab for the one place where an empty first read WOULD have been.

// Friends tab: the unified/per-handle friend schedule needs shared extras.
function FriendsTab({
  useLiveQuery,
  selectedFriend,
  followedHandles,
  friendFavoriteEvents,
  shiftStartRaw,
  ...rest
}) {
  const { docs: allShifts } = useLiveQuery('type', { key: 'shift' });
  // The unified extras deliberately do NOT include your own (unlike the unified picks,
  // which honour `includeMyFaves`) — that has always been the behaviour here.
  const friendShifts = useMemo(
    () =>
      selectedFriend
        ? audienceShifts({
            allShifts,
            union: selectedFriend === ALL_FRIENDS ? followedHandles : null,
            only: selectedFriend,
          })
        : [],
    [selectedFriend, allShifts, followedHandles]
  );
  const makeFriendSchedule = (day) =>
    buildDaySchedule(day, friendFavoriteEvents, friendShifts, shiftStartRaw);
  return (
    <FriendsView
      selectedFriend={selectedFriend}
      friendFavoriteEvents={friendFavoriteEvents}
      friendShifts={friendShifts}
      makeFriendSchedule={makeFriendSchedule}
      shiftStartRaw={shiftStartRaw}
      {...rest}
    />
  );
}

// An open profile: same firehose, filtered to the one handle's SHARED extras.
// `visible` is the follower-visibility gate computed in App — an unarmed or
// unfollowed profile shows nothing, exactly as before.
function ProfileTab({
  useLiveQuery,
  visible,
  handle,
  profileFavoriteEvents,
  shiftStartRaw,
  schedule,
  ...rest
}) {
  const { docs: allShifts } = useLiveQuery('type', { key: 'shift' });
  const profileShifts = useMemo(
    () => (visible ? sharedShiftsFor(handle, allShifts) : []),
    [handle, visible, allShifts]
  );
  const build = (day) =>
    buildDaySchedule(day, profileFavoriteEvents, profileShifts, shiftStartRaw);
  return (
    <ProfileView handle={handle} schedule={{ ...schedule, build, shiftStartRaw }} {...rest} />
  );
}

// My Faves tab: my own schedule plus the calendar-subscription controls, which
// are the only readers of the caltoken doc.
function MyFavesTab({
  useLiveQuery,
  database,
  userId,
  hasSubscribable,
  favoriteEvents,
  shifts,
  displayDays,
  getDateForDay,
  buildSchedule,
  notes,
  saveNote,
  canWrite,
  canFavorite,
  toggleFavorite,
  myFavIds,
  events,
  shiftStartRaw,
  shiftEndRaw,
  c,
}) {
  const [icsError, setIcsError] = useState(null);
  const [icsCopied, setIcsCopied] = useState(false);
  // LOCAL MINTING of the calendar capability token: generated client-side the
  // moment the schedule tab opens with subscribable content. The optimistic
  // write makes it visible to the live query (and the button URL) instantly;
  // until the backend's ≤1m tick learns it, the endpoint serves the valid
  // anchor-only calendar, so even an immediate subscribe tap can't fail.
  // Opt-in: users who never open this tab get no token and no ics aggregate.
  // The token (not the handle) rides the URL — unguessable, revocable.
  const { docs: calTokens } = useLiveQuery(byTypeUser, { key: ['caltoken', userId] });
  const calToken = calTokens[0]?.token || null;
  // Now that the query mounts WITH this tab, its first read is [] even for a user
  // who already has a token — so the mint asks the store directly rather than
  // trusting that empty read (ensureCalToken, docs.js). Deps keep the previous
  // behaviour that deleting the doc while this tab is open re-mints.
  useEffect(() => {
    if (!hasSubscribable || calToken) return;
    ensureCalToken({
      database,
      userId,
      getRandomValues: (b) => crypto.getRandomValues(b),
    });
  }, [hasSubscribable, calToken, userId, database]);
  const icsSubPath = hasSubscribable ? icsSubscribePath(calToken, userId) : null;
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

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-0.5 mb-1.5">
        <h2 className={`text-2xl font-black ${c.bodyText}`}>My Personal Festival Schedule</h2>
        {(favoriteEvents.length > 0 || shifts.length > 0) && (
          <div className="flex items-center flex-wrap gap-0">
            {icsSubWebcal && (
              <a
                href={icsSubWebcal}
                target="_blank"
                rel="noopener noreferrer"
                className={c.btnPink}
                title="Subscribe in your phone's calendar — it follows your faves live. iOS may warn about an insecure connection; tap Continue (the feed itself is served over https). Share the link and friends can subscribe to your picks."
              >
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
                {icsCopied ? <CheckIcon size={18} /> : <ClipboardIcon size={18} />}
              </button>
            )}
          </div>
        )}
      </div>
      {icsError && <div className={c.readOnlyBanner}>{icsError}</div>}
      <ScheduleView
        days={displayDays}
        getDateForDay={getDateForDay}
        buildSchedule={buildSchedule}
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
        showGaps={false}
      />
    </div>
  );
}
