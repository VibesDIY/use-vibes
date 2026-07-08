import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  toIcsUtc,
  buildFavesCalendar,
  validateFavesItem,
  sanitizeFavesItems,
  scheduled,
  __resetSubCacheForTests,
  FEED_URL,
  fetch as icsFetch,
} from "./backend.js";

// The `_api` request arrives at the handler prefix-stripped, rooted at "/".
const req = (path, init = {}) => new Request(`https://vibe.internal${path}`, init);

// Snapshot shape stored on a favorite at star time (see App.jsx toggleFavorite).
const SNAP = {
  date: "2026-07-10",
  time: "18:00:00",
  endtime: "20:00:00",
  title: "Loop de Loop",
  venue: "Ladds Circle",
  address: "SE 16th & Harrison",
  organizer: "Shift",
  timedetails: "Meet 5:30, roll 6",
  weburl: "https://example.org/loop",
};

// What the scheduled aggregation tick sees in the db. Mix of the CURRENT
// favorite schema (userId + event snapshot) and the LEGACY one that is live
// in prod today (userSlug, no snapshot).
const DB_DOCS = [
  { _id: "favorite-alice-101", type: "favorite", userId: "Alice", rideId: "101", event: SNAP },
  {
    _id: "favorite-alice-202",
    type: "favorite",
    userId: "alice",
    rideId: 202,
    event: { ...SNAP, title: "Moved Ride", date: "2026-07-12", endtime: "" },
  },
  {
    _id: "favorite-alice-303",
    type: "favorite",
    userId: "alice",
    rideId: "303",
    event: { ...SNAP, title: "Cancelled Ride", date: "2026-07-13" },
  },
  { _id: "x1", type: "favorite", userSlug: "jchris", rideId: "12976" }, // legacy, no snapshot
  { _id: "x2", type: "favorite", userSlug: "jchris", rideId: "99999" }, // legacy, won't match feed
  { _id: "note-1", type: "note", userId: "alice", rideId: "101", notes: "SECRET NOTE" },
  { _id: "friend-1", type: "friend", userId: "alice", friendSlug: "bob" },
  // Opt-in capability tokens: the ONLY way a feed is reachable.
  { _id: "caltoken-alice", type: "caltoken", userId: "Alice", token: "alice-token-1234567890A" },
  { _id: "caltoken-jchris", type: "caltoken", userId: "jchris", token: "jchris-token-123456789B" },
];
const T_ALICE = "alice-token-1234567890A";
const T_JCHRIS = "jchris-token-123456789B";
const tick = () => scheduled({ scheduledTime: "2026-07-04T12:00:00Z" }, { db: { query: async () => DB_DOCS } });

// Feed rows: 202's time moved (overrides the snapshot), 303 is cancelled,
// 12976 resolves the legacy fave. 101 is NOT in the window (past ride) so it
// serves from its snapshot.
const FEED = {
  events: [
    {
      caldaily_id: 202,
      id: 20,
      date: "2026-07-12",
      time: "19:30:00",
      endtime: "",
      title: "Moved Ride (new time)",
      venue: "New Spot",
      address: "N Somewhere",
      organizer: "Shift",
      cancelled: false,
    },
    { caldaily_id: 303, id: 30, date: "2026-07-13", time: "18:00:00", title: "Cancelled Ride", cancelled: true },
    {
      caldaily_id: 12976,
      id: 129,
      date: "2026-07-20",
      time: "10:00:00",
      endtime: "12:00:00",
      title: "Legacy Resolved Ride",
      venue: "Salmon Fountain",
      cancelled: false,
    },
  ],
};

describe("validateFavesItem / rideToItem plumbing", () => {
  it("converts ride-local times to UTC (PDT)", () => {
    expect(toIcsUtc("2026-07-10T18:00:00")).toBe("20260711T010000Z");
  });
  it("keeps description and caps it", () => {
    const r = validateFavesItem({
      title: "A",
      start: "2026-07-10T18:00:00",
      end: "2026-07-10T20:00:00",
      description: "  hi\nthere  ",
    });
    expect(r.ok).toBe(true);
    expect(r.item.description).toBe("hi\nthere");
  });
  it("drops malformed rows in the lenient path without failing the batch", () => {
    const items = sanitizeFavesItems([
      { title: "Good", start: "2026-07-10T18:00:00", end: "2026-07-10T20:00:00" },
      { title: "", start: "2026-07-10T18:00:00", end: "2026-07-10T20:00:00" },
      { title: "Bad time", start: "2026-07-10T:00", end: "2026-07-10T20:00:00" },
    ]);
    expect(items.map((i) => i.title)).toEqual(["Good"]);
  });
});

