import { describe, it, expect } from "vitest";
import {
  meetingDayFor,
  sessionsOnNow,
  upNextSessions,
  toMeetingDate,
  scheduleIcsItems,
  flattenAgenda,
  AREA_COLORS,
  DEFAULT_AREA_COLOR,
} from "./festival-utils.js";

// Everything is anchored through toMeetingDate so events and "now" share one frame.
const at = (s) => toMeetingDate(s).getTime();
const ev = (venueTitle, start, end, eventId = `${venueTitle}-${start}`) => ({ eventId, venueTitle, start, end });

describe("meetingDayFor — 4 AM night cutoff (late-running side meetings)", () => {
  it("rolls a 1 AM social back to the previous meeting day", () => {
    expect(meetingDayFor("2026-07-19T01:00:00")).toBe("Saturday"); // early Sunday → Saturday night
  });
  it("keeps a 5 AM item on its own day", () => {
    expect(meetingDayFor("2026-07-19T05:00:00")).toBe("Sunday");
  });
  it("treats exactly 4:00 AM as the new day, 3:59 as the old", () => {
    expect(meetingDayFor("2026-07-19T04:00:00")).toBe("Sunday");
    expect(meetingDayFor("2026-07-19T03:59:00")).toBe("Saturday");
  });
  it("leaves a normal late-evening item on its day", () => {
    expect(meetingDayFor("2026-07-18T23:00:00")).toBe("Saturday");
  });
  // The agenda feed stamps UTC times; the day must come out in Vienna terms.
  it("maps the feed's UTC form to the Vienna day", () => {
    expect(meetingDayFor("2026-07-20T07:30:00Z")).toBe("Monday"); // 09:30 CEST
    expect(meetingDayFor("2026-07-20T22:30:00Z")).toBe("Monday"); // 00:30 CEST Tue → rolls back
  });
});

describe("sessionsOnNow — meeting right now (started, not yet ended)", () => {
  const now = at("2026-07-20T10:45:00");
  const events = [
    ev("A", "2026-07-20T09:45:00", "2026-07-20T11:15:00"), // started an hour ago, still going
    ev("B", "2026-07-20T09:00:00", "2026-07-20T10:00:00"), // already ended
    ev("C", "2026-07-20T11:00:00", "2026-07-20T12:00:00"), // hasn't started
  ];
  it("includes a session that started an hour ago but hasn't ended", () => {
    expect(sessionsOnNow(events, now).map((e) => e.venueTitle)).toEqual(["A"]);
  });
});

describe("upNextSessions — the next wave (anchored on the next session, not the clock)", () => {
  const now = at("2026-07-20T10:30:00");
  const events = [
    ev("A", "2026-07-20T10:00:00", "2026-07-20T11:00:00"), // meeting now
    ev("A", "2026-07-20T11:00:00", "2026-07-20T12:00:00"), // up next #1
    ev("A", "2026-07-20T12:00:00", "2026-07-20T13:00:00"), // up next #2
    ev("A", "2026-07-20T13:30:00", "2026-07-20T14:30:00"), // 3rd — over per-room cap
    ev("B", "2026-07-20T10:30:00", "2026-07-20T11:30:00"), // meeting now
    ev("B", "2026-07-20T11:30:00", "2026-07-20T12:30:00"), // up next
    ev("C", "2026-07-20T15:30:00", "2026-07-20T16:30:00"), // a wave away — excluded
  ];
  const next = upNextSessions(events, now);

  it("caps at two upcoming sessions per room", () => {
    const aTimes = next.filter((e) => e.venueTitle === "A").map((e) => e.start);
    expect(aTimes).toEqual(["2026-07-20T11:00:00", "2026-07-20T12:00:00"]); // not the 13:30 one
  });
  it("drops a room whose next session is a whole wave away", () => {
    // next wave anchors on 11:00 (+2h = 13:00), so C at 15:30 is out.
    expect(next.some((e) => e.venueTitle === "C")).toBe(false);
  });
  it("never lists a currently-meeting session as up next", () => {
    expect(next.some((e) => e.start === "2026-07-20T10:00:00")).toBe(false);
    expect(next.some((e) => e.start === "2026-07-20T10:30:00")).toBe(false);
  });
  it("returns the wave sorted by start", () => {
    expect(next.map((e) => e.start)).toEqual([
      "2026-07-20T11:00:00", // A
      "2026-07-20T11:30:00", // B
      "2026-07-20T12:00:00", // A
    ]);
  });

  // The opening wave is visible even when the meeting is weeks out (anchor on the
  // next session, never on "now").
  it("shows the opening wave a month before the meeting", () => {
    const monthBefore = at("2026-06-18T12:00:00");
    const opening = [
      ev("A", "2026-07-18T09:30:00", "2026-07-18T10:30:00"),
      ev("B", "2026-07-18T10:00:00", "2026-07-18T11:00:00"),
      ev("C", "2026-07-18T13:00:00", "2026-07-18T14:00:00"), // later that day — next wave
    ];
    const n = upNextSessions(opening, monthBefore);
    expect(n.map((e) => e.venueTitle)).toEqual(["A", "B"]);
    expect(n.some((e) => e.venueTitle === "C")).toBe(false);
  });

  // At the end of a day, "up next" rolls to the next morning's first sessions.
  it("rolls to the next morning after the day's last session", () => {
    const lateNight = at("2026-07-20T23:30:00");
    const evs = [
      ev("A", "2026-07-20T22:00:00", "2026-07-20T23:00:00"), // already ended
      ev("D", "2026-07-21T09:30:00", "2026-07-21T10:30:00"), // next morning
      ev("E", "2026-07-21T10:00:00", "2026-07-21T11:00:00"), // next morning
      ev("F", "2026-07-21T15:00:00", "2026-07-21T16:00:00"), // afternoon — next wave
    ];
    const n = upNextSessions(evs, lateNight);
    expect(n.map((e) => e.venueTitle)).toEqual(["D", "E"]);
  });
});

