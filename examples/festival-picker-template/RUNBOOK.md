# Festival Picker — Template Runbook

A per-festival schedule app: browse the lineup, favorite sets, add your own extras,
see what the people you follow are going to, and export or subscribe to the result as
a calendar. This directory is the **template**; a festival is an instantiation of it.

## Instantiate a festival

1. **Copy this directory** to a new one named for the festival.
2. **Replace `festival-config.js`.** It is the single substitution surface: `FESTIVAL`
   (name, slug, dbName, year, tz, location, dates, stages, tier, logoUrl, sourceUrls,
   and the five skin colors) plus `SCHEDULE` (one entry per set: id, band, day, start,
   end, stage, url). Everything the client renders — the skin, the database name, the
   date headers, the lineup itself — is derived from this file. `festival-config.test.js`
   validates the shape; run it after editing.
3. **Update the backend snapshot.** `backend.js` runs alone in its isolate (no relative
   imports), so it carries its own copy of the schedule between the `SCHEDULE SNAPSHOT`
   marker comments. Paste the same data there so the calendar feed matches the app.
4. **Push it** — see "Ship it" below.

Schedule times are **naive local strings** (`2026-07-30T18:00:00`) interpreted in the
config's `tz`. Never append a `Z` or an offset.

## Ship it

```bash
cd <your-festival-directory>
npx vibes-diy push
```

`push` deploys to `og/<slug>` and prints the live URL — the push _is_ the release.
Super mode: append `?super=true` to the live URL.

## Pull current live version

```bash
npx vibes-diy pull og/<slug>
```

**Warning:** `pull` currently writes the compiled/transpiled JS, not raw JSX (see issue #2056). Use the source in this directory as the authoritative copy and don't overwrite it with a pull unless you manually verify the output is clean JSX.

## Architecture notes

- **Database**: Fireproof, named by `FESTIVAL.dbName` — data lives in the browser, syncs across users via the vibes.diy data plane. Read access is scoped by `access.js` channels (below), so a client only syncs what it can read.
- **Auth**: `useViewer()` from `use-vibes`. `can(...)` gates write surfaces. Anonymous users favorite locally (migrated on sign-in); notes/shifts/follows need sign-in.
- **Channels** (`access.js`):
  - **Favorites** (`type: "favorite"`, keyed `favorite-{userId}-{eventId}`) → the owner's **`share-{userId}`** channel _and_ the global **`super`** firehose. The owner reads their own via `share-`; followers read them via the platform follow graph (**`audience: { followersOf }`**, see § Social migration). Nobody is granted `super` — it exists only to be unlocked by a `grant` doc (see below). This is deliberately NOT world-readable: it's what keeps every client from syncing every user's favorites at scale.
  - **Notes** (`note-{userId}-{eventId}`) → private **`user-{userId}`** channel. Never shared.
  - **Shifts** → `share-{userId}` if `shareWithFriends`, else private `user-{userId}`. So your followers can see your shared shifts but not your private ones.
  - **Follow graph (PLATFORM)** — who-sees-whose-picks moved out of this db entirely (vibes.diy#3421): edges, privacy, and blocks live in the platform (Settings → Social), read/mutated in-app via `useSocial()`. Favorites and shared extras carry `audience: { followersOf: <owner> }` on their access-fn result, resolved at READ TIME against the live graph — a new follower instantly sees history, unfollow/removeFollower/block instantly revokes. The owner is always in their own audience, so no self-grant is needed.
- **Super mode** — URL easter egg (`?super=1` / `?super=true`). Shows `★ N` global pick counts and a peer picker. To see global data you must both (a) open with `?super=1` **and** (b) hold a `super` grant (below) — otherwise the client only has its own + followed handles' favorites and the counts are follow-scoped.

## Granting super access

The `super` channel (every user's favorites) is unreadable by default. To let a specific
account read it — e.g. to see true global pick counts — write a **`grant` doc**. Only the
**vibe owner** may write one: `access.js` gates it on the reserved `user.isOwner` flag, so
whoever owns this deployment (you, writing via the CLI while signed in) is authorized
automatically — no handle list to maintain.

```bash
# Grant <handle> read access to the whole "super" favorites firehose:
npx vibes-diy db put --vibe og/<slug> --db <dbName> \
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
  lets someone follow your faves, and set times are re-joined against the
  backend's own schedule snapshot on every refresh.

Architecture constraint that shapes all of this: calendar clients refresh with
**anonymous GETs**, and `ctx.db.query` denies anonymous callers outright — and
denies access-fn-bound dbs on the `fetch` lane regardless (#3085). Only the
`scheduled` lane (owner, admin mode) can read the festival db. So `backend.js`
runs a **1-minute aggregation tick**: handle → {favorite eventIds, shareWithFriends
shifts} into module-level isolate state, and the GET serves from that cache. All
three handlers share one isolate per vibe. After an isolate eviction the cache is
empty until the next tick (≤1m); the GET then serves the **anchor-only calendar**
(a hard-coded "<festival> begins today" event rides in every response, so the feed is never
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

**Static.** `SCHEDULE` in `festival-config.js` is a module constant, so the lineup is on
screen at first paint — no feed fetch, no cache, no loading state. `festival-utils.js`
serves it via `getSchedule()`; `backend.js` keeps its own copy under the
`SCHEDULE SNAPSHOT` marker (it runs alone in its isolate and can't import). Refreshing
the lineup means editing both and pushing. All times are naive strings in `FESTIVAL.tz`.

`FESTIVAL.tier` declares how complete the data is: `full` (every set has a day, start,
end, and stage) or `lineup` (bands only, times not announced yet).

The tier drives the nav. `visibleTabs(tier)` in `festival-utils.js` names the canonical
tabs a tier supports — `browse`/`favorites`/`shifts`/`schedule`/`friends` on `full`,
`browse`/`favorites`/`friends` on `lineup` — and `App.jsx` maps its extra tabs onto
those through `TAB_TIER_KEY` (`bands` rides with `browse`; `now` needs set times, so it
rides with `schedule`). Follows survive every tier on purpose: following someone shows
their FAVORITES, which exist whether or not times have been announced, and that sharing
loop is the point of the app — undated picks render as one group with no day header.
On a `lineup`-tier festival the time-based views
and every `.ics` download/subscribe control are hidden, the flat Favorites list becomes
the way to see your own picks, and cards render band + link with no empty time chips.
Re-pushing with `tier: "full"` once times are announced turns the rest back on.

## Common edits

| Task                                   | Where                                                                                                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Change festival name/dates/location/tz | `FESTIVAL` in `festival-config.js`                                                                                                                                  |
| Change the lineup or set times         | `SCHEDULE` in `festival-config.js` **and** the `SCHEDULE SNAPSHOT` block in `backend.js`                                                                            |
| Change the logo                        | `FESTIVAL.logoUrl` (empty string hides it)                                                                                                                          |
| Change colors                          | `FESTIVAL.colors` — the five base colors; `makeC()` in `styles.js` derives every surface and dark-mode variant from them                                            |
| Add a new view/tab                     | Add it to `TAB_TIER_KEY` and the `NAV_TABS` list in `App.jsx` (naming the canonical tab whose data it needs), add `{view === "newview" && ...}` section in the body |

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