describe("GET /faves.ics?u=<handle> — rolling-today subscription lane", () => {
  beforeEach(() => __resetSubCacheForTests());
  afterEach(() => vi.unstubAllGlobals());
  const feedOk = () => {
    const spy = vi.fn(async () => new Response(JSON.stringify(FEED), { status: 200 }));
    vi.stubGlobal("fetch", spy);
    return spy;
  };

  it("serves an EMPTY but VALID calendar (not 503/error) before the first tick", async () => {
    feedOk();
    const res = await icsFetch(req(`/faves.ics?t=${T_ALICE}`), {});
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).not.toContain("BEGIN:VEVENT");
  });

  it("live-joins the feed: overrides moved times, drops cancelled, snapshots fill the gaps", async () => {
    const spy = feedOk();
    await tick();
    const res = await icsFetch(req(`/faves.ics?t=${T_ALICE}`), {});
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    const body = await res.text();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0][0])).toContain(FEED_URL);
    expect(body).toContain("SUMMARY:Loop de Loop"); // 101: not in window → snapshot serves it
    expect(body).toContain("DTSTART:20260711T010000Z"); // 18:00 PDT Jul 10
    expect(body).toContain("SUMMARY:Moved Ride (new time)"); // 202: live override wins
    expect(body).toContain("DTSTART:20260713T023000Z"); // 19:30 PDT Jul 12, live time
    expect(body).not.toContain("SUMMARY:Cancelled Ride"); // 303: dropped
    expect(body).not.toContain("SECRET NOTE"); // notes never enter the aggregate
    expect(body).toContain("LOCATION:New Spot\\, N Somewhere");
    expect(body).toContain("DESCRIPTION:Led by Shift"); // organizer/timedetails ride along
    expect(body).toContain("UID:ride-101@rolling-today.vibes.diy"); // stable across refreshes
    expect(body).toContain("X-WR-CALNAME:@alice — Rolling Today");
  });

  it("defaults a missing endtime to a 2h ride", async () => {
    feedOk();
    await tick();
    const body = await (await icsFetch(req(`/faves.ics?t=${T_ALICE}`), {})).text();
    // 202 live row has no endtime: 19:30 PDT + 2h = 21:30 PDT = 04:30Z
    expect(body).toContain("DTEND:20260713T043000Z");
  });

  it("resolves LEGACY userSlug faves through the feed and drops unmatched ones", async () => {
    feedOk();
    await tick();
    const body = await (await icsFetch(req(`/faves.ics?t=${T_JCHRIS}`), {})).text();
    expect(body).toContain("SUMMARY:Legacy Resolved Ride"); // 12976 matched in window
    const eventCount = (body.match(/BEGIN:VEVENT/g) || []).length;
    expect(eventCount).toBe(1); // 99999 has no snapshot and no feed row → dropped
  });

  it("falls back to snapshots (not an error) when the feed is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 }))
    );
    await tick();
    const res = await icsFetch(req(`/faves.ics?t=${T_ALICE}`), {});
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("SUMMARY:Loop de Loop"); // snapshot survives feed outage
    expect(body).toContain("SUMMARY:Moved Ride"); // snapshot version (no live override)
    expect(body).toContain("SUMMARY:Cancelled Ride"); // can't know it's cancelled without the feed
  });

  it("serves an unknown token as an EMPTY valid calendar (fresh token can beat the tick; revoked feeds drain)", async () => {
    feedOk();
    await tick();
    const res = await icsFetch(req("/faves.ics?t=unknown-token-0000000000&n=jchris"), {});
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.text();
    expect(body).not.toContain("BEGIN:VEVENT");
    // Display-only label so iOS's captured-at-subscribe name is right pre-tick.
    expect(body).toContain("X-WR-CALNAME:@jchris — Rolling Today");
  });

  it("400s a missing or malformed token", async () => {
    feedOk();
    await tick();
    expect((await icsFetch(req("/faves.ics"), {})).status).toBe(400);
    expect((await icsFetch(req("/faves.ics?t=short"), {})).status).toBe(400);
    expect((await icsFetch(req("/faves.ics?t=bad$token!!!!!!!!!!!"), {})).status).toBe(400);
  });

  it("503s (not a partial 200) when the feed fails and a fave has no snapshot fallback", async () => {
    // jchris's faves are all legacy snapshot-less: with the feed down there is
    // nothing to serve, and an empty 200 would wipe the subscriber's
    // previously-synced rides (Codex, #3267 review).
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 }))
    );
    await tick();
    const res = await icsFetch(req(`/faves.ics?t=${T_JCHRIS}`), {});
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("300");
  });

  it("404s other paths and 405s non-GET methods", async () => {
    feedOk();
    expect((await icsFetch(req("/nope"), {})).status).toBe(404);
    const res = await icsFetch(req("/faves.ics", { method: "POST", body: "{}" }), {});
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("GET");
  });
});

describe("buildFavesCalendar — envelope", () => {
  it("uses CRLF, refresh hints, and a handle-scoped name", () => {
    const ics = buildFavesCalendar([], { now: "2026-07-04T12:00:00Z", calName: "@x — Rolling Today" });
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "").includes("\n")).toBe(false);
    expect(ics).toContain("PRODID:-//vibes.diy//rolling-today//EN");
    expect(ics).toContain("X-WR-CALNAME:@x — Rolling Today");
    expect(ics).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT6H");
  });
});
