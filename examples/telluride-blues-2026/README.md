# telluride-blues-2026

An unofficial, fan-made schedule app for **Telluride Blues & Brews**
(Sep 17–20, 2026 · Town Park, Telluride, CO).

Instantiated from [`../picker-baseline`](../picker-baseline), which is the live
`og/pickathon-picker` source with the festival factored out. The engine itself
is unmodified — favorites, notes, extras, follower sharing, `.ics` download and
subscribe, offline boot, load shedding all transfer verbatim.

## What is festival-specific here

- `festival-config.js` — identity, timezone, the four-day table, header copy.
- `backend.js` — the `FESTIVAL CONFIG` block and the **feed adapter**.
- `styles.js` — the palette and the per-stage card tints, both taken from the
  festival's own site and mark (indigo #3A3582, gold #D59F20, sun #F08040).
- `fixtures/schedule-2026-08-18.json` — the festival's own schedule page,
  captured, so the adapter is tested against real markup.

Engine tests live in `picker-baseline`; the three here cover the parts that are
actually new — the adapter, the config the client and the isolate must agree on,
and the palette (including the null-lineup guards the three tag-rendering views
need, which is a crash this feed would otherwise reach).

## The data door

Telluride publishes a complete per-set grid on their own schedule page, and
Squarespace will serve that page as JSON (`?format=json`) — one URL, no auth.

**There is no CORS header on it, and that closes both fetch doors, not one.**
The client can't fetch it, and neither can the backend: the platform's egress
gate admits an outbound host only if that host answers with an
`Access-Control-Allow-Origin` of `*` or this vibe's own origin, and it applies
the same rule to the `fetch`, `scheduled` and `onChange` lanes alike. A vibe
cannot opt a host in — there is no config field for it; the only routes are the
site adding the header, a PR to the platform's curated egress list, or an
admin-granted `blessed` egress status on the owner's account.

Measured 2026-08-21 from a deployed probe, which is the only way to know:

    {"status":403,"bytes":68,
     "snippet":"{\"vibesEgressDenied\":true,\"gate\":\"cors\",\"host\":\"tellurideblues.com\"}"}

So this is a **Door 3** app: `refresh-schedule.mjs` fetches and parses OUTSIDE
the platform and writes the result in as `schedule-snapshot-<seq>` docs, and the
scheduled tick mirrors those into `scheduleitem` docs. The tick makes no egress
at all, and neither does the `.ics` subscription lane.

(An earlier version of this file claimed the mirror fetched live on the
scheduled lane. It never did — the tick reads snapshots only, and says
`schedule mirror failed {"error":"no snapshot"}` once a minute until one
exists.)

54 sets across four days and five stages parse out of the current page: Main
Stage, Blues Stage, Campground Sessions, the Truck Stage, and Thursday's
in-town events.

**Not mirrored: the late-night Juke Joints club shows.** They publish door times
only — no set times — and guessing them would be worse than omitting them.

**Verify at deploy time** that the worker itself can reach the URL (a site can
serve a session fine and still 403 worker egress — the DEF CON case). If it
can't, the fallback is an owner-written snapshot doc; the read path downstream
doesn't change.

### Running the refresh — the handle trap

`refresh-schedule.mjs` writes an owner-only doc, and **`user.isOwner` follows the
account's DEFAULT handle, not the account**. This app is owned by the `festival`
handle, so an operator whose default handle is something else gets
`Error: owner only` even though they own both handles — and `--handle festival`
on `db put` does _not_ fix it (it moves the acting handle for grants, not the
owner flag). Set the default handle for the duration and put it back after:

```bash
npx vibes-diy user-settings --set-default-handle festival
node refresh-schedule.mjs
npx vibes-diy user-settings --set-default-handle <your-usual-handle>
```

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

## Where it lives

`festival/telluride-blues-2026` — a festival-branded URL, so a campaign can point
at it. `FESTIVAL.vibeUrl` in `festival-config.js` is load-bearing twice over: it
is the QR code people scan to share their picks, and `refresh-schedule.mjs` reads
it to know which app to write to. Moving the app means changing that line.

The older `jchris/telluride-blues-2026` copy stays live and stops being linked —
anyone who already favorited sets there keeps their picks in that copy.
