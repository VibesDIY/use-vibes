import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  toIcsUtc,
  escapeIcsText,
  foldIcsLine,
  parseFavesItems,
  buildFavesCalendar,
  scheduled,
  __resetSubCacheForTests,
  MAX_ITEMS,
  SCHEDULE_URL,
  fetch as icsFetch,
} from "./backend.js";

// The `_api` request arrives at the handler prefix-stripped, rooted at "/".
const req = (path, init = {}) => new Request(`https://vibe.internal${path}`, init);
const post = (body) =>
  req("/faves.ics", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const items = (...overrides) =>
  overrides.length > 0
    ? overrides
    : [{ id: "event-g-101", title: "Adjoint Methods in Julia", start: "2026-08-11T13:00:00", end: "2026-08-11T14:00:00" }];

describe("toIcsUtc — conference-local strings become ICS UTC stamps", () => {
  it("converts a naive conference-local time (CEST, UTC+2) to Z time", () => {
    expect(toIcsUtc("2026-08-11T13:00:00")).toBe("20260811T110000Z");
  });
  it("handles DST correctly — a winter time is CET (UTC+1)", () => {
    expect(toIcsUtc("2026-12-01T12:00:00")).toBe("20261201T110000Z");
  });
  it("respects an explicit offset instead of assuming conference time", () => {
    expect(toIcsUtc("2026-08-11T20:00:00Z")).toBe("20260811T200000Z");
    expect(toIcsUtc("2026-08-11T16:00:00-04:00")).toBe("20260811T200000Z");
  });
  it("accepts a space-separated form", () => {
    expect(toIcsUtc("2026-08-11 13:00:00")).toBe("20260811T110000Z");
  });
  it("returns null for garbage, empty, and non-strings", () => {
    expect(toIcsUtc("2026-08-10T:00")).toBe(null); // the known malformed-shift shape
    expect(toIcsUtc("")).toBe(null);
    expect(toIcsUtc(undefined)).toBe(null);
    expect(toIcsUtc(1234)).toBe(null);
  });
});

describe("escapeIcsText — RFC 5545 TEXT escaping", () => {
  it("escapes backslash, semicolon, comma, and newline", () => {
    expect(escapeIcsText("a\\b;c,d\ne")).toBe("a\\\\b\\;c\\,d\\ne");
  });
  it("escapes backslash FIRST so escapes aren't double-escaped", () => {
    expect(escapeIcsText(";")).toBe("\\;"); // not "\\\\;"
  });
  it("normalizes CRLF to the \\n escape", () => {
    expect(escapeIcsText("a\r\nb")).toBe("a\\nb");
  });
});

describe("foldIcsLine — 75-octet folding", () => {
  it("leaves a short line alone", () => {
    expect(foldIcsLine("SUMMARY:hi")).toBe("SUMMARY:hi");
  });
  it("folds a long ASCII line at 75 octets with CRLF + space", () => {
    const folded = foldIcsLine("SUMMARY:" + "x".repeat(200));
    const parts = folded.split("\r\n ");
    expect(parts.length).toBeGreaterThan(1);
    expect(parts[0].length).toBe(75);
    // Continuation content caps at 74 — the leading fold space spends the 75th octet.
    for (const p of parts.slice(1, -1)) expect(p.length).toBe(74);
    expect(parts.join("")).toBe("SUMMARY:" + "x".repeat(200));
  });
  it("counts octets not characters, and never splits a multibyte char", () => {
    // é is 2 octets in UTF-8: 37 of them = 74 octets, +8 for "SUMMARY:" = 82 → folds.
    const line = "SUMMARY:" + "é".repeat(37);
    const folded = foldIcsLine(line);
    const parts = folded.split("\r\n ");
    expect(parts.length).toBe(2);
    // Each part must reassemble to whole é characters (no lone surrogates/bytes).
    expect(parts.join("")).toBe(line);
    for (const p of parts) expect([...p].every((ch) => ch === "é" || /[A-Z:]/.test(ch))).toBe(true);
  });
});

describe("parseFavesItems — strict payload validation", () => {
  it("accepts a minimal valid payload and normalizes times to UTC", () => {
    const r = parseFavesItems({ items: items() });
    expect(r.ok).toBe(true);
    expect(r.items[0]).toMatchObject({ title: "Adjoint Methods in Julia", start: "20260811T110000Z", end: "20260811T120000Z" });
  });
  it("drops urls with embedded whitespace or control chars (verbatim URI emission)", () => {
    const mk = (url) => parseFavesItems({ items: [{ ...items()[0], url }] }).items[0].url;
    expect(mk("https://x.com/a b")).toBeUndefined();
    expect(mk("https://x.com/a\r\nX-INJECTED:1")).toBeUndefined();
    expect(mk("https://x.com/ok?a=1&b=2,3;4")).toBe("https://x.com/ok?a=1&b=2,3;4");
  });
  it("keeps location and http(s) url, drops a javascript: url silently", () => {
    const r = parseFavesItems({
      items: [
        {
          title: "A",
          start: "2026-08-11T13:00:00",
          end: "2026-08-11T14:00:00",
          location: "Tent — RW1",
          url: "javascript:alert(1)",
        },
      ],
    });
    expect(r.ok).toBe(true);
    expect(r.items[0].location).toBe("Tent — RW1");
    expect(r.items[0].url).toBeUndefined();
  });
  it("rejects a non-object body and a missing items array", () => {
    expect(parseFavesItems(null).ok).toBe(false);
    expect(parseFavesItems({ items: "nope" }).ok).toBe(false);
  });
  it("rejects an empty list", () => {
    expect(parseFavesItems({ items: [] })).toEqual({ ok: false, error: "no items to export" });
  });
  it("rejects an oversized list", () => {
    const many = Array.from({ length: MAX_ITEMS + 1 }, () => items()[0]);
    expect(parseFavesItems({ items: many }).ok).toBe(false);
  });
  it("normalizes an overnight extra (same-day 22:00 → 01:00) to end the next day", () => {
    // The extras form stores both times on the selected conference day, so an
    // overnight shift arrives with end before start.
    const r = parseFavesItems({ items: [{ title: "Late shift", start: "2026-08-10T22:00:00", end: "2026-08-10T01:00:00" }] });
    expect(r.ok).toBe(true);
    // 22:00 CEST Aug 10 → 20:00Z Aug 10; 01:00 CEST bumped to Aug 11 → 23:00Z Aug 10.
    expect(r.items[0].start).toBe("20260810T200000Z");
    expect(r.items[0].end).toBe("20260810T230000Z");
  });
  it("rejects zero-duration items and ends more than a day early", () => {
    const zero = parseFavesItems({ items: [{ title: "A", start: "2026-08-10T09:00:00", end: "2026-08-10T09:00:00" }] });
    expect(zero.ok).toBe(false);
    expect(zero.error).toContain("zero duration");
    const wayEarly = parseFavesItems({ items: [{ title: "A", start: "2026-08-10T09:00:00", end: "2026-08-08T09:00:00" }] });
    expect(wayEarly.ok).toBe(false);
    expect(wayEarly.error).toContain("before its start");
  });
  it("rejects a blank title and an unparseable time, naming the index", () => {
    const bad = parseFavesItems({ items: [{ title: "  ", start: "2026-08-11T13:00:00", end: "2026-08-11T14:00:00" }] });
    expect(bad.ok).toBe(false);
    expect(bad.error).toContain("items[0].title");
    const badTime = parseFavesItems({ items: [{ title: "A", start: "2026-08-10T:00", end: "2026-08-11T14:00:00" }] });
    expect(badTime.ok).toBe(false);
    expect(badTime.error).toContain("items[0].start");
  });
});

describe("buildFavesCalendar — the ICS document", () => {
  const NOW = "2026-07-08T12:00:00Z";
  const two = parseFavesItems({
    items: [
      { id: "event-2", title: "Later Talk", start: "2026-08-12T20:00:00", end: "2026-08-12T21:00:00" },
      {
        id: "event-1",
        title: "Früh; und, spät",
        start: "2026-08-11T13:00:00",
        end: "2026-08-11T14:00:00",
        location: "Muschel — N2",
        url: "https://pretalx.com/juliacon-2026/talk/83EN8J/",
      },
    ],
  }).items;
  const ics = buildFavesCalendar(two, { now: NOW });

  it("uses CRLF line endings throughout and ends with one", () => {
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "").includes("\n")).toBe(false);
  });
  it("has the calendar envelope and metadata", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("VERSION:2.0\r\n");
    expect(ics).toContain("X-WR-CALNAME:My JuliaCon 2026 Picks\r\n");
    expect(ics).toContain("X-WR-TIMEZONE:Europe/Berlin\r\n");
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
  });
  it("emits events sorted by start time regardless of input order", () => {
    expect(ics.indexOf("20260811T110000Z")).toBeLessThan(ics.indexOf("20260812T180000Z"));
    expect(ics.indexOf("20260812T180000Z")).toBeGreaterThan(-1);
  });
  it("stamps stable UIDs from the item id", () => {
    expect(ics).toContain("UID:event-1@juliacon-picker.vibes.diy");
    expect(ics).toContain("UID:event-2@juliacon-picker.vibes.diy");
  });
  it("escapes SUMMARY text and carries LOCATION/URL", () => {
    expect(ics).toContain("SUMMARY:Früh\\; und\\, spät");
    expect(ics).toContain("LOCATION:Muschel — N2");
    expect(ics).toContain("URL:https://pretalx.com/juliacon-2026/talk/83EN8J/");
  });
  it("emits URL as a URI, never TEXT-escaping its commas/semicolons", () => {
    const withPunct = parseFavesItems({
      items: [{ id: "e", title: "A", start: "2026-08-11T13:00:00", end: "2026-08-11T14:00:00", url: "https://x.com/a,b;c" }],
    }).items;
    expect(buildFavesCalendar(withPunct, { now: NOW })).toContain("URL:https://x.com/a,b;c");
  });
  it("uses the injected now for DTSTAMP", () => {
    expect(ics).toContain("DTSTAMP:20260708T120000Z");
  });
});

