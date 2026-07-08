# EuroSciPy 2026 Picker — Update Runbook

Live URL: https://vibes.diy/vibe/calendar/euroscipy-picker
Super mode (once live): `https://vibes.diy/vibe/calendar/euroscipy-picker?super=1`

## Edit → Push

```bash
cd vibes.diy/vibes/euroscipy-picker
# edit App.jsx
npx vibes-diy push --vibe calendar/euroscipy-picker
```

That's it. `push` deploys the app to `calendar/euroscipy-picker` and prints the live URL.

## Pull current live version

```bash
cd vibes.diy/vibes/euroscipy-picker
npx vibes-diy pull calendar/euroscipy-picker
```

**Warning:** `pull` currently writes the compiled/transpiled JS, not raw JSX (see issue #2056). Use the source in this directory as the authoritative copy and don't overwrite it with a pull unless you manually verify the output is clean JSX.

## Architecture notes

- **Database**: Fireproof `"euroscipy2026"` — data lives in the browser, syncs across users via the vibes.diy data plane. Read access is scoped by `access.js` channels (below), so a client only syncs what it can read.
- **Auth**: `useViewer()` from `use-vibes`. `can(...)` gates write surfaces. Anonymous users favorite locally (migrated on sign-in); notes/shifts/friends need sign-in.
- **Channels** (`access.js` — same design as the pickathon-picker vibe):
  - **Favorites** (`type: "favorite"`, keyed `favorite-{userId}-{eventId}`) → the owner's **`share-{userId}`** channel _and_ the global **`super`** firehose. The owner reads their own via `share-`; friends read them because a **friend edge grants read of each other's `share-` channel**. Nobody is granted `super` — it exists only to be unlocked by a `grant` doc (see below). This is deliberately NOT world-readable: it's what keeps every client from syncing every user's favorites at scale.
  - **Notes** (`note-{userId}-{eventId}`) → private **`user-{userId}`** channel. Never shared.
  - **Shifts** → `share-{userId}` if `shareWithFriends`, else private `user-{userId}`. So a friend can see your shared extras (via the friend grant) but not your private ones.
  - **Friend edge** (`friend-{owner}-{slug}`) → lives in both `user-` channels (for following/followers lists) and cross-grants each person read of the other's `share-` channel.
- **Super mode** — URL easter egg (`?super=1`). Shows `★ N` global pick counts and a peer picker. To see global data you must both (a) open with `?super=1` **and** (b) hold a `super` grant (below) — otherwise the client only has its own + friends' favorites and the counts are friend-scoped.
- **Tracks** — the feed's thematic grouping (a talk belongs to exactly one track). The Tracks tab groups talks by track; each track gets a deterministic color from `TRACK_COLORS` (hash of the track name, `festival-utils.js`). The yellow entry (`#FFD43B`) always carries dark tag text — white on it fails contrast.

## Granting super access

The `super` channel (every user's favorites) is unreadable by default. To let a specific
account read it — e.g. to see true global pick counts — write a **`grant` doc**. Only the
**vibe owner** may write one: `access.js` gates it on the reserved `user.isOwner` flag, so
whoever owns this deployment (you, writing via the CLI while signed in) is authorized
automatically — no handle list to maintain.

```bash
# Grant <handle> read access to the whole "super" favorites firehose:
npx vibes-diy db put --vibe calendar/euroscipy-picker --db euroscipy2026 \
  '{"type":"grant","grantTo":"<handle>"}'
```

The grant takes effect on the grantee's next sync. There's intentionally no UI for this.
(To revoke, `db del` the grant doc by its `_id` — the grantee loses `super` on re-sync.)

## Calendar export & subscription (.ics)

The "My Faves" schedule tab offers subscription links, served by `backend.js`:

- **POST /\_api/faves.ics** — one-shot: a client POSTs its faves + extras and
  downloads the returned `text/calendar` attachment (`euroscipy2026-faves.ics`).
  Works for anonymous (local-only) faves too, since the client sends the data.
- **🔁 Subscribe on iPhone** — persistent: a `webcal://…/_api/faves.ics?t=<token>&n=<handle>`
  link (Copy link gives the https form for Google Calendar). The token is a
  per-user random **capability**, auto-minted client-side when the My Faves tab
  opens (opt-in: no visit → no token → no ics aggregate; `n` is a display-only
  label because iOS captures the calendar name at subscribe time). Unguessable
  and revocable: delete the user's `caltoken` doc and the feed drains. Still a
  **live feed**: new picks flow to subscribers automatically, sharing the link
  lets a friend follow your faves, and talk times are re-joined against the live
  pretalx schedule export (platform egress) on every refresh.

Architecture constraint that shapes all of this: calendar clients refresh with
**anonymous GETs**, and `ctx.db.query` denies anonymous callers outright — and
denies access-fn-bound dbs on the `fetch` lane regardless (#3085). Only the
`scheduled` lane (owner, admin mode) can read the `euroscipy2026` db. So
`backend.js` runs a **1-minute aggregation tick**: handle → {favorite eventIds,
shareWithFriends shifts} into module-level isolate state, and the GET serves from
that cache. All three handlers share one isolate per vibe. After an isolate
eviction the cache is empty until the next tick (≤1m); the GET then serves the
**anchor-only calendar** (a hard-coded "EuroSciPy 2026" opening event rides in
every response, so the feed is never empty and adding a subscription always
validates). A transient schedule-feed failure still 502s so established
subscribers keep previously-synced events.

Consequences to keep in mind:

- **Freshness:** a new favorite reaches subscription refreshes within ~5 minutes
  (plus the client's own refresh cadence and the 5-minute shared cache).
- **Cold-window tradeoff (owner call)**: iOS validates the URL at add time, and a
  cold-cache error there reads as "Validation failed" — so cold serves the valid
  anchor-only calendar instead. The flip side: an existing subscriber whose
  refresh lands in the ≤1m post-deploy/post-eviction window sees anchor-only
  until their next refresh. Rare, self-healing, and subscribe-always-works wins.
- **Privacy:** a feed is reachable only through its random token — nothing is
  exposed to handle-guessing, and users without a token have no aggregate at
  all. Notes never leave the db; shifts are included only when
  `shareWithFriends`.
- **Scale:** `ctx.db.query` caps at 2000 docs per read. If the db ever
  approaches 2000 docs, the aggregate silently truncates (the cache records
  `truncated: true`) and this design needs revisiting.

Remember `backend.js` runs **alone** in its isolate — no relative imports — so its
timezone helpers are deliberately duplicated from `festival-utils.js`. Its own
`fetch()` egress calls must use `globalThis.fetch` (bare `fetch` resolves to the
exported handler). Tests: `backend.test.js` (formatter, aggregation, both lanes)
and `schedule.test.js` (feed flattening + day/track mapping).

## Schedule data

Fetched from `https://pretalx.com/euroscipy-2026/schedule/export/schedule.json`
(pretalx/frab JSON export, CORS `*`, fetched client-side) and cached in
`localStorage` for 10 minutes. The shape is
`schedule.conference.days[] → rooms{roomName: [event]}`; `flattenPretalx()` in
`festival-utils.js` turns it into the flat internal event list (guid-keyed;
a missing ISO `end` is derived from `duration`). All times stored/displayed in
`Europe/Warsaw` (the feed's `time_zone_name` is the legacy alias "Poland" —
we use the canonical IANA name). Conference days run Saturday 2026-07-18 through
Thursday 2026-07-23 with a 4 AM cutoff, matching the feed's own day windows.

## Common edits

| Task                    | Where                                                                                                           |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| Change conference dates | `FESTIVAL_2026.dates` (`festival-utils.js`) + `FESTIVAL_DATES` (`backend.js`)                                   |
| Change track colors     | `TRACK_COLORS` in `festival-utils.js` (keep the yellow → dark-text rule in `trackLineup`)                       |
| Add a new view/tab      | Add to the `["now", "browse", "tracks", …]` array in nav, add `{view === "newview" && ...}` section in the body |
| Change colors           | the `c` object in `styles.js`                                                                                   |
| Change schedule feed    | fetch URL in `App.jsx` (`fetchSchedule`) + `SCHEDULE_URL` in `backend.js`                                       |
