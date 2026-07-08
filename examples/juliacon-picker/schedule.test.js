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

describe("festivalDayFor — 4 AM night cutoff (matches the feed's own day_start)", () => {
  it("rolls a 1 AM social back to the previous conference day", () => {
    expect(festivalDayFor("2026-08-12T01:00:00")).toBe("Tuesday"); // early Wednesday → Tuesday night
  });
  it("keeps a 5 AM event on its own day", () => {
    expect(festivalDayFor("2026-08-12T05:00:00")).toBe("Wednesday");
  });
  it("treats exactly 4:00 AM as the new day, 3:59 as the old", () => {
    expect(festivalDayFor("2026-08-12T04:00:00")).toBe("Wednesday");
    expect(festivalDayFor("2026-08-12T03:59:00")).toBe("Tuesday");
  });
  it("leaves a normal late-evening event on its day", () => {
    expect(festivalDayFor("2026-08-11T23:00:00")).toBe("Tuesday");
  });
});

// A trimmed slice of the real pretalx export: schedule.conference.days[], each day
// carrying a `rooms` map of room name → event array. First event is verbatim-shaped
// from the live feed (guid/date/end/duration/persons); the rest exercise the
// fallback paths (missing end, null track, unparseable date).
const FEED = {
  schedule: {
    conference: {
      acronym: "juliacon-2026",
      time_zone_name: "Europe/Berlin",
      days: [
        {
          index: 1,
          date: "2026-08-10",
          day_start: "2026-08-10T04:00:00+02:00",
          day_end: "2026-08-11T03:59:00+02:00",
          rooms: {
            "Tent — RW1": [
              {
                guid: "ebff81c1-978a-5db3-9392-44fb8d2a2b73",
                code: "83EN8J",
                id: 92848,
                date: "2026-08-10T10:00:00+02:00",
                start: "10:00",
                end: "2026-08-10T13:00:00+02:00",
                duration: "03:00",
                room: "Tent — RW1",
                url: "https://pretalx.com/juliacon-2026/talk/83EN8J/",
                title: "DyadAgent: Adding intelligence to modeling and simulation",
                subtitle: "",
                track: "General",
                type: "Workshop",
                persons: [{ name: "Venkatesh-Prasad Bhat" }, { name: "Anas Abdelrehim" }],
              },
            ],
          },
        },
        {
          index: 3,
          date: "2026-08-12",
          rooms: {
            "Muschel — N2": [
              {
                // No explicit `end` and a single-digit-hour duration — derived.
                guid: "11111111-aaaa-5bbb-cccc-000000000001",
                id: 1,
                date: "2026-08-12T09:00:00+02:00",
                start: "09:00",
                duration: "0:30",
                room: "Muschel — N2",
                url: "https://pretalx.com/juliacon-2026/talk/X1/",
                title: "A lightning tour of Julia iterators",
                track: null,
                type: "Short talk",
                persons: [],
              },
              {
                // Post-midnight social: 00:30 on the 13th belongs to Wednesday the 12th.
                guid: "11111111-aaaa-5bbb-cccc-000000000002",
                id: 2,
                date: "2026-08-13T00:30:00+02:00",
                start: "00:30",
                end: "2026-08-13T01:30:00+02:00",
                duration: "01:00",
                room: "Muschel — N2",
                url: "https://pretalx.com/juliacon-2026/talk/X2/",
                title: "Late social",
                track: "General",
                type: "Birds of Feather (BoF)",
                persons: [{ name: "Solo Speaker" }],
              },
              {
                // Unparseable date — the event can't be placed, so it's skipped.
                guid: "11111111-aaaa-5bbb-cccc-000000000003",
                id: 3,
                date: "not-a-date",
                duration: "01:00",
                title: "Ghost event",
                track: "General",
                type: "Short talk",
                persons: [],
              },
              {
                // No end and a malformed duration — nothing to recover an end
                // from, so the row is skipped (an end-less event would break
                // Now/up-next and the ics export).
                guid: "11111111-aaaa-5bbb-cccc-000000000004",
                id: 4,
                date: "2026-08-13T10:00:00+02:00",
                duration: "soon",
                title: "Endless event",
                track: "General",
                type: "Short talk",
                persons: [],
              },
              {
                // Unparseable explicit end but a good duration — recovered.
                guid: "11111111-aaaa-5bbb-cccc-000000000005",
                id: 5,
                date: "2026-08-13T11:00:00+02:00",
                end: "whenever",
                duration: "0:45",
                title: "Recovered end",
                track: "General",
                type: "Short talk",
                persons: [],
              },
            ],
          },
        },
      ],
    },
  },
};