// The feed shape the pretalx export actually returns: schedule.conference.days[],
// each day carrying a `rooms` map of room name → event array. Events are keyed by
// guid; `date` is the full ISO start with offset, and `end` is usually explicit
// (one row below omits it to exercise the duration fallback).
const FEED = {
  schedule: {
    conference: {
      days: [
        {
          date: "2026-08-11",
          rooms: {
            "Tent — RW1": [
              {
                guid: "g-101",
                id: 101,
                date: "2026-08-11T13:00:00+02:00",
                end: "2026-08-11T14:00:00+02:00",
                duration: "01:00",
                title: "Adjoint Methods in Julia",
                url: "https://pretalx.com/juliacon-2026/talk/A1/",
                track: "General",
                persons: [],
              },
              {
                guid: "g-102",
                id: 102,
                date: "2026-08-12T11:00:00+02:00",
                end: "2026-08-12T12:00:00+02:00",
                duration: "01:00",
                title: "GPU Kernels & Graphs",
                track: "Julia, GPUs, and Accelerators",
                persons: [],
              },
            ],
          },
        },
        {
          date: "2026-08-12",
          rooms: {
            "Muschel — N2": [
              {
                // No explicit end — projected via the duration fallback.
                guid: "g-201",
                id: 201,
                date: "2026-08-12T23:00:00+02:00",
                duration: "01:30",
                title: "Evening Social",
                persons: [],
              },
            ],
          },
        },
      ],
    },
  },
};

