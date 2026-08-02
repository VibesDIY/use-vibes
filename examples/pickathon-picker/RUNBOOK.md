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

## Source layout

`App.jsx`, `access.js` and `backend.js` are reserved names the platform loads by
convention; everything else is free. Decision logic lives in plain `.js` modules so it
can be tested without a browser — `App.jsx` is wiring (hooks, state, JSX), not rules.

| File                                   | Holds                                                                                     |
| -------------------------------------- | ----------------------------------------------------------------------------------------- |
| `App.jsx`                              | Hooks, state, nav, and the JSX shell. Delegates every non-trivial decision to the modules. |
| `url-state.js`                         | `#friend=` / `?friend=` deep links + `?super=1`. Every fn takes the window, so it's testable. |
| `schedule-build.js`                    | Docs → events (`day` derived at read time), day ordering, `buildDaySchedule`, shift bounds. |
| `picks.js`                             | Favorites/extras joined to the schedule for one handle or a unified audience.               |
| `social-logic.js`                      | Who can see what, which follow control to render, the empty-state copy matrix, arm path.    |
| `docs.js`                              | `_id` shapes (a contract with `access.js`/`backend.js`), sign-in migration, ics/token.       |
| `festival-utils.js`                    | Festival timezone/date math (the 4 AM night cutoff), constants.                             |
| `styles.js`                            | The `c` class bag + lineup card colors. Note Tailwind spacing here is px-scaled.            |
| `loadshed.js`                          | The load-shed level contract (`0-load-shed` doc → what's paused) + the banner copy.          |
| `*View.jsx`, `NoteField`, `icons`      | Presentational components; they take `c` and the data they render.                          |

Tests: `backend.test.js` / `access.test.js` / `schedule.test.js` cover the server side and
the time math; `url-state.test.js` / `schedule-build.test.js` / `picks.test.js` /
`social-logic.test.js` / `docs.test.js` / `loadshed.test.js` pin the app-side logic above
(deep-link round trips, the schedule merge/sort, audience joins, the six-arm
empty-message matrix, doc re-keying, the fail-open shed-level parse). `npx vitest run` from this directory runs all of them; they are pure — no
jsdom, no network.

`NowView.jsx` is currently not mounted by `App.jsx` (its "on now / up next" tab was
retired). It is kept intact rather than deleted — reinstating it is a product call.

## Architecture notes

- **Database**: Fireproof `"pickathon"` — data lives in the browser, syncs across users via the vibes.diy data plane. Read access is scoped by `access.js` channels (below), so a client only syncs what it can read.
- **Auth**: `useViewer()` from `use-vibes`. `can(...)` gates write surfaces. Anonymous users favorite locally (migrated on sign-in); notes/shifts/friends need sign-in.
- **Channels** (`access.js`):
  - **Favorites** (`type: "favorite"`, keyed `favorite-{userId}-{eventId}`) → the owner's **`share-{userId}`** channel _and_ the global **`super`** firehose. The owner reads their own via `share-`; followers read them via the platform follow graph (**`audience: { followersOf }`**, see § Social migration). Nobody is granted `super` — it exists only to be unlocked by a `grant` doc (see below). This is deliberately NOT world-readable: it's what keeps every client from syncing every user's favorites at scale.
  - **Notes** (`note-{userId}-{eventId}`) → private **`user-{userId}`** channel. Never shared.
  - **Shifts** → `share-{userId}` if `shareWithFriends`, else private `user-{userId}`. So a friend can see your shared shifts (via the friend grant) but not your private ones.
  - **Follow graph (PLATFORM)** — who-sees-whose-picks moved out of this db entirely (vibes.diy#3421): edges, privacy, and blocks live in the platform (Settings → Social), read/mutated in-app via `useSocial()`. Favorites and shared extras carry `audience: { followersOf: <owner> }` on their access-fn result, resolved at READ TIME against the live graph — a new follower instantly sees history, unfollow/removeFollower/block instantly revokes. The owner is always in their own audience, so no self-grant is needed.
- **Friend-connect link → profile page** — the QR/share URL is
  `https://vibes.diy/vibe/og/pickathon-picker#friend=<handle>` (**hash, not query, no trailing
  slash**): hash links stay on the warm SWR HTML-cache path (a query param bypasses it — every
  visit pays full SSR, ~2.5-3× slower — and the slash costs a 301), and the platform's
  url-state mirror (vibes.diy#4308, shipped 2026-07-27) forwards the host hash into the iframe
  (late — the app listens for `hashchange`, not just mount-time reads) and mirrors the app's
  `history.replaceState` back to the address bar. Opening the link **renders that handle's
  profile** (`ProfileView.jsx`) — it never follows anyone on the visitor's behalf. The profile
  works signed-out; the Follow button appears once signed in (`Follow` → `Requested` for a
  private account → `Following ✓`, tap to unfollow), and your own profile shows no button.
  Because the profile is ordinary shareable navigation state and not a one-time secret, the
  fragment **stays in the URL while the profile is open** and is removed via `replaceState`
  when it closes; a legacy `?friend=` QR opens the same profile and is normalized to the hash
  form. `?friend=` keeps working indefinitely as the fallback — old printed QR codes are slow,
  never broken.
  **QA iteration status (2026-07-27):** the profile page is being iterated on the QA copy
  `qa/pickathon-picker`, so `connectUrl` in `App.jsx` is hardcoded to that path behind a
  `// PROMOTE: revert to og/pickathon-picker` comment. Flip it back before shipping to `og`.
- **Super mode** — URL easter egg (`?super=1` / `?super=true`, hash form also accepted). Shows `★ N` global pick counts and a peer picker. To see global data you must both (a) open with `?super=1` **and** (b) hold a `super` grant (below) — otherwise the client only has its own + friends' favorites and the counts are friend-scoped.

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

## Load shedding (the festival-rush switch)

One owner-written doc turns the expensive, viewer-driven parts of the app off without a
redeploy. Flip it when the app is under real festival load; flip it back after.

```bash
# Pause writes (hearts, band heart, notes, extras) — schedule/browse/bands/now stay full:
npx vibes-diy db put --vibe og/pickathon-picker --db pickathon \
  '{"_id":"0-load-shed","type":"loadshed","level":"read-only"}'

# Also stop mounting the Friends tab + profile views (the per-viewer follower fan-out):
npx vibes-diy db put --vibe og/pickathon-picker --db pickathon \
  '{"_id":"0-load-shed","type":"loadshed","level":"schedule-only"}'

# Back to normal — PUT level "off", do not `db del` the doc (see below):
npx vibes-diy db put --vibe og/pickathon-picker --db pickathon \
  '{"_id":"0-load-shed","type":"loadshed","level":"off"}'
```

| level           | Schedule / Browse / Bands / Now | Favorite toggles, band heart, notes, extras | Friends tab + profiles | `.ics` subscription feed |
| --------------- | ------------------------------- | ------------------------------------------- | ---------------------- | ------------------------ |
| absent / `off` / anything unrecognized | full                            | full                                        | full                   | 200, normal              |
| `read-only`     | full                            | inert (visible, not clickable) + one banner line | full              | 503 + `Retry-After`      |
| `schedule-only` | full                            | inert + one banner line                     | one paused line, query not mounted | 503 + `Retry-After` |

Notes that cost time if you don't know them:

- **It fails open.** No doc, `level:"off"`, or any unrecognized level (a typo) is fully
  normal operation, everywhere — client and backend. Shedding is never the default.
- **Anonymous and signed-in behave identically.** `access.js` publishes the doc on the
  same world-readable `schedule` channel as the schedule itself, so every client
  (including anonymous, including offline replicas) sees the level. Write is
  **owner-only** — a stranger able to flip the app read-only would be a griefing vector.
- **`level:"off"` and `db del` both lift it.** The feed reads the doc **by id** on each
  request, so an absent doc is an authoritative "no shedding". (It was not always: the old
  capped whole-db read could not tell "deleted" from "sorted off the end", so deletion used
  to keep a warm isolate shedding. `level:"off"` is still the clearer flip.) A read that
  *fails* is still "don't know" → the isolate keeps the level it last saw.
- **The tick does not shed at all.** It no longer touches user data or scales with traffic
  (two keyed reads and, at most every 5 minutes, one feed fetch), so both its heartbeat and
  its schedule mirror keep running: liveness evidence must survive exactly the hours we are
  under load, and the schedule staying fresh is the reason to stay up.
- **The feed answers 503, not an empty calendar.** Calendar clients back off on a 503 and
  keep the events they already synced; an empty calendar would read as "your picks are
  gone".
- Client-side effect is immediate (it's a replicated doc); the backend follows on the very
  next feed request, since the switch is read per request rather than cached from a tick.
  (Measured on the pre-rewrite probe deploy 2026-07-29, when the backend followed a tick
  behind: `read-only` produced the 503 within 25s, `level:"off"` restored 200 within 50s.)
- **Run the `db put` as the handle that OWNS the app** (`og` for the live app). Measured:
  a CLI signed in under a different handle gets `Error: owner only` for this doc — and for
  the pre-existing `grant` doc too — and `--admin` does NOT bypass the access function
  (tried every flag combination). This is `access.js` working as intended; it just means
  the flip is an owner-identity operation, not a platform-admin one.

## Calendar export & subscription (.ics)

The "My Faves" schedule tab offers two things, both served by `backend.js`:

- **📅 Download .ics** — one-shot: the client POSTs its faves + extras to
  `POST /_api/faves.ics` and downloads the returned `text/calendar` attachment.
  Works for anonymous (local-only) faves too, since the client sends the data.
- **🔁 Subscribe on iPhone** — persistent: a `webcal://…/_api/faves.ics?t=<token>&n=<handle>`
  link (Copy link gives the https form for Google Calendar). The token is a
  per-user random **capability**, auto-minted client-side when the My Faves tab
  opens (opt-in: no visit → no token → no feed; `n` is a display-only label
  because iOS captures the calendar name at subscribe time — it also lets the
  backend resolve the token with one keyed read instead of a scan, but it is a
  hint only: the token in the doc must match the one presented). Unguessable —
  the earlier `?u=<handle>` form invited swapping in someone else's handle — and
  revocable: delete the user's `caltoken` doc and the feed drains. Still a
  **live feed**: new picks flow to subscribers automatically, sharing the link
  lets a friend follow your faves, and set times are re-joined against the live
  pickathon.com schedule feed (platform egress) on every refresh.

Architecture that shapes all of this: calendar clients refresh with **anonymous
GETs**, which the read gate denies by default — anonymous outright, and
access-fn-bound dbs on the `fetch` lane regardless (#3085). `backend.js` opts in
with `config.fetch.unfilteredReads = { dbs: ["pickathon"], why: … }` (#3650),
which lifts both denials **for this lane** and hands the authorization job to the
handler: the `t=` capability token is how it does it. The GET then does its own
**request-time keyed reads** — `ctx.db.get("caltoken-<n>")` (or a paged
`field:"token"` lookup when the `n=` hint is absent or wrong) → the owner's
favorites and shared shifts via one paged `field:"userId"` read → a live join
against the pickathon.com schedule. A hard-coded "Gates Open" anchor event rides
in every response, so the feed is never empty and adding a subscription always
validates; a transient schedule-feed failure still 502s so established
subscribers keep previously-synced events.

**Superseded (and why):** the GET used to serve from an in-isolate cache built by
a 1-minute `scheduled` tick that read the whole db, because that lane was the only
one allowed to read it. Two costs, both real in production: the host caps a scan
at **2000 docs sorted by `_id`**, silently, so once favorites pushed this db past
2000 every user sorting after the cut lost picks from their feed (~43% of them);
and a token minted seconds ago resolved to nothing until the next tick, which iOS
shows as "Validation failed" at subscribe time. Both are gone — the reads are
keyed, so they are correct at any db size and current to the second.

Consequences to keep in mind:

- **Freshness:** a new favorite reaches the next subscription refresh (plus the
  client's own refresh cadence and the 5-minute shared cache). No tick latency.
- **Every paged read loops on `next`, never on emptiness.** The host filters
  *after* cutting the page, so a full page can filter down to zero docs and still
  carry a cursor — stopping there would silently drop every doc behind it. Pinned
  by tests in `backend.test.js`.
- **Privacy:** a feed is reachable only through its random token — nothing is
  exposed to handle-guessing, and a user without a token has no feed at all.
  Notes are never read into a response; shifts are included only when
  `shareWithFriends`. Note that `unfilteredReads` is scoped per **lane**, not per
  route: everything inside `fetch` *could* read this db, so what leaves is
  decided by `backend.js` alone.
- **Cost:** one anonymous request costs a shed-switch get, a token lookup and a
  paged picks read, bounded by `MAX_PAGES`. The `n=` hint keeps the token lookup
  at one get for every URL the app itself generates.

Remember `backend.js` runs **alone** in its isolate — no relative imports — so its
timezone helpers are deliberately duplicated from `festival-utils.js`. Its own
`fetch()` egress calls must use `globalThis.fetch` (bare `fetch` resolves to the
exported handler). Tests: `backend.test.js` (formatter, both lanes, the keyed reads)
and `schedule.test.js` (item flattening).

## Schedule data (docs-first, offline-ready)

Rendered **docs-first** from one **server-maintained singleton cache**: the
`scheduled` lane in `backend.js` fetches
`https://pickathon.com/wp-content/plugins/pickathon/schedule.php` **every 5 minutes**
(`SCHEDULE_SYNC_INTERVAL_MS`, not every tick) and mirrors it into public
`scheduleitem` docs (one per event, `_id: schedule-event-{eventId}`), diffing so
only changed items are upserted. Those docs sit on the `schedule` channel under
`grant.public`, so they replicate to every client — anonymous included — and render
offline with no per-user keying and **no client-side feed fetch at all**. All times
stored/displayed in `America/Los_Angeles`.

**The mirror keeps its own state doc, and this is load-bearing.** `ctx.db.query`
is capped host-side at **2000 docs sorted by `_id`**, silently — no error, no
cursor. Once this db passed 2000 (favorites did it), `schedule-event-*` sorted
past the cut and the tick could no longer see a single one of its own mirror
docs: the diff read "nothing is mirrored" and re-put all ~330 events **every 60
seconds**, holding the vibe's Durable Object at 97% occupancy so every visitor's
first page load queued behind it. The fix is that the mirror no longer asks the
db what it mirrored — it remembers, in `_id: 0-schedule-sync-state` (`type:
schedulesync`, one content fingerprint per event), which it reads **by id**
(`ctx.db.get`): one keyed read, the same cost and the same correctness on a
20-doc db and a 200,000-doc one. Owner-only write in `access.js`: the tick trusts
it, so a forged one could freeze the schedule. An unchanged schedule costs **zero
writes**. (The digit-leading `_id` is a fossil of the era before keyed reads,
when it had to sort ahead of every id the app mints. It is harmless and renaming
it would strand the live doc, so it stays — but nothing reasons about sort order
any more.)

The fingerprints are ALSO held **in isolate memory** (`lastFingerprints`), because
"I could not read my state" must never be handled as "nothing is mirrored" — that
is the reading that reopens the rewrite loop, whatever the read mechanism. Losing
both the doc and the isolate's memory costs one burst, not one a minute.

> **Closed:** the `pickathon tick: db read hit the 2000-doc query cap` warning is
> gone with the whole-db read that produced it. The platform's keyed/paginated
> backend reads (`ctx.db.get`, `ctx.db.query` with `field`+`key`/`keys` and
> `limit`/`after`) landed, and both the tick and the `.ics` feed now use them —
> so no read in this app depends on the db being small.

> **Retired:** the per-user `schedulecache` write-through doc
> (`_id: schedule-cache-{userId}`) and the client-side background feed fetch. It
> stored the same public schedule once per user; at 10 copies × ~96 KB it was 74%
> of the db, and the whole-db `scheduled` query paid for it every minute. Its
> `access.js` branch is gone and legacy docs now fall through to `discard`
> (unreadable), same as retired `friend` docs. `localStorage` is likewise no longer
> a warm source.

**Offline cached view (platform PR #4000) support**: mount-time reads are stable
(same db, same index fns, same keys every boot) so the read mirror stays warm; all
`database.put/del` calls route through `safeDb`, which turns the offline frame's
write-refusal into a "couldn't save — offline copy" toast instead of a crash; the
remote header logo falls back to an inline placeholder when it can't load (the cached
frame's CSP blocks remote images). The follow QR is **generated locally** —
`<QrCode>` from `@vibes.diy/base` (inline SVG over the bundled zero-dep
`qrcode-generator`, on the vibe-pkg import-map allowlist), so it works offline, makes no
third-party call, and has no broken-image state to fall back from. It draws dark-on-white
by design (an inverted QR scans unreliably), so its container stays white in dark mode.

**First-load story**: the server SEEDS the `scheduleitem` docs (~330) into first paint, so
a first-time anonymous visitor gets the real schedule immediately — there is normally no
loading state at all. The "Downloading the schedule for offline access" takeover is
reserved for a session that has never held ANY events (a genuinely empty first visit). It
is keyed on zero LOADED events, never on zero filtered results — a search with no hits
keeps its own empty behaviour.

A cold replica's first snapshot can read EMPTY for a moment even so: that empty read is
treated as authoritative and reaps the seeded rows, and the initial pull then restores
them — which produced schedule → full-width takeover → schedule for anonymous
first-timers. The app no longer participates: `retainEvents` (`schedule-build.js`) holds
the last NON-EMPTY set for the session, so a transient zero-row read keeps the schedule on
screen and only a never-had-events session can reach the takeover. The platform-side hold
on seeded rows until initial sync settles is a separate fix in flight; this makes the app
immune either way. Alongside it, `useLiveQuery`'s `fromCache` (#4348 — true while rows come
from the local replica with no completed initial pull confirming them this session) drives
a quiet, non-blocking "updating…" line above the content; it is never a paint gate, and on
a runtime that predates the flag it is undefined and simply never shows.

## Schedule listing: time-slot groups

`ScheduleView` (My Faves, a followed handle's schedule, and the profile picks all render
through it) **and `BrowseView` (All Events)** prints each time ONCE, as a slot label on the green day background, with the
cards for that slot beneath it — a `<dl>` per day, `<dt>` label, `<dd>` cards. The
grouping rule lives in `groupByTimeSlot` (`schedule-build.js`, pinned by tests):
consecutive rows of the already-sorted day that start at the same instant form one group;
shifts group by the same rule as events. The label shows `start – end` when every member
of the slot shares the end, and only `start` when they don't — in that case each card
carries its own `until <time>` note, because printing one range over rows that disagree
would be a lie. Cards keep title/tag/heart, venue (its own line now), notes and pickedBy;
`GapStrip` is dormant (every call site passes `showGaps` false) but stays wired to the
slot boundaries. BrowseView uses the sibling `groupEventsByTimeSlot` (a plain event list,
no shifts) and groups the ALREADY-FILTERED day, so a search narrows the day and the labels
regroup with it — expected. `BandsView` is alphabetical by artist, so time labels don't
apply there and it is unchanged.

## Now view (temporarily enabled for owner testing)

`const NOW_VIEW_ENABLED = true` at the top of `App.jsx` is the single switch: the tab
(first in the row — it's the on-site home screen), the render, and the `setsOnNow` /
`upNextSets` / followed-pick feeders all key off it, so with it false the view costs
nothing. Flip it to false (or drop `'now'` from the tab array) to hide it again.

**Test clock**: `#now=2026-07-31T20:00` (or `?now=`) makes Now reason from that instant
instead of the wall clock — parsed in FESTIVAL time, so it means 8 PM on site whatever the
device's timezone, and a banner ("Test clock: Fri 8:00 PM") renders above the view so a
screenshot self-documents. An unparseable value silently falls back to the real clock.
This is QA scaffolding that ships harmlessly: it writes nothing, and an end user who sets
it only time-travels their own Now tab.

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
- **Audience-arm consent gate (vibes.diy#3484, added after the migration):** the
  `followersOf` audience only admits followers once the SUBJECT has armed audience
  visibility **for this app** — per-user, per-app, default OFF, fail closed
  (`AudienceArms` table). Until a user consents, their followers see "They haven't
  picked any events yet" no matter how many picks exist (this bit jchris/marcus,
  2026-07-15). The app invites consent via `useSocial().requestFollowersAccess()`
  (platform-rendered modal; quiet under a prior deny/never policy — invite, never
  nag): auto-invited once per session on opening the Follows tab, plus a persistent
  "Share my picks with followers" banner there while `followersEnabled` is false.
  Every user must consent individually; there is no owner-side bulk arm.
- **Profile page (2026-07-27, replaces link auto-follow):** a scanned link used to
  silently `follow()` the scanned handle after sign-in. It now opens `ProfileView.jsx`
  instead — following is an explicit tap, and the page works signed-out. The profile
  renders the subject's **follower-visible** picks and shared extras, reusing the same
  read path as the friends schedule (an active follow edge is what makes docs readable;
  the client can't tell "no picks" from "not armed" from "request not approved", so the
  empty copy names the possibilities). **Your own profile deliberately renders through
  that same path, not your local favorites** — if `followersEnabled` is false your
  followers see nothing, so the preview shows nothing plus the arming CTA. That makes
  "Preview my profile" (on the Follows tab, by the QR) an honest check of the arm gate.
- **Two different privacy knobs — don't conflate them.**
  1. **Account privacy** (a *private profile*): whether a follow of you lands active or
     as an approval-gated **request**. Account-level PLATFORM state, set in Settings →
     Social. A private profile is still findable and followable — the QR/share link is
     never gated on it, and there is no blur or overlay on it. In-app it surfaces only
     as its consequences, which the app already renders: `useSocial().requests` +
     `approve()` on the Follows tab, and the follower's `Requested` chip. **Pending
     platform support** (issue to come): `useSocial()` exposes no setter for it, so the
     in-app toggle can't be built; the target handle's privacy isn't in the protocol
     either, so the follow button can't say **"Request to follow"** before the tap — it
     says `Follow` and the private case surfaces afterwards as `Requested`. Private-by-
     default is likewise a platform call, not an app one.
  2. **Pick-sharing arm** (`followersEnabled` / `requestFollowersAccess()`): the
     unchanged per-app #3484 consent gate for whether your followers can read your
     picks. Orthogonal to account privacy — an un-armed account shows an empty schedule
     even to APPROVED followers, which is why the orange "Share my picks with followers"
     CTA appears on the own profile (and the Follows tab) whenever `followersEnabled` is
     false. `setVisibility()` on `useSocial()` is this knob's level setter, NOT account
     privacy. **It is reversible**, and the app says so in both directions: while armed,
     an understated "Stop sharing my picks" link (`c.quietLink`) sits under the own
     profile's "What your followers see" section and in the arm banner's slot on the
     Follows tab → `setVisibility('private')`; the un-armed orange CTA then takes over,
     so the round trip is visible and undoable in place. Re-arming has two paths and the
     snapshot can't distinguish them, so App.jsx remembers who turned it off
     (`disarmedRef`): a viewer who disarmed this session has already consented, so
     re-arming is a plain `setVisibility('followers')` — routing them back through
     `requestFollowersAccess()` would re-enter the consent matrix and a prior standing
     deny would no-op confusingly. A first-ever arm still goes through
     `requestFollowersAccess()`. That ref also suppresses the Follows-tab auto-invite.
     Copy on this control is always picks-scoped ("Stop sharing my picks", "your picks
     are hidden from your followers") and never says "private profile"/"private account"
     — that wording belongs to knob 1 alone.
- **Reaching it / leaving it:** the profile is NOT a tab and NOT an overlay — while
  `profileHandle` is set it takes over the content area under the normal header + nav,
  and pressing any tab clears it (and scrubs `#friend=`). It is reached by a deep link,
  "Preview my profile", or **tapping any handle anywhere** — App.jsx wraps `ViewerTag`
  in a `ProfileTag` (ViewerTag has no `onClick`) and passes that down as every view's
  `ViewerTag` prop, so the chips in Follows/Favorites/All Events and the `pickedBy` rows
  in the schedule all open profiles; `stopPropagation` keeps the surrounding chip's own
  click and its × working. The header avatar is the raw tag scaled 4× and clipped to a
  120px circle (ViewerTag has no size or avatar-only prop); on your own profile it is
  the propless "me" tag, which is the editable shape — that is how you set your photo.