// A trimmed slice of the real agenda.json shape: { "126": [assignment, ...] } where
// sessions share the flat list with room ("location") and area ("parent") records,
// and session rows can be waiting ("schedw") or canceled.
const FIXTURE = {
  126: [
    { id: 1217, modified: "2026-06-26T19:31:51Z", name: "Level M2 Executive Lounge Terrace", objtype: "location" },
    { description: "Web and Internet Transport", id: 2412, modified: "2026-05-24T13:28:37Z", name: "wit", objtype: "parent" },
    {
      agenda: "https://datatracker.ietf.org/meeting/126/materials/agenda-126-bfd-00",
      duration: "1:00:00",
      group: { acronym: "bfd", name: "Bidirectional Forwarding Detection", parent: "rtg", state: "active", type: "wg" },
      id: 141183,
      is_bof: false,
      location: "Park Suite 8",
      name: "Bidirectional Forwarding Detection",
      objtype: "session",
      session_id: 35438,
      start: "2026-07-20T09:30:00Z",
      status: "sched",
    },
    {
      duration: "2:00:00",
      group: {
        acronym: "sustain",
        name: "Proposed Sustainability and the Internet Proposed Research Group",
        parent: "irtf",
        state: "active",
        type: "rg",
      },
      id: 141286,
      is_bof: false,
      location: "Park Suite 8",
      name: "Proposed Sustainability and the Internet Proposed Research Group",
      objtype: "session",
      session_id: 35566,
      start: "2026-07-23T07:00:00Z",
      status: "sched",
    },
    {
      agenda: "https://datatracker.ietf.org/meeting/126/materials/agenda-126-dawn-06",
      duration: "2:00:00",
      group: {
        acronym: "dawn",
        name: "Discovery of Agents, Workloads, and Named entities",
        parent: "int",
        state: "bof",
        type: "wg",
      },
      id: 141229,
      is_bof: true,
      location: "Grand Park Hall 3",
      name: "Discovery of Agents, Workloads, and Named entities",
      objtype: "session",
      session_id: 35642,
      start: "2026-07-21T12:00:00Z",
      status: "sched",
    },
    {
      duration: "1:30:00",
      group: { acronym: "iabopen", name: "IAB Open Meeting", parent: "iab", state: "active", type: "ag" },
      id: 141211,
      is_bof: false,
      location: "Grand Park Hall 3",
      name: "IAB Open Meeting",
      objtype: "session",
      session_id: 35589,
      start: "2026-07-21T07:00:00Z",
      status: "sched",
    },
    {
      agenda: "https://datatracker.ietf.org/meeting/126/materials/agenda-126-systers-sessb-01",
      duration: "1:00:00",
      group: { acronym: "systers", name: "Systers", state: "active", type: "team" },
      id: 141302,
      is_bof: false,
      location: "Level M2 Executive Lounge Terrace",
      name: "Systers Lunch",
      objtype: "session",
      session_id: 35691,
      start: "2026-07-23T10:45:00Z",
      status: "sched",
    },
    {
      duration: "1:30:00",
      group: {
        acronym: "dinrg",
        name: "Decentralization of the Internet Research Group",
        parent: "irtf",
        state: "active",
        type: "rg",
      },
      id: 141220,
      is_bof: false,
      location: "Grand Klimt Hall 2",
      name: "Decentralization of the Internet Research Group",
      objtype: "session",
      session_id: 35595,
      start: "2026-07-21T09:00:00Z",
      status: "canceled",
    },
    {
      agenda: "https://datatracker.ietf.org/meeting/126/materials/agenda-126-iesg-sessa-00",
      duration: "1:00:00",
      group: { acronym: "iesg", name: "Internet Engineering Steering Group", parent: "ietf", state: "active", type: "ietf" },
      id: 141366,
      is_bof: false,
      location: "Park Suite 10",
      name: "INT AD Office Hours",
      objtype: "session",
      session_id: 35714,
      start: "2026-07-22T09:00:00Z",
      status: "schedw",
    },
  ],
};

