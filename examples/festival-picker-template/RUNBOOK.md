# Pickathon Picker — Update Runbook

Live URL: https://vibes.diy/vibe/og/pickathon-picker
Super mode: https://vibes.diy/vibe/og/pickathon-picker?super=true

## Edit → Push

```bash
cd /Users/jchris/code/fp/vibes.diy/vibes/pickathon-picker
# edit App.jsx
npx vibes-diy push
```

That's it. `push` deploys `App.jsx` to `og/pickathon-picker` and prints the live URL.

## Pull current live version

```bash
cd /Users/jchris/code/fp/vibes.diy/vibes/pickathon-picker
npx vibes-diy pull og/pickathon-picker
```

**Warning:** `pull` currently writes the compiled/transpiled JS, not raw JSX (see issue #2056). Use the source in this directory as the authoritative copy and don't overwrite it with a pull unless you manually verify the output is clean JSX.

## Architecture notes

- **Database**: Fireproof `"pickathon"` — data lives in the browser, syncs across users via the vibes.diy data plane. Read access is scoped by `access.js` channels (below), so a client only syncs what it can read.
- **Auth**: `useViewer()` from `use-vibes`. `can(...)` gates write surfaces. Anonymous users favorite locally (migrated on sign-in); notes/shifts/friends need sign-in.
- **Channels** (`access.js`):
  - **Favorites** (`type: "favorite"`, keyed `favorite-{userId}-{eventId}`) → the owner's **`share-{userId}`** channel _and_ the global **`super`** firehose. The owner reads their own via `share-`; followers read them via the platform follow graph (**`audience: { followersOf }`**, see § Social migration). Nobody is granted `super` — it exists only to be unlocked by a `grant` doc (see below). This is deliberately NOT world-readable: it's what keeps every client from syncing every user's favorites at scale.
  - **Notes** (`note-{userId}-{eventId}`) → private **`user-{userId}`** channel. Never shared.
  - **Shifts** → `share-{userId}` if `shareWithFriends`, else private `user-{userId}`. So a friend can see your shared shifts (via the friend grant) but not your private ones.
  - **Follow graph (PLATFORM)** — who-sees-whose-picks moved out of this db entirely (vibes.diy#3421): edges, privacy, and blocks live in the platform (Settings → Social), read/mutated in-app via `useSocial()`. Favorites and shared extras carry `audience: { followersOf: <owner> }` on their access-fn result, resolved at READ TIME against the live graph — a new follower instantly sees history, unfollow/removeFollower/block instantly revokes. The owner is always in their own audience, so no self-grant is needed.
- **Super mode** — URL easter egg (`?super=1` / `?super=true`). Shows `★ N` global pick counts and a peer picker. To see global data you must both (a) open with `?super=1` **and** (b) hold a `super` grant (below) — otherwise the client only has its own + friends' favorites and the counts are friend-scoped.

## Granting super access

The `super` channel (every user's favorites) is unreadable by default. To let a specific
account read it — e.g. to see true global pick counts — write a **`grant` doc**. Only the
**vibe owner** may write one: `access.js` gates it on the reserved `user.isOwner` flag, so
whoever owns this deployment (you, writing via the CLI while signed in) is authorized
automatically — no handle list to maintain.

```bash
# Grant <handle> read access to the whole "super" favorites firehose:
npx vibes-diy db put --vibe og/pickathon-picker --db pickathon \
  '{"type":"grant","grantTo":"<handle>"}'
```

The grant takes effect on the grantee's next sync. There's intentionally no UI for this.
(To revoke, `db del` the grant doc by its `_id` — the grantee loses `super` on re-sync.)

## Calendar export & subscription (.ics)

The "My Faves" schedule tab offers two things, both served by `backend.js`:

- **📅 Download .ics** — one-shot: the client POSTs its faves + extras to
  `POST /_api/faves.ics` and downloads the returned `text/calendar` attachment.
  Works for anonymous (local-only) faves too, since the client sends the data.
- **🔁 Subscribe on iPhone** — persistent: a `webcal://…/_api/faves.ics?t=<token>&n=<handle>`
  link (Copy link gives the https form for Google Calendar). The token is a
  per-user random **capability**, auto-minted client-side when the My Faves tab
  opens (opt-in: no visit → no token → no ics aggregate; `n` is a display-only
  label because iOS captures the calendar name at subscribe time). Unguessable —
  the earlier `?u=<handle>` form invited swapping in someone else's handle — and
  revocable: delete the user's `caltoken` doc and the feed drains. Still a
  **live feed**: new picks flow to subscribers automatically, sharing the link
  lets a friend follow your faves, and set times are re-joined against the live
  pickathon.com schedule feed (platform egress) on every refresh.

Architecture constraint that shapes all of this: calendar clients refresh with
**anonymous GETs**, and `ctx.db.query` denies anonymous callers outright — and
denies access-fn-bound dbs on the `fetch` lane regardless (#3085). Only the
`scheduled` lane (owner, admin mode) can read the `pickathon` db. So `backend.js`
runs a **1-minute aggregation tick**: handle → {favorite eventIds, shareWithFriends
shifts} into module-level isolate state, and the GET serves from that cache. All
three handlers share one isolate per vibe. After an isolate eviction the cache is
empty until the next tick (≤1m); the GET then serves the **anchor-only calendar**
(a hard-coded "Gates Open" event rides in every response, so the feed is never
empty and adding a subscription always validates). A transient schedule-feed
failure still 502s so established subscribers keep previously-synced events.

Consequences to keep in mind:

- **Freshness:** a new favorite reaches subscription refreshes within ~5 minutes
  (plus the client's own refresh cadence and the 5-minute shared cache).
- **Cold-window tradeoff (owner call)**: iOS validates the URL at add time, and a
  cold-cache 503 there read as "Validation failed" — so cold now serves the valid
  anchor-only calendar instead. The flip side: an existing subscriber whose
  refresh lands in the ≤1m post-deploy/post-eviction window sees anchor-only
  until their next refresh. Rare, self-healing, and subscribe-always-works wins.
- **Privacy:** a feed is reachable only through its random token — nothing is
  exposed to handle-guessing, and users without a token have no aggregate at
  all. Notes never leave the db; shifts are included only when
  `shareWithFriends`.
- **Scale:** `ctx.db.query` caps at 2000 docs per read. The live db is ~105 docs
  today; if it ever approaches 2000, the aggregate silently truncates (the cache
  records `truncated: true`) and this design needs revisiting.

Remember `backend.js` runs **alone** in its isolate — no relative imports — so its
timezone helpers are deliberately duplicated from `festival-utils.js`. Its own
`fetch()` egress calls must use `globalThis.fetch` (bare `fetch` resolves to the
exported handler). Tests: `backend.test.js` (formatter, aggregation, both lanes)
and `schedule.test.js` (item flattening).

## Schedule data

Fetched from `https://pickathon.com/wp-content/plugins/pickathon/schedule.php` and cached in `localStorage` for 10 minutes. All times stored/displayed in `America/Los_Angeles`.

## Common edits

| Task                  | Where                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Change festival dates | `FESTIVAL_2026.dates`                                                                                                          |
| Change logo           | `LOGO_URL` constant                                                                                                            |
| Add a new view/tab    | Add to the `["browse", "favorites", "shifts", "schedule"]` array in nav, add `{view === "newview" && ...}` section in the body |
| Change colors         | `c` object near bottom of component                                                                                            |

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
