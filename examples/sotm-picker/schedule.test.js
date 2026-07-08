import { describe, it, expect } from "vitest";
import {
  festivalDayFor,
  setsOnNow,
  upNextSets,
  toFestivalDate,
  scheduleIcsItems,
  flattenPretalx,
  trackColor,
  TRACK_COLORS,
} from "./festival-utils.js";

// Everything is anchored through toFestivalDate so events and "now" share one frame.
const at = (s) => toFestivalDate(s).getTime();
const ev = (venueTitle, start, end, eventId = `${venueTitle}-${start}`) => ({ eventId, venueTitle, start, end });

describe("festivalDayFor — 4 AM night cutoff (evening socials run late)", () => {
  it("rolls a 1 AM event back to the previous conference day", () => {
    expect(festivalDayFor("2026-08-30T01:00:00")).toBe("Saturday"); // early Sunday → Saturday night
  });
  it("keeps a 5 AM event on its own day", () => {
    expect(festivalDayFor("2026-08-30T05:00:00")).toBe("Sunday");
  });
  it("treats exactly 4:00 AM as the new day, 3:59 as the old", () => {
    expect(festivalDayFor("2026-08-30T04:00:00")).toBe("Sunday");
    expect(festivalDayFor("2026-08-30T03:59:00")).toBe("Saturday");
  });
  it("leaves a normal late-evening event on its day", () => {
    expect(festivalDayFor("2026-08-29T23:00:00")).toBe("Saturday");
  });
  it("maps offset-explicit feed times in Paris terms, not the runner's zone", () => {
    expect(festivalDayFor("2026-08-29T01:00:00+02:00")).toBe("Friday"); // 1 AM Saturday in Paris
    expect(festivalDayFor("2026-08-29T23:30:00Z")).toBe("Saturday"); // 01:30 Sunday in Paris → Saturday night
  });
});

describe("setsOnNow — running right now (started, not yet ended)", () => {
  const now = at("2026-08-29T14:45:00");
  const events = [
    ev("A", "2026-08-29T13:45:00", "2026-08-29T15:15:00"), // started an hour ago, still going
    ev("B", "2026-08-29T13:00:00", "2026-08-29T14:00:00"), // already ended
    ev("C", "2026-08-29T15:00:00", "2026-08-29T16:00:00"), // hasn't started
  ];
  it("includes a talk that started an hour ago but hasn't ended", () => {
    expect(setsOnNow(events, now).map((e) => e.venueTitle)).toEqual(["A"]);
  });
});

describe("upNextSets — the next wave (anchored on the next talk, not the clock)", () => {
  const now = at("2026-08-29T14:30:00");
  const events = [
    ev("A", "2026-08-29T14:00:00", "2026-08-29T15:00:00"), // running now
    ev("A", "2026-08-29T15:00:00", "2026-08-29T16:00:00"), // up next #1
    ev("A", "2026-08-29T16:00:00", "2026-08-29T17:00:00"), // up next #2
    ev("A", "2026-08-29T17:30:00", "2026-08-29T18:30:00"), // 3rd — over per-room cap
    ev("B", "2026-08-29T14:30:00", "2026-08-29T15:30:00"), // running now
    ev("B", "2026-08-29T15:30:00", "2026-08-29T16:30:00"), // up next
    ev("C", "2026-08-29T19:30:00", "2026-08-29T20:30:00"), // a wave away — excluded
  ];
  const next = upNextSets(events, now);

  it("caps at two upcoming talks per room", () => {
    const aTimes = next.filter((e) => e.venueTitle === "A").map((e) => e.start);
    expect(aTimes).toEqual(["2026-08-29T15:00:00", "2026-08-29T16:00:00"]); // not the 17:30 one
  });
  it("drops a room whose next talk is a whole wave away", () => {
    // next wave anchors on 15:00 (+2h = 17:00), so C at 19:30 is out.
    expect(next.some((e) => e.venueTitle === "C")).toBe(false);
  });
  it("never lists a currently-running talk as up next", () => {
    expect(next.some((e) => e.start === "2026-08-29T14:00:00")).toBe(false);
    expect(next.some((e) => e.start === "2026-08-29T14:30:00")).toBe(false);
  });
  it("returns the wave sorted by start", () => {
    expect(next.map((e) => e.start)).toEqual([
      "2026-08-29T15:00:00", // A
      "2026-08-29T15:30:00", // B
      "2026-08-29T16:00:00", // A
    ]);
  });

  // The opening wave stays visible even when the conference is weeks out (anchor on
  // the next talk, never on "now").
  it("shows the opening wave a month before the conference", () => {
    const monthBefore = at("2026-07-28T12:00:00");
    const opening = [
      ev("A", "2026-08-28T09:30:00", "2026-08-28T09:50:00"),
      ev("B", "2026-08-28T10:00:00", "2026-08-28T11:00:00"),
      ev("C", "2026-08-28T14:30:00", "2026-08-28T15:30:00"), // that afternoon — next wave
    ];
    const n = upNextSets(opening, monthBefore);
    expect(n.map((e) => e.venueTitle)).toEqual(["A", "B"]);
    expect(n.some((e) => e.venueTitle === "C")).toBe(false);
  });

  // At the end of a day, "up next" rolls to the next morning's first sessions.
  it("rolls to the next morning after the day's last talk", () => {
    const evening = at("2026-08-29T20:30:00");
    const evs = [
      ev("A", "2026-08-29T17:00:00", "2026-08-29T18:00:00"), // already ended
      ev("D", "2026-08-30T09:00:00", "2026-08-30T10:00:00"), // next morning
      ev("E", "2026-08-30T09:30:00", "2026-08-30T10:30:00"), // next morning
      ev("F", "2026-08-30T14:00:00", "2026-08-30T15:00:00"), // afternoon — next wave
    ];
    const n = upNextSets(evs, evening);
    expect(n.map((e) => e.venueTitle)).toEqual(["D", "E"]);
  });
});