describe("flattenAgenda — agenda.json assignments become schedule events", () => {
  const events = flattenAgenda(FIXTURE);
  const byId = Object.fromEntries(events.map((e) => [e.eventId, e]));

  it("keeps only firmly scheduled sessions (drops room/area records, schedw, canceled)", () => {
    expect(events.map((e) => e.acronym).sort()).toEqual(["bfd", "dawn", "iabopen", "sustain", "systers"]);
  });

  it("keys events by the stringified session_id (stable across reschedules)", () => {
    expect(byId["35438"].title).toBe("Bidirectional Forwarding Detection");
    expect(events.every((e) => typeof e.eventId === "string")).toBe(true);
  });

  it("computes end from the H:MM:SS duration", () => {
    expect(byId["35438"].end).toBe("2026-07-20T10:30:00Z"); // 1:00:00
    expect(byId["35566"].end).toBe("2026-07-23T09:00:00Z"); // 2:00:00
    expect(byId["35589"].end).toBe("2026-07-21T08:30:00Z"); // 1:30:00
  });

  it("handles arbitrary H:MM:SS durations and defaults a missing one to an hour", () => {
    const mk = (duration) =>
      flattenAgenda({
        126: [
          {
            objtype: "session",
            status: "sched",
            session_id: 1,
            name: "X",
            group: {},
            start: "2026-07-20T09:30:00Z",
            ...(duration ? { duration } : {}),
          },
        ],
      })[0];
    expect(mk("2:30:00").end).toBe("2026-07-20T12:00:00Z");
    expect(mk(null).end).toBe("2026-07-20T10:30:00Z"); // nominal hour, session stays visible
  });

  it("drops a session with an unparseable start", () => {
    const out = flattenAgenda({
      126: [{ objtype: "session", status: "sched", session_id: 2, name: "X", group: {}, duration: "1:00:00" }],
    });
    expect(out).toEqual([]);
  });

  it("maps the group's area to the lineup chip, with the neutral default off-tree", () => {
    expect(byId["35438"].lineup).toEqual({ id: "rtg", color: AREA_COLORS.rtg });
    expect(byId["35566"].lineup).toEqual({ id: "irtf", color: AREA_COLORS.irtf });
    // iab isn't an AREA_COLORS key; teams carry no parent at all — both fall back.
    expect(byId["35589"].lineup).toEqual({ id: "iab", color: DEFAULT_AREA_COLOR });
    expect(byId["35691"].lineup).toEqual({ id: "team", color: DEFAULT_AREA_COLOR });
  });

  it("carries the BOF flag and group identity", () => {
    expect(byId["35642"].isBof).toBe(true);
    expect(byId["35438"].isBof).toBe(false);
    expect(byId["35642"].acronym).toBe("dawn");
    expect(byId["35642"].groupName).toBe("Discovery of Agents, Workloads, and Named entities");
  });

  it("links the materials page when present, else the group's about page", () => {
    expect(byId["35438"].url).toBe("https://datatracker.ietf.org/meeting/126/materials/agenda-126-bfd-00");
    expect(byId["35566"].url).toBe("https://datatracker.ietf.org/group/sustain/about/");
  });

  it("falls back to TBA when the room is missing and stamps the Vienna meeting day", () => {
    const out = flattenAgenda({
      126: [
        {
          objtype: "session",
          status: "sched",
          session_id: 3,
          name: "X",
          group: {},
          start: "2026-07-20T09:30:00Z",
          duration: "1:00:00",
        },
      ],
    });
    expect(out[0].venueTitle).toBe("TBA");
    expect(byId["35438"].day).toBe("Monday"); // 09:30Z = 11:30 CEST
  });
});