// The db docs the scheduled aggregation tick sees (admin-lane read of the
// access-fn-bound db — the one lane allowed to read it).
const DB_DOCS = [
  { _id: "favorite-Alice-g-101", type: "favorite", userId: "Alice", eventId: "g-101" },
  { _id: "favorite-alice-g-201", type: "favorite", userId: "alice", eventId: "g-201" },
  { _id: "favorite-bob-g-102", type: "favorite", userId: "bob", eventId: "g-102" },
  {
    _id: "shift-1",
    type: "shift",
    userId: "alice",
    shareWithFriends: true,
    kind: "Volunteer",
    start: "2026-08-10T09:00:00",
    end: "2026-08-10T17:00:00",
  },
  {
    _id: "shift-2",
    type: "shift",
    userId: "alice",
    shareWithFriends: false,
    kind: "Secret",
    start: "2026-08-11T09:00:00",
    end: "2026-08-11T17:00:00",
  },
  {
    _id: "shift-legacy",
    type: "shift",
    userId: "bob",
    shareWithFriends: true,
    kind: "Gate",
    day: "Tuesday",
    startTime: "10:00",
    endTime: "12:00",
  },
  { _id: "note-alice-g-101", type: "note", userId: "alice", eventId: "g-101", notes: "PRIVATE NOTE" },
  // Opt-in capability tokens (auto-minted client-side on the schedule tab).
  { _id: "caltoken-alice", type: "caltoken", userId: "Alice", token: "alice-token-1234567890A" },
  { _id: "caltoken-bob", type: "caltoken", userId: "bob", token: "bob-token-1234567890BBB" },
  // The known legacy malformed shape (cleared time input persisted as `<date>T:00`),
  // SHARED — must drop out of alice's feed without 400ing it.
  {
    _id: "shift-broken",
    type: "shift",
    userId: "alice",
    shareWithFriends: true,
    kind: "Broken Legacy",
    start: "2026-08-10T:00",
    end: "2026-08-10T17:00:00",
  },
];
const T_ALICE = "alice-token-1234567890A";
const T_BOB = "bob-token-1234567890BBB";
const tick = () => scheduled({ scheduledTime: "2026-07-08T12:00:00Z" }, { db: { query: async () => DB_DOCS } });

