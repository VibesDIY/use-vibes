# DEF CON 34 Picker — Update Runbook

Live URL: https://vibes.diy/vibe/calendar/defcon-picker
Super mode (once live): https://vibes.diy/vibe/calendar/defcon-picker?super=1

## Edit → Push

```bash
cd vibes.diy/vibes/defcon-picker
# edit App.jsx
npx vibes-diy push --vibe calendar/defcon-picker
```

That's it. `push` deploys the app to `calendar/defcon-picker` and prints the live URL.

## Pull current live version

```bash
cd vibes.diy/vibes/defcon-picker
npx vibes-diy pull calendar/defcon-picker
```

**Warning:** `pull` currently writes the compiled/transpiled JS, not raw JSX (see issue #2056). Use the source in this directory as the authoritative copy and don't overwrite it with a pull unless you manually verify the output is clean JSX.

## Architecture notes

- **Database**: Fireproof `"defcon34"` — data lives in the browser, syncs across users via the vibes.diy data plane. Read access is scoped by `access.js` channels (below), so a client only syncs what it can read.
- **Auth**: `useViewer()` from `use-vibes`. `can(...)` gates write surfaces. Anonymous users favorite locally (migrated on sign-in); notes/shifts/friends need sign-in.
- **Channels** (`access.js` — same design as the pickathon-picker original):
  - **Favorites** (`type: "favorite"`, keyed `favorite-{userId}-{eventId}`) → the owner's **`share-{userId}`** channel _and_ the global **`super`** firehose. The owner reads their own via `share-`; friends read them because a **friend edge grants read of each other's `share-` channel**. Nobody is granted `super` — it exists only to be unlocked by a `grant` doc (see below). This is deliberately NOT world-readable: it's what keeps every client from syncing every user's favorites at scale.
  - **Notes** (`note-{userId}-{eventId}`) → private **`user-{userId}`** channel. Never shared.
  - **Shifts** → `share-{userId}` if `shareWithFriends`, else private `user-{userId}`. So a friend can see your shared extras (via the friend grant) but not your private ones.
  - **Friend edge** (`friend-{owner}-{slug}`) → lives in both `user-` channels (for following/followers lists) and cross-grants each person read of the other's `share-` channel.
- **Tracks view** — the "bands" analog: sessions grouped by their track (the feed's `tags[0].label` — Workshop, Demo Labs, Party, …), rendered in the feed's own per-track colors.
- **Super mode** — URL easter egg (`?super=1`). Shows `★ N` global pick counts and a peer picker. To see global data you must both (a) open with `?super=1` **and** (b) hold a `super` grant (below) — otherwise the client only has its own + friends' favorites and the counts are friend-scoped.

## Granting super access

The `super` channel (every user's favorites) is unreadable by default. To let a specific
account read it — e.g. to see true global pick counts — write a **`grant` doc**. Only the
**vibe owner** may write one: `access.js` gates it on the reserved `user.isOwner` flag, so
whoever owns this deployment (writing via the CLI while signed in) is authorized
automatically — no handle list to maintain.

```bash
# Grant <handle> read access to the whole "super" favorites firehose:
npx vibes-diy db put --vibe calendar/defcon-picker --db defcon34 \
  '{"type":"grant","grantTo":"<handle>"}'
```

The grant takes effect on the grantee's next sync. There's intentionally no UI for this.
(To revoke, `db del` the grant doc by its `_id` — the grantee loses `super` on re-sync.)

## Schedule data (and the proxy route)

Upstream feed: `https://info.defcon.org/ht/defcon34/views/scheduleDays.json` — a
top-level array of `{ day, sessions }` (Aug 5–9, ~187 sessions and growing; the
manifest rebuilds daily as content lands). Times are UTC ISO stamps; all display is
`America/Los_Angeles`, with a **4 AM night cutoff** (a 1 AM Saturday party lives
under Friday — DEF CON parties run late).

**The upstream is CORS-locked to info.defcon.org, so the browser can never fetch it
directly.** The client instead fetches the same-origin **`GET /_api/schedule.json`**,
which `backend.js` proxies:

- Module-level cache `{ at, body }` of the raw JSON text, **10-minute TTL**.
- Cache miss → `globalThis.fetch` the upstream (`accept: application/json`), store
  the text, serve `content-type: application/json` + `cache-control: public, max-age=300`.
- Upstream failure → **db snapshot** (below), else stale cache; nothing at all → 502
  with the underlying error in the body.
- The subscription lane's schedule join (`fetchScheduleItems`) reads through the
  **same cache** — one upstream fetch serves both lanes.

### The db snapshot (the real data path in production)

**info.defcon.org also 403s the worker platform's egress** (IP/ASN-level; browser
headers don't help — verified 2026-07-08), so in production the upstream branch
always fails and the schedule actually flows through the db:

- `scripts/refresh-schedule.mjs` runs where the upstream IS reachable (agent
  container, laptop, CI), slims the feed to the fields the app reads (461 KB →
  ~108 KB), and writes it into the `defcon34` db as `schedule-snapshot` chunk docs
  (`seq`/`total`/`fetchedAt`/`body`, ≤100 KB per chunk — argv-size bound). Unknown
  doc types land in `access.js`'s unreadable discard channel, so the chunks are
  owner-writable and client-invisible.
- The backend's 1-minute scheduled tick assembles a **complete** chunk set (all
  `total` present, single `fetchedAt` — a torn refresh is ignored) into module
  state; the proxy serves it whenever the upstream fails.
- A **daily Routine** (cloud session cron, "Refresh DEF CON 34 schedule snapshot")
  re-runs the refresher; bump the cadence during con week. Run it manually any
  time: `node vibes/defcon-picker/scripts/refresh-schedule.mjs` (needs the
  owner-account CLI login).
- Freshness: refresher cadence + ≤1 m tick + ≤10 m client cache. If the upstream
  ever unblocks the worker egress, the proxy automatically prefers the live feed
  again.

On top of that the client keeps its own `localStorage` copy for 10 minutes
(`defcon34-schedule-cache`).

Flattening (`flattenSchedule` in `festival-utils.js`, duplicated inline in
`backend.js`): eventId = `String(id)`; start `beginIso || begin`; end
`endIso || end`, defaulting to start + 1h when missing/equal; venue
`locationName || "TBA"`; url = first http(s) `contentEntity.links[].url` (the links
array mixes real URLs with fediverse handles); lineup = the first tag's
label/colorBackground/colorForeground — **the feed ships the per-track palette; use
it, don't invent one**.

## Calendar export & subscription (.ics)

The "My Faves" schedule tab offers two things, both served by `backend.js`:

- **📅 Download .ics** — one-shot: the client POSTs its faves + extras to
  `POST /_api/faves.ics` and downloads the returned `text/calendar` attachment
  (`defcon34-faves.ics`). Works for anonymous (local-only) faves too, since the
  client sends the data.
- **🔁 Subscribe on iPhone** — persistent: a `webcal://…/_api/faves.ics?t=<token>&n=<handle>`
  link (Copy link gives the https form for Google Calendar). The token is a
  per-user random **capability**, auto-minted client-side when the My Faves tab
  opens (opt-in: no visit → no token → no ics aggregate; `n` is a display-only
  label because iOS captures the calendar name at subscribe time). Unguessable and
  revocable: delete the user's `caltoken` doc and the feed drains. Still a
  **live feed**: new picks flow to subscribers automatically, sharing the link
  lets a friend follow your faves, and session times are re-joined against the
  schedule feed (through the shared 10-minute cache) on every refresh.

Architecture constraint that shapes all of this: calendar clients refresh with
**anonymous GETs**, and `ctx.db.query` denies anonymous callers outright — and
denies access-fn-bound dbs on the `fetch` lane regardless (#3085). Only the
`scheduled` lane (owner, admin mode) can read the `defcon34` db. So `backend.js`
runs a **1-minute aggregation tick**: handle → {favorite eventIds, shareWithFriends
shifts} into module-level isolate state, and the GET serves from that cache. All
three handlers share one isolate per vibe. After an isolate eviction the cache is
empty until the next tick (≤1m); the GET then serves the **anchor-only calendar**
(a hard-coded "DEF CON 34" event rides in every response, so the feed is never
empty and adding a subscription always validates). A transient schedule-feed
failure still 502s so established subscribers keep previously-synced events.

Consequences to keep in mind:

- **Freshness:** a new favorite reaches subscription refreshes within ~5 minutes
  (plus the client's own refresh cadence and the 5-minute shared cache); session
  time changes ride the 10-minute schedule cache.
- **Cold-window tradeoff (owner call)**: iOS validates the URL at add time, and a
  cold-cache error there reads as "Validation failed" — so cold serves the valid
  anchor-only calendar instead. The flip side: an existing subscriber whose
  refresh lands in the ≤1m post-deploy/post-eviction window sees anchor-only
  until their next refresh. Rare, self-healing, and subscribe-always-works wins.
- **Privacy:** a feed is reachable only through its random token — nothing is
  exposed to handle-guessing, and users without a token have no aggregate at
  all. Notes never leave the db; shifts are included only when
  `shareWithFriends`.
- **Scale:** `ctx.db.query` caps at 2000 docs per read. If the db ever approaches
  2000, the aggregate silently truncates (the cache records `truncated: true`)
  and this design needs revisiting.

Remember `backend.js` runs **alone** in its isolate — no relative imports — so its
timezone helpers and the feed flattener are deliberately duplicated from
`festival-utils.js`. Its egress calls must use `globalThis.fetch` (bare `fetch`
resolves to the exported handler). Tests: `backend.test.js` (formatter,
aggregation, proxy route, both ics lanes) and `schedule.test.js` (feed flattening).

## Common edits

| Task                | Where                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| Change con dates    | `FESTIVAL_2026.dates` (festival-utils.js) **and** `FESTIVAL_DATES` (backend.js)                                 |
| Change the feed URL | `SCHEDULE_URL` in backend.js (the client always hits `/_api/schedule.json`)                                     |
| Add a new view/tab  | Add to the `["now", "browse", "tracks", …]` array in nav, add `{view === "newview" && ...}` section in the body |
| Change colors       | `c` object in `styles.js` (committed dark — keep neon for accents only, body text `#e8e8e8`)                    |
| Proxy cache TTL     | `SCHEDULE_TTL_MS` in backend.js (client copy: the `600_000` in App.jsx's `getCached`)                           |
