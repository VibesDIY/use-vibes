# Oregon Country Fair 2026 Picker — Update Runbook

Live URL: https://vibes.diy/vibe/calendar/ocf-picker
Super mode (once live): https://vibes.diy/vibe/calendar/ocf-picker?super=1

## Edit → Push

```bash
cd use-vibes/examples/ocf-picker
# edit App.jsx
npx vibes-diy push --vibe calendar/ocf-picker
```

That's it. `push` deploys the app to `calendar/ocf-picker` and prints the live URL.

## Pull current live version

```bash
cd use-vibes/examples/ocf-picker
npx vibes-diy pull calendar/ocf-picker
```

**Warning:** `pull` currently writes the compiled/transpiled JS, not raw JSX (see issue #2056). Use the source in this directory as the authoritative copy and don't overwrite it with a pull unless you manually verify the output is clean JSX.

## Architecture notes

- **Database**: Fireproof `"ocf2026"` — data lives in the browser, syncs across users via the vibes.diy data plane. Read access is scoped by `access.js` channels (below), so a client only syncs what it can read.
- **Auth**: `useViewer()` from `use-vibes`. `can(...)` gates write surfaces. Anonymous users favorite locally (migrated on sign-in); notes/shifts/friends need sign-in.
- **Channels** (`access.js` — same design as the pickathon-picker original):
  - **Favorites** (`type: "favorite"`, keyed `favorite-{userId}-{eventId}`) → the owner's **`share-{userId}`** channel _and_ the global **`super`** firehose. The owner reads their own via `share-`; followers read them via the platform follow graph (**`audience: { followersOf }`**, see § Social migration). Nobody is granted `super` — it exists only to be unlocked by a `grant` doc (see below). This is deliberately NOT world-readable: it's what keeps every client from syncing every user's favorites at scale.
  - **Notes** (`note-{userId}-{eventId}`) → private **`user-{userId}`** channel. Never shared.
  - **Shifts** → `share-{userId}` if `shareWithFriends`, else private `user-{userId}`. So a friend can see your shared extras (via the friend grant) but not your private ones.
  - **Follow graph (PLATFORM)** — who-sees-whose-picks moved out of this db entirely (vibes.diy#3421): edges, privacy, and blocks live in the platform (Settings → Social), read/mutated in-app via `useSocial()`. Favorites and shared extras carry `audience: { followersOf: <owner> }` on their access-fn result, resolved at READ TIME against the live graph — a new follower instantly sees history, unfollow/removeFollower/block instantly revokes. The owner is always in their own audience, so no self-grant is needed.
  - **Schedule-snapshot chunks** (`schedule-snapshot-{seq}`) → owner-only writes into an unreadable `snapshot-internal` channel (the backend's fallback data path must not be poisonable by ordinary signed-in users; the scheduled lane reads unfiltered anyway).
- **Artists view** — the "bands" analog: sets grouped by artist title (OCF artists play multiple sets across days and stages), sectioned by genre in the fixed genre palette.
- **Super mode** — URL easter egg (`?super=1`). Shows `★ N` global pick counts and a peer picker. To see global data you must both (a) open with `?super=1` **and** (b) hold a `super` grant (below) — otherwise the client only has its own + friends' favorites and the counts are friend-scoped.

## Granting super access

The `super` channel (every user's favorites) is unreadable by default. To let a specific
account read it — e.g. to see true global pick counts — write a **`grant` doc**. Only the
**vibe owner** may write one: `access.js` gates it on the reserved `user.isOwner` flag, so
whoever owns this deployment (writing via the CLI while signed in) is authorized
automatically — no handle list to maintain.

```bash
# Grant <handle> read access to the whole "super" favorites firehose:
npx vibes-diy db put --vibe calendar/ocf-picker --db ocf2026 \
  '{"type":"grant","grantTo":"<handle>"}'
```

The grant takes effect on the grantee's next sync. There's intentionally no UI for this.
(To revoke, `db del` the grant doc by its `_id` — the grantee loses `super` on re-sync.)

## Schedule data (the HTML-parse proxy + snapshot)

Upstream: `https://www.oregoncountryfair.org/the-event/the-lineup/` — the
server-rendered lineup PAGE (~730 KB of HTML; 444 sessions across Jul 10–12 at
last check). **There is no JSON with times** — the WP REST session CPT lacks
schedule times (verified), so the page markup is the only source. Times are
naive fair-local; all display is `America/Los_Angeles`, with a **4 AM night
cutoff** (an after-midnight set lives under the prior fair day).

**The page ships no CORS header, so the browser can never fetch it directly.**
The client instead fetches the same-origin **`GET /_api/schedule.json`**, which
`backend.js` serves as **PARSED JSON** (the session array, not HTML):

- Module-level cache `{ at, body }` of the parsed JSON text, **10-minute TTL**
  (one fetch + one parse per TTL).
- Cache miss → `globalThis.fetch` the page (`accept: text/html`), run
  `parseLineupHtml`, store the JSON, serve `content-type: application/json` +
  `cache-control: public, max-age=300`. A fetch that parses to **zero sessions
  counts as a failure** (a markup change must fall through, not blank the app).
- Upstream failure → **db snapshot** (below), else stale cache; nothing at all
  → 502 with the underlying error in the body.
- The subscription lane's schedule join (`fetchScheduleItems`) reads through the
  **same cache** — one upstream fetch serves both lanes.

### The parser

`parseLineupHtml` lives in `festival-utils.js`, is **duplicated inline in
`backend.js`** (the isolate can't import), and is **imported** by
the vibes.diy repo's `scripts/vibe-ops/refresh-ocf-schedule.mjs` (scripts can). One `<div class='session …'>` per
set; class tokens = ISO date + zero or more `cat-<genre>` tokens + stage slug.
Live markup variants it handles: sloppy meridiems (`"12:00 - 12:50PM"`,
`"1:15 - 2:00PM"` — the start inherits the end's meridiem, stepping back 12h if
that lands it after the end), tabs inside time text, entity-encoded titles
(`&amp;`, `&#039;` — decoded DOM-free so the same code runs everywhere),
multi-genre rows (`cat-dance cat-movement cat-music`), and genre-less
StewardShip rows (label "Event", default color). **eventId is synthetic**
(`date|startHHMM|stageSlug|titleSlug`) because the markup has no ids — it's
deterministic across refreshes so favorites survive re-fetches; renaming a set
or moving its start time DOES re-key it (an orphaned favorite simply stops
matching). Genre colors are fixed in `GENRE_COLORS` (the page ships no palette).

### The db snapshot (fallback)

If the site ever blocks the worker egress or shifts its markup under the
parser, the schedule flows through the db instead:

- the vibes.diy repo's `scripts/vibe-ops/refresh-ocf-schedule.mjs` runs where the upstream is reachable (agent
  container, laptop, CI), runs the SAME parser, and writes the **parsed JSON**
  into the `ocf2026` db as `schedule-snapshot` chunk docs
  (`seq`/`total`/`fetchedAt`/`body`, ≤100 KB per chunk). It refuses to write a
  zero-session parse (don't overwrite a good snapshot with a regression), pipes
  doc JSON via stdin (`db put -`, no argv limit), sweeps a 40-seq tail of stale
  chunks, and — because owner enforcement is HANDLE-based — flips the account's
  default handle to `calendar` for the writes and **always restores it in
  `finally`**.
- The backend's 1-minute scheduled tick assembles a **complete** chunk set (all
  `total` present, single `fetchedAt`, canonical `schedule-snapshot-<seq>` ids —
  a torn refresh or a stray doc is ignored) into module state; the proxy serves
  it whenever the live path fails.
- Run it manually any time:
  `node scripts/vibe-ops/refresh-ocf-schedule.mjs (vibes.diy repo)` (needs the owner-account
  CLI login). Worth a run right after deploy so the fallback is primed.

On top of that the client keeps its own `localStorage` copy for 10 minutes
(`ocf2026-schedule-cache`).

## Calendar export & subscription (.ics)

The "My Fair Schedule" tab offers two things, both served by `backend.js`:

- **📅 Download .ics** — one-shot: the client POSTs its faves + extras to
  `POST /_api/faves.ics` and downloads the returned `text/calendar` attachment
  (`ocf2026-faves.ics`). Works for anonymous (local-only) faves too, since the
  client sends the data.
- **🔁 Subscribe on iPhone** — persistent: a `webcal://…/_api/faves.ics?t=<token>&n=<handle>`
  link (Copy link gives the https form for Google Calendar). The token is a
  per-user random **capability**, auto-minted client-side when the My Faves tab
  opens (opt-in: no visit → no token → no ics aggregate; `n` is a display-only
  label because iOS captures the calendar name at subscribe time). Unguessable and
  revocable: delete the user's `caltoken` doc and the feed drains. Still a
  **live feed**: new picks flow to subscribers automatically, sharing the link
  lets a friend follow your faves, and set times are re-joined against the
  parsed schedule (through the shared 10-minute cache) on every refresh.

Architecture constraint that shapes all of this: calendar clients refresh with
**anonymous GETs**, and `ctx.db.query` denies anonymous callers outright — and
denies access-fn-bound dbs on the `fetch` lane regardless (#3085). Only the
`scheduled` lane (owner, admin mode) can read the `ocf2026` db. So `backend.js`
runs a **1-minute aggregation tick**: handle → {favorite eventIds, shareWithFriends
shifts} into module-level isolate state, and the GET serves from that cache. All
three handlers share one isolate per vibe. After an isolate eviction the cache is
empty until the next tick (≤1m); the GET then serves the **anchor-only calendar**
(a hard-coded "Oregon Country Fair" event rides in every response, so the feed is
never empty and adding a subscription always validates). A transient schedule
failure still 502s so established subscribers keep previously-synced events.

Consequences to keep in mind:

- **Freshness:** a new favorite reaches subscription refreshes within ~5 minutes
  (plus the client's own refresh cadence and the 5-minute shared cache); set
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
timezone helpers and the lineup parser are deliberately duplicated from
`festival-utils.js`. Its egress calls must use `globalThis.fetch` (bare `fetch`
resolves to the exported handler). Tests: `backend.test.js` (formatter,
aggregation, parse proxy, snapshot fallback, both ics lanes) and
`schedule.test.js` (the parser + day mapping).

## Common edits

| Task                | Where                                                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Change fair dates   | `FESTIVAL_2026.dates` (festival-utils.js) **and** `FESTIVAL_DATES` (backend.js)                                         |
| Change the page URL | `SCHEDULE_URL` in backend.js + `UPSTREAM` in scripts/refresh-schedule.mjs (the client always hits /\_api/schedule.json) |
| Markup shifts       | `parseLineupHtml` in festival-utils.js **and its inline duplicate in backend.js**; re-run the refresher after fixing    |
| Genre colors        | `GENRE_COLORS` in festival-utils.js **and** backend.js (kept in sync)                                                   |
| Add a new view/tab  | Add to the `["now", "browse", "artists", …]` array in nav, add `{view === "newview" && ...}` section in the body        |
| Change colors       | `c` object in `styles.js` (cream/terracotta/teal/bronze; every surface keeps a `dark:` variant)                         |
| Proxy cache TTL     | `SCHEDULE_TTL_MS` in backend.js (client copy: the `600_000` in App.jsx's `getCached`)                                   |

## Social migration (2026-07: friend docs → platform follow graph)

This app used to store `type:"friend"` edge docs and cross-grant `share-` channel
reads from them. That graph now lives in the PLATFORM (vibes.diy#3421):

- The app reads/mutates edges with `useSocial()` (`following`/`followers`/`requests`
  - `follow`/`unfollow`/`approve`/`removeFollower`); access.js labels follower-visible
    docs with `audience: { followersOf: <owner> }` instead of granting per-edge.
- **Legacy `type:"friend"` docs remain in the db but are inert** — they fall to the
  unknown-type discard branch (kept, unreadable). Do not delete them casually, and
  NEVER re-run the one-shot import (`vibes.diy` repo:
  `vibes-diy/cli/social-import-friend-edges.oneoff.mts`) — it ran once at cutover to
  convert the edges to bidirectional platform follows; a post-cutover re-run could
  resurrect deliberately removed edges (no-resurrection residual, see the import spec
  in vibes.diy `docs/superpowers/specs/2026-07-09-friend-doc-import-and-prompt-landing.md`).
- Semantics changed with the model: visibility is now FOLLOW-DIRECTION (I see the
  picks of people I follow), not mutual-edge; a private account's inbound follows sit
  `requested` until approved. Copy discipline everywhere: "following"/"followers",
  never "friends".