// A trimmed slice of the real pretalx export: schedule.conference.days[], each day's
// events nested per room. "State of Panoramax" deliberately omits `end` (the live
// feed carries it) to pin the date+duration fallback; "Ghost" pins the skip rule.
const FEED = {
  schedule: {
    conference: {
      title: "State of the Map 2026",
      time_zone_name: "Europe/Paris",
      days: [
        {
          index: 1,
          date: "2026-08-28",
          rooms: {
            Guadeloupe: [
              {
                guid: "bae2fa8b-dd6e-52b2-90c3-c401f340d50f",
                code: "SEDEA8",
                id: 98507,
                date: "2026-08-28T09:30:00+02:00",
                start: "09:30",
                end: "2026-08-28T09:50:00+02:00",
                duration: "00:20",
                room: "Guadeloupe",
                url: "https://pretalx.com/sotm2026/talk/SEDEA8/",
                title: "Opening",
                track: "Community and Foundation",
                type: "Talk",
                persons: [{ name: "SotM Working Group" }],
              },
              {
                guid: "4e6d6b4d-f90c-569e-93c6-0234cd20defa",
                date: "2026-08-28T09:50:00+02:00",
                start: "09:50",
                duration: "00:30",
                room: "Guadeloupe",
                url: "https://pretalx.com/sotm2026/talk/PCMPNK/",
                title: "State of Panoramax",
                track: "Mapping",
                type: "Extended Talk",
                persons: [{ name: "Christian Quest" }, { name: "Adrien Pavie" }],
              },
            ],
            Tahiti: [
              {
                guid: "92794335-a321-52ca-a6bc-d7c166ce1ab5",
                date: "2026-08-28T11:15:00+02:00",
                start: "11:15",
                end: "2026-08-28T12:15:00+02:00",
                duration: "01:00",
                room: "Tahiti",
                url: "https://pretalx.com/sotm2026/talk/WHNUVN/",
                title: "OSM Mapping 101",
                track: "",
                type: "Workshop",
                persons: [{ name: "Martin Raifer" }],
              },
            ],
          },
        },
        {
          index: 3,
          date: "2026-08-30",
          rooms: {
            "Outdoor Workshops": [
              {
                guid: "0e1b77fd-b20a-5965-8d39-699a5de8ef6f",
                date: "2026-08-30T11:15:00+02:00",
                start: "11:15",
                end: "2026-08-30T12:55:00+02:00",
                duration: "01:40",
                room: "Outdoor Workshops",
                url: "https://pretalx.com/sotm2026/talk/NJNJKN/",
                title: "StreetComplete walk",
                track: "OSM Basics",
                type: "Workshop",
                persons: [{ name: "Mateusz Konieczny" }],
              },
              {
                guid: "ghost-guid",
                date: "not-a-date",
                duration: "00:20",
                room: "Outdoor Workshops",
                title: "Ghost",
                track: "OSM Basics",
                type: "Talk",
                persons: [],
              },
            ],
          },
        },
      ],
    },
  },
};

describe("flattenPretalx — the pretalx export becomes the internal event list", () => {
  const list = flattenPretalx(FEED);
  const byTitle = (t) => list.find((e) => e.title === t);

  it("keys events by their stable guid and skips unparseable dates", () => {
    expect(byTitle("Opening").eventId).toBe("bae2fa8b-dd6e-52b2-90c3-c401f340d50f");
    expect(list.map((e) => e.title)).not.toContain("Ghost");
    expect(list).toHaveLength(4);
  });

  it("carries title, room, url, and comma-joined speakers", () => {
    const p = byTitle("State of Panoramax");
    expect(p.venueTitle).toBe("Guadeloupe");
    expect(p.url).toBe("https://pretalx.com/sotm2026/talk/PCMPNK/");
    expect(p.speakers).toBe("Christian Quest, Adrien Pavie");
    expect(byTitle("Opening").speakers).toBe("SotM Working Group");
  });

  it("computes a missing end from date + duration", () => {
    const p = byTitle("State of Panoramax");
    expect(toFestivalDate(p.end).getTime()).toBe(toFestivalDate("2026-08-28T10:20:00+02:00").getTime());
  });

  it("keeps the feed's end when present", () => {
    expect(byTitle("Opening").end).toBe("2026-08-28T09:50:00+02:00");
  });

  it("maps offset-explicit starts onto conference days", () => {
    expect(byTitle("Opening").day).toBe("Friday");
    expect(byTitle("StreetComplete walk").day).toBe("Sunday");
  });

  it("defaults an empty track to General", () => {
    const w = byTitle("OSM Mapping 101");
    expect(w.track).toBe("General");
    expect(w.lineup.id).toBe("General");
  });

  it("assigns each track a deterministic legend color", () => {
    for (const e of list) {
      expect(TRACK_COLORS).toContain(e.lineup.color);
      expect(e.lineup.color).toBe(trackColor(e.track));
    }
    // Same input → same color, across calls and feed refreshes.
    expect(trackColor("Mapping")).toBe(trackColor("Mapping"));
    expect(flattenPretalx(FEED).find((e) => e.title === "Opening").lineup.color).toBe(byTitle("Opening").lineup.color);
  });

  it("returns an empty list for a shapeless payload", () => {
    expect(flattenPretalx(null)).toEqual([]);
    expect(flattenPretalx({})).toEqual([]);
  });
});

