# picker-baseline

The festival schedule picker, with the festival factored out.

This is a **clone of the live `og/pickathon-picker` source** (pulled with
`vibes-diy pull --published`, 2026-08-18 — the deployed app is the base of
truth, and the repo copy drifts behind it), rewired so that instantiating a new
festival is an edit to two files instead of a fork.

## What you change

| File | What lives there |
| --- | --- |
| `festival-config.js` | name, db name, deployed URL, timezone, day table, header copy, links |
| `backend.js` — the `FESTIVAL CONFIG` block | the same values again, for the isolate (it resolves no imports) |
| `backend.js` — the `FEED ADAPTER` block | `ingestScheduleFeed()`: the shape of this festival's published data |
| `styles.js` | the palette — Tailwind arbitrary values, so they stay literal here |

`festival-config.test.js` fails the build if the two config copies drift apart.

## What you do NOT change

Favorites, notes, extras, follower sharing, the `.ics` download and live
subscribe lanes, the schedule mirror, offline boot, load shedding, the 4 AM
day-cutoff, timezone handling. Those are the proven part. Improvements go
**upstream into `og/pickathon-picker` first** and flow down to every
instantiation — a fix made only here is a fix the fleet doesn't get.

Ops runbooks (deploy, live-event handling, load shedding) live with the
reference app: `examples/pickathon-picker/RUNBOOK.md`.

## The feed adapter is the whole port

Everything social transfers verbatim. The only genuinely new code per festival
is `ingestScheduleFeed()` — take whatever `SCHEDULE_URL` returns and emit

```js
{ eventId, title, start, end, venueTitle, url?, venueColor?, lineup? }
```

with `start`/`end` as naive local times in the festival's timezone.

**`eventId` must be stable across refetches.** If the source has no id of its
own, hash the content — `date|HHMM|stageSlug|titleSlug` — because an id that
moves orphans every favorite anyone has made.

### Which door the data comes through

The mirror fetches on the **scheduled** lane, through platform egress, so CORS
never applies — a festival site that a browser can't fetch is still fine here.
The test is whether the *worker* can reach it:

1. **Site reachable from the worker** — point `SCHEDULE_URL` at it. Most sites,
   including CORS-locked ones.
2. **Worker blocked (403/WAF) or no feed at all** — the owner writes a snapshot
   doc instead and the tick mirrors from that. Same read path downstream; only
   the source of `feedItems` changes.

Either way the client never fetches the festival's site, and the `.ics`
subscription lane makes no egress at all.