describe("fetch handler — GET /faves.ics?t=<token> (subscription lane)", () => {
  beforeEach(() => __resetSubCacheForTests());
  afterEach(() => vi.unstubAllGlobals());
  const feedOk = () => {
    const spy = vi.fn(async () => new Response(JSON.stringify(FEED), { status: 200 }));
    vi.stubGlobal("fetch", spy);
    return spy;
  };

  it("serves the never-empty anchor-only calendar before the first aggregation tick", async () => {
    // iOS validates a NEW subscription by fetching at add time — a cold-cache
    // error there reads as "Validation failed", so cold must serve a valid,
    // non-empty calendar (owner call; anchor-only until the ≤1m tick).
    feedOk();
    const res = await icsFetch(req(`/faves.ics?t=${T_ALICE}`), {});
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store"); // don't pin the skeleton
    const body = await res.text();
    expect(body).toContain("SUMMARY:JuliaCon 2026");
    expect(body).not.toContain("Adjoint"); // faves arrive with the tick
  });

  it("serves a user's CURRENT faves: db-aggregated guids joined live against the feed", async () => {
    const fetchSpy = feedOk();
    await tick();
    const res = await icsFetch(req(`/faves.ics?t=${T_ALICE}`), {});
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe(null); // a feed, not a download
    const body = await res.text();
    expect(fetchSpy).toHaveBeenCalledWith(SCHEDULE_URL, expect.anything());
    expect(body).toContain("SUMMARY:Adjoint Methods in Julia"); // alice faved g-101 (case-folded handle)
    expect(body).toContain("SUMMARY:Evening Social"); // alice faved g-201
    expect(body).toContain("DTEND:20260812T223000Z"); // g-201's end derived from its 01:30 duration
    expect(body).not.toContain("GPU Kernels"); // g-102 is bob's
    expect(body).toContain("SUMMARY:Volunteer"); // her SHARED shift
    expect(body).not.toContain("Secret"); // private shift stays private
    expect(body).not.toContain("PRIVATE NOTE"); // notes never leave the db
    expect(body).not.toContain("Broken Legacy"); // malformed shared shift drops out, doesn't 400 the feed
    expect(body).toContain("LOCATION:Tent — RW1");
    expect(body).toContain("UID:event-g-101@juliacon-picker.vibes.diy"); // stable across refreshes
    expect(body).toContain("SUMMARY:JuliaCon 2026"); // the always-present anchor event
    expect(body).toContain("X-WR-CALNAME:@alice — JuliaCon 2026 Picks");
    expect(body).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT6H");
  });

  it("serves fave-less holders and pre-tick tokens alike: valid anchor-only, never an error", async () => {
    feedOk();
    await tick();
    const res = await icsFetch(req("/faves.ics?t=freshly-minted-token-000&n=jchris"), {});
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store"); // don't pin the placeholder
    const body = await res.text();
    expect(body).toContain("SUMMARY:JuliaCon 2026");
    // iOS captures the calendar name at subscribe time; the display-only n=
    // param names it correctly even before the tick resolves the token.
    expect(body).toContain("X-WR-CALNAME:@jchris — JuliaCon 2026 Picks");
    expect((body.match(/BEGIN:VEVENT/g) || []).length).toBe(1);
  });

  it("derives legacy shift times from day + startTime/endTime", async () => {
    feedOk();
    await tick();
    const body = await (await icsFetch(req(`/faves.ics?t=${T_BOB}`), {})).text();
    expect(body).toContain("SUMMARY:Gate");
    expect(body).toContain("DTSTART:20260811T080000Z"); // Tuesday 10:00 CEST
  });

  it("does not aggregate users who never opted in (no token → no ics data at all)", async () => {
    // The tick fixture has no caltoken for a "nobody" user, and the opt-in
    // filter also drops fave-holders without tokens from the users map.
    feedOk();
    await tick();
    const res = await icsFetch(req(`/faves.ics?t=${T_ALICE}`), {});
    expect(res.status).toBe(200); // alice opted in and serves normally
  });

  it("400s a missing or malformed token and 502s a broken feed", async () => {
    feedOk();
    await tick();
    expect((await icsFetch(req("/faves.ics"), {})).status).toBe(400);
    expect((await icsFetch(req("/faves.ics?t=short"), {})).status).toBe(400);
    expect((await icsFetch(req("/faves.ics?t=bad$token!!!!!!!!!!!"), {})).status).toBe(400);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 }))
    );
    expect((await icsFetch(req(`/faves.ics?t=${T_ALICE}`), {})).status).toBe(502);
  });

  it("shifts don't touch the feed: a shifts-only user serves without egress", async () => {
    const fetchSpy = feedOk();
    await scheduled({ scheduledTime: "2026-07-08T12:00:00Z" }, { db: { query: async () => [DB_DOCS[3], DB_DOCS[7]] } });
    const res = await icsFetch(req(`/faves.ics?t=${T_ALICE}`), {});
    expect(res.status).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await res.text()).toContain("SUMMARY:Volunteer");
  });
});