describe("scheduleIcsItems — flattening My Faves for the .ics backend", () => {
  const shiftStart = (s) => s.start;
  const shiftEnd = (s) => s.end;

  it("maps favorite events with doc-keyed ids, location, and url", () => {
    const items = scheduleIcsItems({
      events: [
        {
          eventId: "bae2fa8b-dd6e-52b2-90c3-c401f340d50f",
          title: "Opening",
          start: "2026-08-28T09:30:00+02:00",
          end: "2026-08-28T09:50:00+02:00",
          venueTitle: "Guadeloupe",
          url: "https://pretalx.com/sotm2026/talk/SEDEA8/",
        },
      ],
      shifts: [],
      shiftStart,
      shiftEnd,
    });
    expect(items).toEqual([
      {
        id: "event-bae2fa8b-dd6e-52b2-90c3-c401f340d50f",
        title: "Opening",
        start: "2026-08-28T09:30:00+02:00",
        end: "2026-08-28T09:50:00+02:00",
        location: "Guadeloupe",
        url: "https://pretalx.com/sotm2026/talk/SEDEA8/",
      },
    ]);
  });

  it("maps shifts through the injected time resolvers, defaulting the kind", () => {
    const items = scheduleIcsItems({
      events: [],
      shifts: [
        { _id: "s1", kind: "Volunteer", start: "2026-08-28T09:00:00", end: "2026-08-28T17:00:00" },
        { _id: "s2", start: "2026-08-29T09:00:00", end: "2026-08-29T12:00:00" }, // no kind
      ],
      shiftStart,
      shiftEnd,
    });
    expect(items.map((i) => [i.id, i.title])).toEqual([
      ["shift-s1", "Volunteer"],
      ["shift-s2", "Shift"],
    ]);
  });

  it("trims whitespace-only kinds and titles instead of shipping strings the backend rejects", () => {
    const items = scheduleIcsItems({
      events: [
        { eventId: "1", title: "   ", start: "2026-08-28T13:00:00", end: "2026-08-28T14:00:00" }, // dropped
        { eventId: "2", title: "  Real Talk  ", start: "2026-08-28T13:00:00", end: "2026-08-28T14:00:00" },
      ],
      shifts: [{ _id: "s1", kind: "   ", start: "2026-08-28T09:00:00", end: "2026-08-28T17:00:00" }],
      shiftStart,
      shiftEnd,
    });
    expect(items.map((i) => [i.id, i.title])).toEqual([
      ["event-2", "Real Talk"],
      ["shift-s1", "Shift"],
    ]);
  });

  it("drops zero-duration shifts but keeps overnight ones for the backend to normalize", () => {
    const items = scheduleIcsItems({
      events: [],
      shifts: [
        { _id: "zero", kind: "Shift", start: "2026-08-28T09:00:00", end: "2026-08-28T09:00:00" },
        // Same-day strings with end before start = the extras form's overnight shape.
        { _id: "overnight", kind: "Late social", start: "2026-08-28T22:00:00", end: "2026-08-28T01:00:00" },
      ],
      shiftStart,
      shiftEnd,
    });
    expect(items.map((i) => i.id)).toEqual(["shift-overnight"]);
  });

  it("drops entries the backend would reject: malformed times and blank titles", () => {
    const items = scheduleIcsItems({
      events: [{ eventId: "1", title: "", start: "2026-08-28T13:00:00", end: "2026-08-28T14:00:00" }],
      shifts: [
        // The known legacy shape: a cleared time input persisted as `<date>T:00`.
        { _id: "bad", kind: "Shift", start: "2026-08-28T:00", end: "2026-08-28T17:00:00" },
        { _id: "ok", kind: "Shift", start: "2026-08-28T09:00:00", end: "2026-08-28T17:00:00" },
      ],
      shiftStart,
      shiftEnd,
    });
    expect(items.map((i) => i.id)).toEqual(["shift-ok"]);
  });
});
