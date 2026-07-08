import React, { useState, useEffect, useMemo, useRef } from "react";
import { useFireproof } from "use-fireproof";
import { useViewer, useVibe } from "use-vibes";
import {
  FESTIVAL_2026,
  toFestivalDate,
  festivalDayFor,
  setsOnNow,
  upNextSets,
  fmtTime,
  fmtDate,
  flattenPretalx,
} from "./festival-utils.js";
import { c } from "./styles.js";
import ScheduleView from "./ScheduleView.jsx";
import TracksView from "./TracksView.jsx";
import NowView from "./NowView.jsx";
import BrowseView from "./BrowseView.jsx";
import FavoritesView from "./FavoritesView.jsx";
import FriendsView, { ALL_FRIENDS } from "./FriendsView.jsx";
import ShiftsView from "./ShiftsView.jsx";

// A friend-connect link arrives as `?friend=<handle>` on the vibes.diy URL, which
// the platform mirrors onto the app's own iframe URL. Read it, then strip it so a
// visitor who copies their address bar doesn't re-share someone else's friend link.
const readFriendParam = () => {
  try {
    const own = new URLSearchParams(window.location.search).get("friend");
    if (own) return own;
  } catch (e) {}
  try {
    if (window.top && window.top !== window) return new URLSearchParams(window.top.location.search).get("friend");
  } catch (e) {}
  return null;
};
const clearFriendParamFromUrl = () => {
  const strip = (loc, hist) => {
    try {
      const u = new URL(loc.href);
      if (u.searchParams.has("friend")) {
        u.searchParams.delete("friend");
        hist.replaceState(null, "", u.pathname + u.search + u.hash);
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
const byTypeFriendSlug = (doc) => [doc.type, doc.friendSlug];

// The three Julia dots, drawn once as a small static inline SVG next to the
// wordmark (no animation → zero repaint tax, and no third-party image fetch).
const JuliaDots = () => (
  <svg viewBox="0 0 24 22" className="h-10 w-auto shrink-0" aria-hidden="true">
    <circle cx="6.2" cy="15.6" r="5.6" fill="#CB3C33" />
    <circle cx="12" cy="6.4" r="5.6" fill="#389826" />
    <circle cx="17.8" cy="15.6" r="5.6" fill="#9558B2" />
  </svg>
);

// Re-stamp a locally-stored doc onto the freshly signed-in handle when useFireproof's
// anonymousLocal store migrates local → cloud on first login. Owned docs are keyed by
// user, so favorites/notes re-key deterministically; shifts get a fresh _id.
const migrateJuliaConDoc = (doc, handle) => {
  if (doc.type === "favorite") return { ...doc, userId: handle, _id: `favorite-${handle}-${doc.eventId}` };
  if (doc.type === "note") return { ...doc, userId: handle, _id: `note-${handle}-${doc.eventId}` };
  if (doc.type === "shift") {
    const { _id, ...rest } = doc;
    return { ...rest, userId: handle };
  }
  return { ...doc, userId: handle };
};

export default function JuliaConPicker() {
  const { viewer, ViewerTag } = useViewer();
  // Optimistic writes + anonymous local writes (with sign-in migration) now come from
  // useFireproof itself: `anonymousLocal` runs put/del/useLiveQuery against a local
  // store while logged out and migrates on first sign-in; the returning-signed-out
  // guard is handled internally. So nothing below branches on auth.
  const { database, useLiveQuery, useDocument } = useFireproof("juliacon2026", {
    anonymousLocal: true,
    migrate: migrateJuliaConDoc,
  });
  const { can, ready } = useVibe("juliacon2026");

  const myHandle = viewer?.userHandle || "anonymous";
  const userId = myHandle;
  const signedIn = Boolean(viewer?.userHandle);

  // Logged-out visitors favorite anonymously (local, migrated on sign-in). Notes/
  // shifts/friends stay signed-in. Gate signed-in writes on the app's own access.js
  // via useVibe().can — the same fn the server runs.
  const canFavorite = signedIn ? ready && Boolean(can?.create?.({ type: "favorite", userId })?.ok) : true;
  const canWrite = ready && signedIn && Boolean(can?.create?.({ type: "shift", userId })?.ok);

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDay, setSelectedDay] = useState("all");
  const [view, setView] = useState("now");
  const [superMode, setSuperMode] = useState(false);
  const [viewingUser, setViewingUser] = useState(null);
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [includeMyFaves, setIncludeMyFaves] = useState(false);
  const [linkedFriend, setLinkedFriend] = useState(null);
  const [friendConfirm, setFriendConfirm] = useState(null);
  const friendScrolledRef = useRef(false);
  // Handles we've already resolved (added or declined) this session, so the confirm
  // prompt doesn't re-appear after the friends list updates.
  const handledFriendRef = useRef(new Set());
  const [pendingDelete, setPendingDelete] = useState(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const [icsError, setIcsError] = useState(null);
  const [icsCopied, setIcsCopied] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  // Mobile-first: render at device width and stop long rows from inducing a
  // *horizontal* scroll, via overflow-x:hidden (which leaves vertical scroll
  // untouched). We deliberately do NOT set maximum-scale/user-scalable — that
  // locked the visual viewport and also blocked vertical scrolling. Accidental
  // double-tap zoom on a heart is instead handled by touch-action:manipulation on the
  // root (see the outer div), which disables tap-zoom without affecting scroll/pinch.
  useEffect(() => {
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "viewport";
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", "width=device-width, initial-scale=1");
    const root = document.documentElement;
    const prev = root.style.overflowX;
    root.style.overflowX = "hidden";
    return () => {
      root.style.overflowX = prev;
    };
  }, []);

  useEffect(() => {
    try {
      const w = typeof window !== "undefined" && window.top && window.top !== window ? window.top : window;
      const params = new URLSearchParams(w.location.search);
      if (params.get("super") === "1") setSuperMode(true);
    } catch (e) {
      const params = new URLSearchParams(window.location.search);
      if (params.get("super") === "1") setSuperMode(true);
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

  // Adding a friend (they can see your schedule) should be deliberate: the add-intent
  // rides in the URL and the parent vibes.diy URL is cross-origin, so we can't strip it
  // there — someone could re-share their address bar and silently propose *their* friend
  // to a third party. So instead of auto-adding, we confirm first (see the prompt effect
  // below, after the friends list is available).
  const confirmAddFriend = () => {
    const slug = friendConfirm;
    if (!slug || !viewer?.userHandle) return;
    handledFriendRef.current.add(slug);
    database
      .put({ _id: `friend-${viewer.userHandle}-${slug}`, type: "friend", userId: viewer.userHandle, friendSlug: slug, createdAt: Date.now() })
      .catch(() => {});
    setSelectedFriend(slug);
    setView("friends");
    setFriendConfirm(null);
  };
  const declineAddFriend = () => {
    if (friendConfirm) handledFriendRef.current.add(friendConfirm);
    setFriendConfirm(null);
    setLinkedFriend(null);
  };

  // Scroll to the friend's schedule once it's rendered (one-time).
  useEffect(() => {
    if (friendScrolledRef.current || !signedIn || !linkedFriend) return;
    if (view !== "friends" || selectedFriend !== linkedFriend) return;
    const el = document.getElementById("friend-schedule");
    if (el) {
      friendScrolledRef.current = true;
      setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 200);
    }
  }, [signedIn, linkedFriend, view, selectedFriend, events.length]);

  useEffect(() => {
    if (!pendingDelete) return;
    const handler = (e) => {
      if (!e.target.closest("[data-pending-delete]")) setPendingDelete(null);
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [pendingDelete]);

  useEffect(() => {
    fetchSchedule();
  }, []);

  const getCached = () => {
    const data = localStorage.getItem("juliacon2026-schedule-cache");
    const ts = +localStorage.getItem("juliacon2026-schedule-timestamp");
    if (!data || !ts) return null;
    return { data: JSON.parse(data), isStale: Date.now() - ts > 600_000 };
  };
  const setCached = (d) => {
    localStorage.setItem("juliacon2026-schedule-cache", JSON.stringify(d));
    localStorage.setItem("juliacon2026-schedule-timestamp", Date.now().toString());
  };

  const fetchSchedule = async () => {
    const cached = getCached();
    if (cached && !cached.isStale) {
      ingest(cached.data);
      setLoading(false);
      return;
    }
    if (cached && cached.isStale) {
      ingest(cached.data);
      setLoading(false);
    }
    try {
      const res = await fetch("https://pretalx.com/juliacon-2026/schedule/export/schedule.json");
      const data = await res.json();
      setCached(data);
      ingest(data);
      setError(null);
    } catch (e) {
      console.error(e);
      if (cached) {
        setError("Using cached data");
        ingest(cached.data);
      } else {
        setError("Failed to load schedule");
      }
    } finally {
      setLoading(false);
    }
  };

  // The pretalx feed nests days → rooms → events; flattenPretalx produces the flat
  // list (guid as eventId, track-colored lineup, 4 AM day cutoff — the same window
  // the feed's own day_start uses).
  const ingest = (data) => {
    setEvents(flattenPretalx(data));
  };

  const getDateForDay = (day) => {
    // Prefer the conference day's canonical calendar date. Since a day groups
    // after-midnight items from the *next* calendar date (4 AM cutoff), we must not
    // derive the header date from a stray early-morning event's start.
    if (FESTIVAL_2026.dates[day]) return FESTIVAL_2026.dates[day];
    const evt = events.find((e) => e.day === day);
    if (evt) return evt.start.split("T")[0];
    const base = new Date(FESTIVAL_2026.fallbackStart);
    const idx = FESTIVAL_2026.dayOrder.indexOf(day);
    const d = new Date(base);
    d.setDate(base.getDate() + Math.max(0, idx));
    return d.toISOString().split("T")[0];
  };

  const { docs: shifts } = useLiveQuery(byTypeUser, { key: ["shift", userId] });
  const { docs: notesDocs } = useLiveQuery(byTypeUser, { key: ["note", userId] });
  const notes = useMemo(() => Object.fromEntries(notesDocs.map((n) => [n.eventId, n.notes])), [notesDocs]);

  const { docs: allFavorites } = useLiveQuery("type", { key: "favorite" });

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
      const uid = f.userId || "anonymous";
      if (!map.has(uid)) map.set(uid, { userId: uid, count: 0 });
      map.get(uid).count++;
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [allFavorites, superMode]);

  // useFireproof applies the write optimistically, so useLiveQuery already reflects a
  // toggle before the server confirms — no app-side overlay needed. Memoized so a stable
  // Set/array identity doesn't re-render every child on unrelated state changes.
  const myFavorites = useMemo(() => allFavorites.filter((f) => (f.userId || "anonymous") === userId), [allFavorites, userId]);
  const myFavIds = useMemo(() => new Set(myFavorites.map((f) => f.eventId)), [myFavorites]);

  const { docs: friends } = useLiveQuery(byTypeUser, { key: ["friend", userId] });
  const { docs: friendedBy } = useLiveQuery(byTypeFriendSlug, { key: ["friend", userId] });

  const friendSlugs = useMemo(() => {
    const s = new Set();
    for (const f of friends) s.add(f.friendSlug);
    for (const f of friendedBy) s.add(f.userId);
    s.delete(userId);
    return s;
  }, [friends, friendedBy, userId]);

  // Once signed in, a captured ?friend link prompts a confirmation before adding —
  // unless you already follow them, in which case just jump to their schedule.
  useEffect(() => {
    if (!signedIn || !linkedFriend || linkedFriend === viewer.userHandle) return;
    if (handledFriendRef.current.has(linkedFriend)) return;
    if (friends.some((f) => f.friendSlug === linkedFriend)) {
      handledFriendRef.current.add(linkedFriend);
      // Clear any prompt we may have opened in an earlier run before `friends` hydrated
      // (useLiveQuery starts empty), so an already-followed user never gets stuck with it.
      setFriendConfirm(null);
      setSelectedFriend(linkedFriend);
      setView("friends");
      return;
    }
    setFriendConfirm(linkedFriend);
  }, [signedIn, linkedFriend, friends, viewer?.userHandle]);

  const friendFavIds = useMemo(() => {
    const s = new Set();
    for (const f of allFavorites) {
      if (friendSlugs.has(f.userId || "anonymous")) s.add(f.eventId);
    }
    return s;
  }, [allFavorites, friendSlugs]);

  // Selecting ALL_FRIENDS unifies everyone you're connected to (Following + Added You,
  // i.e. friendSlugs — plus yourself, when "include my faves" is on) into one schedule;
  // each event carries `pickedBy` handles so the unified view can attribute picks.
  // A single friend keeps the plain per-handle filter.
  const friendFavoriteEvents = useMemo(() => {
    if (!selectedFriend) return [];
    const unified = selectedFriend === ALL_FRIENDS;
    const inUnion = (uid) => friendSlugs.has(uid) || (includeMyFaves && uid === userId);
    const pickedBy = new Map();
    for (const f of allFavorites) {
      const uid = f.userId || "anonymous";
      if (unified ? inUnion(uid) : uid === selectedFriend) {
        if (!pickedBy.has(f.eventId)) pickedBy.set(f.eventId, []);
        pickedBy.get(f.eventId).push(uid);
      }
    }
    return events
      .filter((e) => pickedBy.has(e.eventId))
      .map((e) => (unified ? { ...e, pickedBy: pickedBy.get(e.eventId).sort() } : e))
      .sort((a, b) => toFestivalDate(a.start) - toFestivalDate(b.start));
  }, [selectedFriend, allFavorites, events, friendSlugs, includeMyFaves, userId]);

  const { docs: allShifts } = useLiveQuery("type", { key: "shift" });
  const friendShifts = useMemo(() => {
    if (!selectedFriend) return [];
    const unified = selectedFriend === ALL_FRIENDS;
    return allShifts
      .filter((s) => {
        const uid = s.userId || "anonymous";
        return s.shareWithFriends && (unified ? friendSlugs.has(uid) : uid === selectedFriend);
      })
      .map((s) => (unified ? { ...s, pickedBy: [s.userId || "anonymous"] } : s));
  }, [selectedFriend, allShifts, friendSlugs]);

  // Only days that actually have events or shifts, ordered by the conference day order.
  // We deliberately do NOT seed with the full dayOrder — a conference day with nothing
  // on it shouldn't show up in the picker or as an empty section.
  const displayDays = useMemo(() => {
    const present = new Set([...events.map((e) => e.day), ...shifts.map((s) => s.day)].filter(Boolean));
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
  } = useDocument({ type: "shift", day: "Monday", startTime: "09:00", endTime: "17:00", kind: "Shift", shareWithFriends: false });

  const storeShiftTime = (dayISO, time) => `${dayISO}T${time}:00`;

  const submitShift = async (e) => {
    e?.preventDefault();
    // A cleared time input is an empty string, which would store a malformed
    // `<date>T:00`; require both times so we never persist an unformattable shift.
    if (!shiftForm.startTime || !shiftForm.endTime) return;
    const dayISO = getDateForDay(shiftForm.day);
    await database.put({
      type: "shift",
      day: shiftForm.day,
      startTime: shiftForm.startTime,
      endTime: shiftForm.endTime,
      start: storeShiftTime(dayISO, shiftForm.startTime),
      end: storeShiftTime(dayISO, shiftForm.endTime),
      kind: shiftForm.kind || "Shift",
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
      await database.put({ _id: `favorite-${userId}-${id}`, type: "favorite", eventId: id, userId });
    }
  };

  // Called by NoteField on blur (not per keystroke). NoteField buffers the text.
  const saveNote = async (eventId, noteText) => {
    const existing = notesDocs.find((n) => n.eventId === eventId);
    if (existing) await database.put({ ...existing, notes: noteText });
    else await database.put({ _id: `note-${userId}-${eventId}`, type: "note", eventId, notes: noteText, userId });
  };

  const deleteShift = async (shiftId) => {
    await database.del(shiftId);
  };

  // The persistent-subscription URL (webcal:// opens the iPhone/macOS Calendar
  // subscribe flow; Google Calendar takes the https form via copy). It carries
  // ONLY the token, so it's a LIVE feed: backend.js re-aggregates favorites
  // from the db every few minutes and re-joins talk times against the pretalx
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
  const { docs: calTokens } = useLiveQuery(byTypeUser, { key: ["caltoken", userId] });
  const calToken = calTokens[0]?.token || null;
  useEffect(() => {
    if (view !== "schedule" || !hasSubscribable || calToken) return;
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    const token = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    database.put({ _id: `caltoken-${userId}`, type: "caltoken", userId, token, createdAt: Date.now() }).catch(() => {});
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

  // The Tracks tab groups talks by their pretalx track — the identity that spans
  // multiple time slots here (a minisymposium's talks share a track, not a title).
  const tracksList = useMemo(() => {
    const map = new Map();
    for (const e of events) {
      const key = e.track;
      if (!map.has(key)) map.set(key, { title: key, events: [], lineup: e.lineup, venues: new Set() });
      const track = map.get(key);
      track.events.push(e);
      track.venues.add(e.venueTitle);
    }
    for (const t of map.values()) {
      t.events.sort((a, b) => toFestivalDate(a.start) - toFestivalDate(b.start));
      t.venueList = [...t.venues];
    }
    return [...map.values()].sort((a, b) => a.title.localeCompare(b.title));
  }, [events]);

  const nowSets = useMemo(
    () => setsOnNow(events, nowTick).sort((a, b) => a.venueTitle.localeCompare(b.venueTitle)),
    [events, nowTick]
  );
  const nextSets = useMemo(() => upNextSets(events, nowTick), [events, nowTick]);

  // Search matches talk titles AND speaker names — at a conference, "find the talk
  // by <person>" is as common as finding it by title.
  const filteredEvents = useMemo(
    () =>
      events
        .filter(
          (e) =>
            `${e.title} ${e.speakers || ""}`.toLowerCase().includes(searchTerm.toLowerCase()) &&
            (selectedDay === "all" || e.day === selectedDay)
        )
        .sort((a, b) => toFestivalDate(a.start) - toFestivalDate(b.start)),
    [events, searchTerm, selectedDay]
  );

  const favoriteEvents = useMemo(
    () => events.filter((e) => myFavIds.has(e.eventId)).sort((a, b) => toFestivalDate(a.start) - toFestivalDate(b.start)),
    [events, myFavIds]
  );

  const makeSchedule = (day) => {
    const ev = favoriteEvents.filter((e) => festivalDayFor(e.start) === day);
    const sh = shifts.filter((s) => festivalDayFor(shiftStartRaw(s)) === day);
    return [
      ...ev.map((e) => ({
        type: "event",
        id: e.eventId,
        title: e.title,
        sort: toFestivalDate(e.start),
        venue: e.venueTitle,
        data: e,
      })),
      ...sh.map((s) => ({ type: "shift", id: s._id, sort: toFestivalDate(shiftStartRaw(s)), data: s })),
    ].sort((a, b) => a.sort - b.sort || (a.type === "shift" ? -1 : 1));
  };

  const makeFriendSchedule = (day) => {
    const ev = friendFavoriteEvents.filter((e) => festivalDayFor(e.start) === day);
    const sh = friendShifts.filter((s) => festivalDayFor(shiftStartRaw(s)) === day);
    return [
      ...ev.map((e) => ({
        type: "event",
        id: e.eventId,
        title: e.title,
        sort: toFestivalDate(e.start),
        venue: e.venueTitle,
        data: e,
      })),
      ...sh.map((s) => ({ type: "shift", id: s._id, sort: toFestivalDate(shiftStartRaw(s)), data: s })),
    ].sort((a, b) => a.sort - b.sort || (a.type === "shift" ? -1 : 1));
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
      title={pendingDelete === docId ? "Tap to confirm" : "Remove"}
    >
      {pendingDelete === docId ? "Confirm" : "×"}
    </button>
  );

  // The schedule feed loads behind the full UI: header + nav render immediately,
  // and only the content area shows a loading/error state until events arrive.
  const scheduleLoading = loading && events.length === 0;
  const scheduleError = error && events.length === 0;

  const connectUrl = `https://vibes.diy/vibe/calendar/juliacon-picker/?friend=${encodeURIComponent(userId)}`;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(connectUrl)}`;

  return (
    <div className={`min-h-screen ${c.pageBg}`} style={{ touchAction: "manipulation" }}>
      <div className={`max-w-6xl mx-auto ${c.cardBg} shadow-2xl ${c.border} overflow-hidden`}>
        <div className={`${c.headerBg} ${c.border} p-2.5`}>
          <div className="flex items-start justify-between gap-1 flex-wrap">
            <div className="flex items-center gap-1.5">
              <a
                href="https://juliacon.org/2026/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 shrink-0"
              >
                <JuliaDots />
                <h1 className={`text-4xl font-black ${c.bodyText} mb-[1px]`}>
                  {superMode ? "Super JuliaCon 2026 Picker" : "JuliaCon 2026 Picker"}
                </h1>
              </a>
            </div>
          </div>
          <p className={`${c.bodyText} text-base font-bold`}>August 10–15, 2026</p>
          {error && error.includes("cached") && (
            <div className={`mt-0.5 ${c.pinkBg} text-white px-[3px] py-0.5 rounded-lg text-sm font-bold`}>{error}</div>
          )}
        </div>

        <div className={`${c.navBg} ${c.border} p-2`}>
          <div className="flex flex-wrap gap-[3px]">
            {["now", "browse", "tracks", "favorites", "friends", "shifts", "schedule"]
              .filter((v) => {
                if (v === "now" || v === "browse" || v === "tracks") return true;
                if (v === "favorites") return superMode && canWrite; // super-mode peer picker
                if (v === "schedule") return canFavorite; // anon can view their own favorites schedule
                return canWrite; // friends + extras need a real sign-in
              })
              .map((viewName) => (
                <button key={viewName} onClick={() => setView(viewName)} className={c.navBtn(view === viewName)}>
                  {viewName === "now" && `Now`}
                  {viewName === "browse" && `All Talks`}
                  {viewName === "tracks" && `Tracks`}
                  {viewName === "favorites" && `Favorites (${myFavIds.size})`}
                  {viewName === "friends" && `🙋‍♀️ Friends`}
                  {viewName === "shifts" && `Extras`}
                  {viewName === "schedule" && `My Faves${myFavIds.size > 0 ? ` (${myFavIds.size})` : ""}`}
                </button>
              ))}
          </div>
        </div>

        <div className="p-1.5">
          {scheduleLoading ? (
            <div className="flex flex-col items-center justify-center gap-[5px] py-5">
              <div className="w-16 h-16 rounded-full border-4 border-current border-t-transparent animate-spin"></div>
              <h2 className={`text-3xl font-black text-center ${c.bodyText}`}>Loading the schedule...</h2>
            </div>
          ) : scheduleError ? (
            <div className="py-4 text-center">
              <h2 className={`text-3xl font-black mb-1 ${c.bodyText}`}>Couldn't load the schedule</h2>
              <p className={`text-lg ${c.bodyText} mb-1`}>{error}</p>
              <button onClick={fetchSchedule} className={c.btnPink}>
                Retry
              </button>
            </div>
          ) : (
            <>
              {view === "now" && (
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

          {view === "browse" && (
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

          {view === "tracks" && (
            <TracksView
              tracksList={tracksList}
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

          {view === "favorites" && superMode && (
            <FavoritesView
              favoriteEvents={favoriteEvents}
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

          {view === "friends" && (
            <FriendsView
              friends={friends}
              friendedBy={friendedBy}
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
              renderDeleteX={renderDeleteX}
              pendingDelete={pendingDelete}
              ViewerTag={ViewerTag}
              c={c}
            />
          )}

          {view === "shifts" && (
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

          {view === "schedule" && (
            <div>
              <div className="flex items-center justify-between flex-wrap gap-0.5 mb-1.5">
                <h2 className={`text-2xl font-black ${c.bodyText}`}>My JuliaCon Schedule</h2>
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
                        🔁 Subscribe on iPhone
                      </a>
                    )}
                    {icsSubPath && (
                      <button
                        onClick={copySubscribeLink}
                        className={c.linkBtn}
                        title="Copy the subscription URL — paste into Google Calendar (From URL) or send to a friend"
                        aria-label="Copy subscription link"
                      >
                        {icsCopied ? "✓" : "📋"}
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
                emptyMessage="No talks or extras scheduled"
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

      {!signedIn && (
        // Full-width bar on mobile that cradles the Vibes switch; on desktop it shrinks
        // and right-justifies next to the logo. The invisible spacer reserves the
        // switch/logo footprint (bottom-right platform chrome) so the text sits to its left.
        <div className="fixed bottom-[10px] left-3 right-3 sm:left-auto z-40 pointer-events-none flex justify-end">
          <div className={c.signInCallout}>
            <span className="min-w-0 flex-1 sm:flex-none sm:w-[190px] text-left">
              {linkedFriend
                ? "Sign in via the Vibes DIY logo to add friends"
                : "Sign in via the Vibes DIY logo to share your schedule with friends"}
            </span>
            <div className="w-[120px] shrink-0 self-stretch" aria-hidden="true" />
          </div>
        </div>
      )}

      {friendConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-1" role="dialog" aria-modal="true">
          <div className="bg-white dark:bg-[#262031] rounded-2xl p-2 max-w-sm w-full shadow-2xl">
            <h3 className={`text-xl font-black mb-0.5 ${c.bodyText}`}>Add friend?</h3>
            <p className={`font-bold mb-1.5 ${c.bodyText}`}>
              This link wants to add <span className="text-[#389826]">@{friendConfirm}</span> to your crew. You'll see each other's
              schedules.
            </p>
            <div className="flex gap-[3px] justify-end flex-wrap">
              <button
                onClick={declineAddFriend}
                className="py-1 px-2 font-bold rounded-2xl bg-white dark:bg-[#18161f] text-[#2a2a2a] dark:text-[#ece9f1] border border-black/10 dark:border-white/20 hover:opacity-90 transition-all"
              >
                Not now
              </button>
              <button onClick={confirmAddFriend} className={c.btnPink}>
                Add friend
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