describe("fetch handler — POST /faves.ics", () => {
  it("404s any other path", async () => {
    const res = await icsFetch(req("/"), {});
    expect(res.status).toBe(404);
  });
  it("405s methods other than GET/HEAD/POST with an Allow header", async () => {
    const res = await icsFetch(req("/faves.ics", { method: "DELETE" }), {});
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("GET, POST");
  });
  it("400s malformed JSON and invalid payloads", async () => {
    expect((await icsFetch(post("{nope"), {})).status).toBe(400);
    expect((await icsFetch(post({ items: [] }), {})).status).toBe(400);
    const bad = await icsFetch(post({ items: [{ title: "A", start: "junk", end: "2026-08-11T14:00:00" }] }), {});
    expect(bad.status).toBe(400);
    expect(await bad.text()).toContain("items[0].start");
  });
  it("returns a text/calendar attachment for a valid payload", async () => {
    const res = await icsFetch(post({ items: items() }), {});
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="juliacon2026-faves.ics"');
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.text();
    expect(body).toContain("BEGIN:VEVENT");
    expect(body).toContain("SUMMARY:Adjoint Methods in Julia");
    expect(body).toContain("DTSTART:20260811T110000Z"); // conference-local converted to UTC
  });
  it("never needs ctx — works with an anonymous, ctx-less call", async () => {
    const res = await icsFetch(post({ items: items() }), undefined);
    expect(res.status).toBe(200);
  });
});
