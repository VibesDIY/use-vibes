# telluride-blues-2026

An unofficial, fan-made schedule picker for **Telluride Blues & Brews**
(Sep 17–20, 2026 · Town Park, Telluride, CO).

Instantiated from [`../picker-baseline`](../picker-baseline), which is the live
`og/pickathon-picker` source with the festival factored out. The picker itself
is unmodified — favorites, notes, extras, follower sharing, `.ics` download and
subscribe, offline boot, load shedding all transfer verbatim.

## What is festival-specific here

- `festival-config.js` — identity, timezone, the four-day table, header copy.
- `backend.js` — the `FESTIVAL CONFIG` block and the **feed adapter**.
- `styles.js` — the palette.
- `fixtures/schedule-2026-08-18.json` — the festival's own schedule page,
  captured, so the adapter is tested against real markup.

Engine tests live in `picker-baseline`; the two here cover the parts that are
actually new — the adapter, and the config the client and the isolate must agree
on.

## The data door

Telluride publishes a complete per-set grid on their own schedule page, and
Squarespace will serve that page as JSON (`?format=json`) — one URL, no auth.
There is no CORS header on it, so the client could never fetch it; the mirror
runs on the **scheduled** lane through platform egress instead, and the client
reads only the mirrored `scheduleitem` docs. The `.ics` subscription lane makes
no egress at all.

54 sets across four days and five stages parse out of the current page: Main
Stage, Blues Stage, Campground Sessions, the Truck Stage, and Thursday's
in-town events.

**Not mirrored: the late-night Juke Joints club shows.** They publish door times
only — no set times — and guessing them would be worse than omitting them.

**Verify at deploy time** that the worker itself can reach the URL (a site can
serve a session fine and still 403 worker egress — the DEF CON case). If it
can't, the fallback is an owner-written snapshot doc; the read path downstream
doesn't change.

Set times move in the last weeks before a festival. Re-capture the fixture and
re-run the tests before the flight opens:

```bash
curl -sSL 'https://tellurideblues.com/schedule?format=json' \
  -o fixtures/schedule-$(date +%F).json
```

Because `eventId` is content-hashed (`date|HHMM|stageSlug|titleSlug`), a set
that MOVES becomes a new id and drops out of anyone's favorites — that is the
honest behavior for a changed set, but it means a schedule shake-up close to the
gates costs people their picks. Worth watching in the wave report.