describe("flattenPretalx — pretalx/frab schedule.json → the flat event list", () => {
  const flat = flattenPretalx(FEED);

  it("uses the pretalx guid (stringified) as the stable eventId", () => {
    expect(flat[0].eventId).toBe("ebff81c1-978a-5db3-9392-44fb8d2a2b73");
    expect(typeof flat[0].eventId).toBe("string");
  });

  it("keeps an explicit feed end, and derives one from duration when it's missing", () => {
    expect(flat[0].end).toBe("2026-08-10T13:00:00+02:00"); // explicit end wins
    const derived = flat.find((e) => e.title === "A lightning tour of Julia iterators");
    // 09:00+02:00 plus the "0:30" (H:MM) duration = exactly 30 minutes later.
    expect(toFestivalDate(derived.end).getTime() - toFestivalDate(derived.start).getTime()).toBe(30 * 60 * 1000);
  });

  it("defaults a null track to General", () => {
    const derived = flat.find((e) => e.title === "A lightning tour of Julia iterators");
    expect(derived.track).toBe("General");
    expect(derived.lineup.id).toBe("General");
  });

  it("colors tracks deterministically from the Julia brand cycle", () => {
    expect(TRACK_COLORS).toContain(trackColor("General"));
    expect(trackColor("General")).toBe(trackColor("General")); // same track → same color, always
    expect(flat[0].lineup.color).toBe(trackColor("General"));
    // A second flatten of the same feed reproduces identical colors.
    const again = flattenPretalx(FEED);
    expect(again.map((e) => e.lineup.color)).toEqual(flat.map((e) => e.lineup.color));
  });

  it("maps conference days across the +02:00 offset, with the 4 AM cutoff", () => {
    expect(flat[0].day).toBe("Monday"); // 2026-08-10T10:00+02:00
    expect(flat.find((e) => e.title === "Late social").day).toBe("Wednesday"); // 00:30 on the 13th → the 12th
  });

  it("joins speaker names for the card byline", () => {
    expect(flat[0].speakers).toBe("Venkatesh-Prasad Bhat, Anas Abdelrehim");
    expect(flat.find((e) => e.title === "Late social").speakers).toBe("Solo Speaker");
    expect(flat.find((e) => e.title === "A lightning tour of Julia iterators").speakers).toBe("");
  });

  it("takes the room name from the rooms map key as venueTitle", () => {
    expect(flat[0].venueTitle).toBe("Tent — RW1");
    expect(flat.find((e) => e.title === "Late social").venueTitle).toBe("Muschel — N2");
  });

  it("skips events whose date doesn't parse", () => {
    expect(flat.some((e) => e.title === "Ghost event")).toBe(false);
  });

  it("skips rows with no recoverable end, and recovers an unparseable end from duration", () => {
    expect(flat.some((e) => e.title === "Endless event")).toBe(false);
    const recovered = flat.find((e) => e.title === "Recovered end");
    expect(toFestivalDate(recovered.end).getTime() - toFestivalDate(recovered.start).getTime()).toBe(45 * 60 * 1000);
    expect(flat.length).toBe(4);
  });
});

describe("setsOnNow — running right now (started, not yet ended)", () => {
  const now = at("2026-08-12T09:45:00");
  const events = [
    ev("A", "2026-08-12T08:45:00", "2026-08-12T10:15:00"), // started an hour ago, still going
    ev("B", "2026-08-12T08:00:00", "2026-08-12T09:00:00"), // already ended
    ev("C", "2026-08-12T10:00:00", "2026-08-12T11:00:00"), // hasn't started
  ];
  it("includes a talk that started an hour ago but hasn't ended", () => {
    expect(setsOnNow(events, now).map((e) => e.venueTitle)).toEqual(["A"]);
  });
});

