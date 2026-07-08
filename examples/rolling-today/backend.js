// Rolling Today backend: serve a user's starred rides as a live .ics feed.
//
// GET /_api/faves.ics?t=<token>
//   → 200 text/calendar — the SUBSCRIPTION lane (webcal://). The token is a
//   per-user RANDOM CAPABILITY (a `caltoken` doc the user creates by asking
//   for a calendar link — opt-in, nothing is generated for users who never
//   ask). Unlike a handle-keyed URL it is unguessable, and revocable: delete
//   the token doc and the feed goes empty on the next refresh. It is still a
//   live feed — new stars flow to every subscriber (including friends you
//   hand the link to) without re-subscribing.
//
// Same architecture as pickathon-picker's backend (see that RUNBOOK for the
// full story): anonymous GETs can't read the db — ctx.db.query denies
// anonymous callers outright, and denies access-fn-bound dbs on the
// user-triggerable `fetch` lane regardless (#3085). Only the `scheduled` lane
// (owner, admin mode) may read "rolling-today", so a 1-minute tick aggregates
// handle → starred rides into module state shared by all handler lanes, and
// the GET serves from that cache. Rolling-today twists:
//
// - Favorites carry a SNAPSHOT of the ride (date/time/title/venue/…), so the
//   backend can always serve something. The live shift2bikes feed is joined
//   per refresh to OVERRIDE times/titles (rides move) and to DROP cancelled
//   rides; when the feed is unreachable we fall back to snapshots instead of
//   erroring — established subscribers keep a usable calendar.
// - LEGACY favorites (pre-snapshot: just a rideId, keyed by userSlug not
//   userId) resolve only through the feed window; unmatched ones drop out.
// - Cold cache (fresh isolate, no tick yet) serves an EMPTY but VALID
//   calendar with no-store — never a 503, which iOS renders as "Validation
//   failed" at add time. (No anchor event here: unlike the festival's fixed
//   Gates Open, Bike Summer has no date this code can assert.)
// - Privacy: favorites in this app are PUBLIC-read by design (access.js
//   grants the favorites channel to public), so the by-handle feed exposes
//   nothing the sync protocol doesn't already. Notes stay private and never
//   enter the aggregate.
//
// This file runs ALONE in the backend isolate — no import resolution — so the
// timezone/ICS helpers are duplicated from the pickathon backend on purpose.

export const config = { scheduled: { interval: "1m" } };

const RIDES_TZ = "America/Los_Angeles";
export const FEED_URL = "https://www.shift2bikes.org/api/events.php";
// Live-join window: today forward. Past rides serve from snapshots (their
// times can no longer change); rides beyond the window resolve on a later
// refresh as they roll into it. The API rejects ranges over 100 days
// ("event range too large") with a 200 + error body, and 60 days of peak
// Bike Summer is ~900KB — comfortable under the 10MB egress cap.
const FEED_WINDOW_DAYS = 60;
const DEFAULT_RIDE_HOURS = 2; // feed endtime is often empty

const hasExplicitTZ = (s) => /([+-]\d\d:\d\d|Z)$/.test(s);
const ensureT = (s = "") => (s.includes("T") ? s : s.replace(" ", "T"));

const _offsetFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: RIDES_TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
const tzOffsetMinutes = (date) => {
  const p = Object.fromEntries(_offsetFmt.formatToParts(date).map((x) => [x.type, x.value]));
  const asIfUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return (asIfUTC - date.getTime()) / 60000;
};

const parseToDate = (s) => {
  if (typeof s !== "string" || s === "") return null;
  const t = ensureT(s);
  let d;
  if (hasExplicitTZ(t)) {
    d = new Date(t);
  } else {
    const utcGuess = new Date(t + "Z");
    if (isNaN(utcGuess)) return null;
    d = new Date(utcGuess.getTime() - tzOffsetMinutes(utcGuess) * 60000);
  }
  return isNaN(d) ? null : d;
};

const epochToIcs = (ms) => new Date(ms).toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";

export const toIcsUtc = (s) => {
  const d = parseToDate(s);
  return d === null ? null : epochToIcs(d.getTime());
};