describe("scheduleIcsItems — flattening My Faves for the .ics backend", () => {
  const shiftStart = (s) => s.start;
  const shiftEnd = (s) => s.end;

  it("maps favorite sessions with doc-keyed ids, location, and url", () => {
    const items = scheduleIcsItems({
      events: [
        {
          eventId: "35438",
          title: "Bidirectional Forwarding Detection",
          start: "2026-07-20T09:30:00Z",
          end: "2026-07-20T10:30:00Z",
          venueTitle: "Park Suite 8",
          url: "https://datatracker.ietf.org/meeting/126/materials/agenda-126-bfd-00",
        },
      ],
      shifts: [],
      shiftStart,
      shiftEnd,
    });
    expect(items).toEqual([
      {
        id: "event-35438",
        title: "Bidirectional Forwarding Detection",
        start: "2026-07-20T09:30:00Z",
        end: "2026-07-20T10:30:00Z",
        location: "Park Suite 8",
        url: "https://datatracker.ietf.org/meeting/126/materials/agenda-126-bfd-00",
      },
    ]);
  });

  it("maps shifts through the injected time resolvers, defaulting the kind", () => {
    const items = scheduleIcsItems({
      events: [],
      shifts: [
        { _id: "s1", kind: "Side meeting", start: "2026-07-18T09:00:00", end: "2026-07-18T17:00:00" },
        { _id: "s2", start: "2026-07-19T09:00:00", end: "2026-07-19T12:00:00" }, // no kind
      ],
      shiftStart,
      shiftEnd,
    });
    expect(items.map((i) => [i.id, i.title])).toEqual([
      ["shift-s1", "Side meeting"],
      ["shift-s2", "Shift"],
    ]);
  });

  it("trims whitespace-only kinds and titles instead of shipping strings the backend rejects", () => {
    const items = scheduleIcsItems({
      events: [
        { eventId: "1", title: "   ", start: "2026-07-20T13:00:00", end: "2026-07-20T14:00:00" }, // dropped
        { eventId: "2", title: "  Real Session  ", start: "2026-07-20T13:00:00", end: "2026-07-20T14:00:00" },
      ],
      shifts: [{ _id: "s1", kind: "   ", start: "2026-07-18T09:00:00", end: "2026-07-18T17:00:00" }],
      shiftStart,
      shiftEnd,
    });
    expect(items.map((i) => [i.id, i.title])).toEqual([
      ["event-2", "Real Session"],
      ["shift-s1", "Shift"],
    ]);
  });

  it("drops zero-duration shifts but keeps overnight ones for the backend to normalize", () => {
    const items = scheduleIcsItems({
      events: [],
      shifts: [
        { _id: "zero", kind: "Shift", start: "2026-07-18T09:00:00", end: "2026-07-18T09:00:00" },
        // Same-day strings with end before start = the extras form's overnight shape.
        { _id: "overnight", kind: "Late social", start: "2026-07-18T22:00:00", end: "2026-07-18T01:00:00" },
      ],
      shiftStart,
      shiftEnd,
    });
    expect(items.map((i) => i.id)).toEqual(["shift-overnight"]);
  });

  it("drops entries the backend would reject: malformed times and blank titles", () => {
    const items = scheduleIcsItems({
      events: [{ eventId: "1", title: "", start: "2026-07-20T13:00:00", end: "2026-07-20T14:00:00" }],
      shifts: [
        // The known legacy shape: a cleared time input persisted as `<date>T:00`.
        { _id: "bad", kind: "Shift", start: "2026-07-18T:00", end: "2026-07-18T17:00:00" },
        { _id: "ok", kind: "Shift", start: "2026-07-18T09:00:00", end: "2026-07-18T17:00:00" },
      ],
      shiftStart,
      shiftEnd,
    });
    expect(items.map((i) => i.id)).toEqual(["shift-ok"]);
  });
});