describe("upNextSets — the next wave (anchored on the next talk, not the clock)", () => {
  const now = at("2026-08-12T09:30:00");
  const events = [
    ev("A", "2026-08-12T09:00:00", "2026-08-12T10:00:00"), // running now
    ev("A", "2026-08-12T10:00:00", "2026-08-12T11:00:00"), // up next #1
    ev("A", "2026-08-12T11:00:00", "2026-08-12T12:00:00"), // up next #2
    ev("A", "2026-08-12T12:30:00", "2026-08-12T13:30:00"), // 3rd — over per-room cap
    ev("B", "2026-08-12T09:30:00", "2026-08-12T10:30:00"), // running now
    ev("B", "2026-08-12T10:30:00", "2026-08-12T11:30:00"), // up next
    ev("C", "2026-08-12T14:30:00", "2026-08-12T15:30:00"), // a wave away — excluded
  ];
  const next = upNextSets(events, now);

  it("caps at two upcoming talks per room", () => {
    const aTimes = next.filter((e) => e.venueTitle === "A").map((e) => e.start);
    expect(aTimes).toEqual(["2026-08-12T10:00:00", "2026-08-12T11:00:00"]); // not the 12:30 one
  });
  it("drops a room whose next talk is a whole wave away", () => {
    // next wave anchors on 10:00 (+2h = 12:00), so C at 14:30 is out.
    expect(next.some((e) => e.venueTitle === "C")).toBe(false);
  });
  it("never lists a currently-running talk as up next", () => {
    expect(next.some((e) => e.start === "2026-08-12T09:00:00")).toBe(false);
    expect(next.some((e) => e.start === "2026-08-12T09:30:00")).toBe(false);
  });
  it("returns the wave sorted by start", () => {
    expect(next.map((e) => e.start)).toEqual([
      "2026-08-12T10:00:00", // A
      "2026-08-12T10:30:00", // B
      "2026-08-12T11:00:00", // A
    ]);
  });

  // The opening wave is visible even when the conference is weeks out (anchor on the
  // next talk, never on "now").
  it("shows the opening wave a month before the conference", () => {
    const monthBefore = at("2026-07-10T12:00:00");
    const opening = [
      ev("A", "2026-08-10T09:00:00", "2026-08-10T10:00:00"),
      ev("B", "2026-08-10T09:30:00", "2026-08-10T10:30:00"),
      ev("C", "2026-08-10T13:30:00", "2026-08-10T14:30:00"), // later that day — next wave
    ];
    const n = upNextSets(opening, monthBefore);
    expect(n.map((e) => e.venueTitle)).toEqual(["A", "B"]);
    expect(n.some((e) => e.venueTitle === "C")).toBe(false);
  });

  // At the end of a day, "up next" rolls to the next morning's first sessions.
  it("rolls to the next morning after the day's last talk", () => {
    const lateNight = at("2026-08-12T23:30:00");
    const evs = [
      ev("A", "2026-08-12T22:00:00", "2026-08-12T23:00:00"), // already ended
      ev("D", "2026-08-13T09:00:00", "2026-08-13T10:00:00"), // next morning
      ev("E", "2026-08-13T09:30:00", "2026-08-13T10:30:00"), // next morning
      ev("F", "2026-08-13T15:00:00", "2026-08-13T16:00:00"), // afternoon — next wave
    ];
    const n = upNextSets(evs, lateNight);
    expect(n.map((e) => e.venueTitle)).toEqual(["D", "E"]);
  });
});

describe("scheduleIcsItems — flattening My Faves for the .ics backend", () => {
  const shiftStart = (s) => s.start;
  const shiftEnd = (s) => s.end;

  it("maps favorite talks with doc-keyed ids, location, and url", () => {
    const items = scheduleIcsItems({
      events: [
        {
          eventId: "ebff81c1-978a-5db3-9392-44fb8d2a2b73",
          title: "DyadAgent: Adding intelligence to modeling and simulation",
          start: "2026-08-10T10:00:00+02:00",
          end: "2026-08-10T13:00:00+02:00",
          venueTitle: "Tent — RW1",
          url: "https://pretalx.com/juliacon-2026/talk/83EN8J/",
        },
      ],
      shifts: [],
      shiftStart,
      shiftEnd,
    });
    expect(items).toEqual([
      {
        id: "event-ebff81c1-978a-5db3-9392-44fb8d2a2b73",
        title: "DyadAgent: Adding intelligence to modeling and simulation",
        start: "2026-08-10T10:00:00+02:00",
        end: "2026-08-10T13:00:00+02:00",
        location: "Tent — RW1",
        url: "https://pretalx.com/juliacon-2026/talk/83EN8J/",
      },
    ]);
  });

  it("maps shifts through the injected time resolvers, defaulting the kind", () => {
    const items = scheduleIcsItems({
      events: [],
      shifts: [
        { _id: "s1", kind: "Volunteer", start: "2026-08-10T09:00:00", end: "2026-08-10T17:00:00" },
        { _id: "s2", start: "2026-08-11T09:00:00", end: "2026-08-11T12:00:00" }, // no kind
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
        { eventId: "1", title: "   ", start: "2026-08-11T13:00:00", end: "2026-08-11T14:00:00" }, // dropped
        { eventId: "2", title: "  Real Talk  ", start: "2026-08-11T13:00:00", end: "2026-08-11T14:00:00" },
      ],
      shifts: [{ _id: "s1", kind: "   ", start: "2026-08-10T09:00:00", end: "2026-08-10T17:00:00" }],
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
        { _id: "zero", kind: "Shift", start: "2026-08-10T09:00:00", end: "2026-08-10T09:00:00" },
        // Same-day strings with end before start = the extras form's overnight shape.
        { _id: "overnight", kind: "Late setup", start: "2026-08-10T22:00:00", end: "2026-08-10T01:00:00" },
      ],
      shiftStart,
      shiftEnd,
    });
    expect(items.map((i) => i.id)).toEqual(["shift-overnight"]);
  });

  it("drops entries the backend would reject: malformed times and blank titles", () => {
    const items = scheduleIcsItems({
      events: [{ eventId: "1", title: "", start: "2026-08-11T13:00:00", end: "2026-08-11T14:00:00" }],
      shifts: [
        // The known legacy shape: a cleared time input persisted as `<date>T:00`.
        { _id: "bad", kind: "Shift", start: "2026-08-10T:00", end: "2026-08-10T17:00:00" },
        { _id: "ok", kind: "Shift", start: "2026-08-10T09:00:00", end: "2026-08-10T17:00:00" },
      ],
      shiftStart,
      shiftEnd,
    });
    expect(items.map((i) => i.id)).toEqual(["shift-ok"]);
  });
});