// en-CA formats as YYYY-MM-DD — today's date in ride-local time.
const _ymdFmt = new Intl.DateTimeFormat("en-CA", { timeZone: RIDES_TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const todayYmd = () => _ymdFmt.format(new Date());
const addDaysYmd = (ymd, n) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

// RFC 5545 §3.3.11 TEXT escaping. Backslash first, or it would double-escape
// the escapes it just produced.
export const escapeIcsText = (s) =>
  String(s)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");

// RFC 5545 §3.1 line folding: 75 OCTETS per line, continuation space counts.
const utf8Octets = (ch) => {
  const c = ch.codePointAt(0);
  return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
};
export const foldIcsLine = (line) => {
  const parts = [];
  let cur = "";
  let bytes = 0;
  let budget = 75;
  for (const ch of line) {
    const len = utf8Octets(ch);
    if (bytes + len > budget) {
      parts.push(cur);
      cur = "";
      bytes = 0;
      budget = 74;
    }
    cur += ch;
    bytes += len;
  }
  parts.push(cur);
  return parts.join("\r\n ");
};

export const MAX_ITEMS = 500;
const MAX_TEXT = 300;
const MAX_DESC = 1000;
const MAX_URL = 1000;
const MAX_ID = 200;

// Per-item validation/normalization (same contract as pickathon-picker):
// strict on title/start/end; drops unusable decorations silently. end===start
// rejected; end-before-start treated as past-midnight and bumped a day.
export const validateFavesItem = (it) => {
  if (it === null || typeof it !== "object") return { ok: false, error: "must be an object" };
  const title = typeof it.title === "string" ? it.title.trim() : "";
  if (title === "") return { ok: false, error: "title must be a non-empty string" };
  const startDate = parseToDate(it.start);
  if (startDate === null) return { ok: false, error: "start is not a parseable time" };
  const endDate = parseToDate(it.end);
  if (endDate === null) return { ok: false, error: "end is not a parseable time" };
  let endMs = endDate.getTime();
  if (endMs === startDate.getTime()) return { ok: false, error: "has zero duration (end equals start)" };
  if (endMs < startDate.getTime()) endMs += 24 * 60 * 60 * 1000;
  if (endMs <= startDate.getTime()) return { ok: false, error: "end is before its start" };
  const item = { title: title.slice(0, MAX_TEXT), start: epochToIcs(startDate.getTime()), end: epochToIcs(endMs) };
  if (typeof it.location === "string" && it.location.trim() !== "") {
    item.location = it.location.trim().slice(0, MAX_TEXT);
  }
  if (typeof it.description === "string" && it.description.trim() !== "") {
    item.description = it.description.trim().slice(0, MAX_DESC);
  }
  // URL is URI-valued and emitted VERBATIM (no TEXT escaping), so it must
  // contain no whitespace/control chars — an embedded CR/LF would inject
  // ICS lines.
  if (typeof it.url === "string" && /^https?:\/\/[^\s\x00-\x1f\x7f]+$/i.test(it.url) && it.url.length <= MAX_URL) {
    item.url = it.url;
  }
  if (typeof it.id === "string" && it.id !== "") item.id = it.id.slice(0, MAX_ID);
  return { ok: true, item };
};

// LENIENT, per-item: rows come from the db aggregate and the ride feed —
// sources the subscriber doesn't control — so one malformed row drops out
// instead of failing the whole feed.
export const sanitizeFavesItems = (rows) =>
  rows
    .map((row) => validateFavesItem(row))
    .filter((r) => r.ok)
    .map((r) => r.item);

const icsUid = (item) => {
  const key = item.id || `${item.title}-${item.start}`;
  return `${key.replace(/[^A-Za-z0-9._-]/g, "-")}@rolling-today.vibes.diy`;
};

export const buildFavesCalendar = (items, { now, calName } = {}) => {
  const dtstamp = (now ? new Date(now) : new Date()).toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//vibes.diy//rolling-today//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(calName || "Rolling Today")}`,
    `X-WR-TIMEZONE:${RIDES_TZ}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
  ];
  const sorted = [...items].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  for (const item of sorted) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${escapeIcsText(icsUid(item))}`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART:${item.start}`);
    lines.push(`DTEND:${item.end}`);
    lines.push(`SUMMARY:${escapeIcsText(item.title)}`);
    if (item.location) lines.push(`LOCATION:${escapeIcsText(item.location)}`);
    if (item.description) lines.push(`DESCRIPTION:${escapeIcsText(item.description)}`);
    // URI-valued, emitted verbatim — validated upstream.
    if (item.url) lines.push(`URL:${item.url}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
};

// ── Aggregation (scheduled lane) ─────────────────────────────────────────────

// The cross-lane cache: written by `scheduled` (the only lane that may read
// the access-fn-bound db), read by anonymous GETs. Null until the first tick.
let subCache = null;
export const __resetSubCacheForTests = () => {
  subCache = null;
};

// Snapshot fields the calendar needs (stored on the favorite at star time).
const snapOf = (ev) =>
  ev && typeof ev === "object" && typeof ev.date === "string" && ev.date !== ""
    ? {
        date: ev.date,
        time: typeof ev.time === "string" ? ev.time : "",
        endtime: typeof ev.endtime === "string" ? ev.endtime : "",
        title: typeof ev.title === "string" ? ev.title : "",
        venue: typeof ev.venue === "string" ? ev.venue : "",
        address: typeof ev.address === "string" ? ev.address : "",
        organizer: typeof ev.organizer === "string" ? ev.organizer : "",
        timedetails: typeof ev.timedetails === "string" ? ev.timedetails : "",
        weburl: typeof ev.weburl === "string" ? ev.weburl : "",
      }
    : null;

// 1-minute aggregation tick. Admin-lane read (unfiltered), so THIS code picks
// what becomes feed-visible: starred rides only — notes and friend edges never.
// Legacy favorites (pre-snapshot schema) carry userSlug instead of userId.
// `tokens` maps each caltoken's random capability → the owning handle; a feed
// is reachable ONLY through a token (opt-in: no token doc, no calendar).
export async function scheduled(event, ctx) {
  const docs = await ctx.db.query({ db: "rolling-today" });
  const users = new Map();
  const tokens = new Map();
  for (const d of docs) {
    if (!d) continue;
    if (d.type === "caltoken") {
      if (typeof d.token === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(d.token) && typeof d.userId === "string") {
        tokens.set(d.token, d.userId.toLowerCase());
      }
      continue;
    }
    if (d.type !== "favorite") continue;
    const handle = d.userId ?? d.userSlug;
    if (!handle || typeof handle !== "string") continue;
    const rideId = d.rideId != null ? String(d.rideId) : null;
    if (!rideId) continue;
    const key = handle.toLowerCase();
    if (!users.has(key)) users.set(key, []);
    users.get(key).push({ rideId, snap: snapOf(d.event) });
  }
  // Opt-in means opt-in: keep aggregates ONLY for handles that created a
  // token — no ics data is built for users who never asked for a calendar.
  const optedIn = new Set(tokens.values());
  for (const handle of [...users.keys()]) {
    if (!optedIn.has(handle)) users.delete(handle);
  }
  for (const faves of users.values()) faves.sort((a, b) => (a.rideId < b.rideId ? -1 : 1));
  subCache = { at: Date.parse(event?.scheduledTime) || Date.now(), users, tokens, truncated: docs.length >= 2000 };
}

// ── Feed join (fetch lane) ───────────────────────────────────────────────────

// One ranged fetch covering today → +FEED_WINDOW_DAYS; rows keyed by the same
// per-occurrence id the app favorites by (caldaily_id, falling back to id).
// MUST be globalThis.fetch — bare `fetch` is this module's exported handler.
export const fetchFeedWindow = async () => {
  const start = todayYmd();
  const end = addDaysYmd(start, FEED_WINDOW_DAYS);
  const res = await globalThis.fetch(`${FEED_URL}?startdate=${start}&enddate=${end}`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`shift2bikes feed ${res.status}`);
  const data = await res.json();
  // The API reports errors as 200 + {error} (seen live: "event range too
  // large"). A payload without an events array is a FAILURE — treating it as
  // an empty feed would silently disable the live join.
  if (!data || !Array.isArray(data.events)) {
    throw new Error(`shift2bikes feed shape: ${JSON.stringify(data?.error ?? data).slice(0, 120)}`);
  }
  const byId = new Map();
  for (const ev of data.events) {
    const key = ev?.caldaily_id != null ? String(ev.caldaily_id) : ev?.id != null ? String(ev.id) : null;
    if (key !== null) byId.set(key, ev);
  }
  return byId;
};

const rideDescription = (r) => [r.organizer ? `Led by ${r.organizer}` : "", r.timedetails || ""].filter(Boolean).join("\n");

// A ride (feed row or snapshot) → a pre-validation calendar item.
const rideToItem = (rideId, r) => {
  if (!r || typeof r.date !== "string" || r.date === "" || typeof r.time !== "string" || r.time === "") return null;
  const start = `${r.date}T${r.time}`;
  let end;
  if (typeof r.endtime === "string" && r.endtime !== "" && r.endtime !== r.time) {
    end = `${r.date}T${r.endtime}`; // validator bumps past-midnight ends +24h
  } else {
    const startDate = parseToDate(start);
    if (startDate === null) return null;
    end = new Date(startDate.getTime() + DEFAULT_RIDE_HOURS * 3600_000).toISOString();
  }
  return {
    id: `ride-${rideId}`,
    title: r.title,
    start,
    end,
    location: [r.venue, r.address].filter(Boolean).join(", "),
    description: rideDescription(r),
    url: r.weburl,
  };
};

const textResponse = (status, message, headers = {}) => new Response(message, { status, headers });

const handleSubscription = async (url) => {
  const t = url.searchParams.get("t") ?? "";
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(t)) {
    return textResponse(400, "pass t=<calendar token> — create one from the app's Favorites view");
  }
  // Display-only label: iOS captures the calendar NAME at subscribe time, and
  // a just-minted token often beats the tick — without this the calendar is
  // permanently named "@my". The token alone gates data; `n` labels it.
  const nRaw = (url.searchParams.get("n") ?? "").toLowerCase();
  const displayName = /^[a-z0-9][a-z0-9_-]{0,39}$/.test(nRaw) ? nRaw : null;
  const cold = subCache === null;
  // An unknown token is served as an EMPTY VALID calendar, not a 404: right
  // after the user creates their token, the subscribe tap can beat the next
  // aggregation tick, and iOS renders any add-time failure as "Validation
  // failed". A genuinely revoked token converges to the same empty feed —
  // which is exactly what revocation should look like to a subscriber.
  const handle = cold ? undefined : subCache.tokens.get(t);
  const faves = (handle && subCache.users.get(handle)) || [];
  // Live-join to pick up moved times and drop cancelled rides. On feed
  // failure, snapshots still make a usable calendar; but a fave with NO
  // snapshot and no live row would silently vanish — if the feed failed and
  // any fave has no fallback, answer 503 so subscribers keep previously-
  // synced events instead of a partial/empty 200 (Codex, #3267 review).
  let feed = new Map();
  let feedFailed = false;
  if (faves.length > 0) {
    try {
      feed = await fetchFeedWindow();
    } catch (err) {
      feedFailed = true;
    }
  }
  if (feedFailed && faves.some((f) => !f.snap)) {
    return textResponse(503, "ride feed unavailable — retry shortly", { "retry-after": "300" });
  }
  const rows = [];
  for (const f of faves) {
    const live = feed.get(f.rideId);
    if (live) {
      if (live.cancelled) continue; // star survives in the db; the calendar drops it
      const item = rideToItem(f.rideId, live);
      if (item) rows.push(item);
      continue;
    }
    if (f.snap) {
      const item = rideToItem(f.rideId, f.snap);
      if (item) rows.push(item);
    }
    // legacy snapshot-less fave not in the window: nothing to serve
  }
  const items = sanitizeFavesItems(rows).slice(0, MAX_ITEMS);
  return new Response(buildFavesCalendar(items, { calName: `@${handle ?? displayName ?? "my"} — Rolling Today` }), {
    status: 200,
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "cache-control": cold || !handle ? "no-store" : "public, max-age=300",
    },
  });
};

// The `_api` request arrives prefix-stripped (…/_api/faves.ics → /faves.ics).
export async function fetch(request, ctx) {
  const url = new URL(request.url);
  if (url.pathname !== "/faves.ics") {
    return textResponse(404, "not found — GET /faves.ics?t=<calendar token>");
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return textResponse(405, "method not allowed — GET a subscription", { allow: "GET" });
  }
  return handleSubscription(url);
}
