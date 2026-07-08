# kanban-live

**The hybrid kanban** (deploys to `jchris/kanban-live`): the pointer-drag feel
of `og/paris-yemaya-2877` (pointer capture, rAF overlay, tap-vs-drag threshold,
live-query freeze while dragging) on `jchris/kanban-board`'s data model
(priority + fractional float `position` — a drag also reorders **within** a
column and writes only the moved doc; the drop placeholder tracks the real
insertion index).

Mobile is first-class:

- Columns are a horizontal **snap-scroll strip** (85vw per column) on phones,
  classic three-across on desktop.
- While dragging, holding the card near a screen edge **auto-scrolls the
  strip** (a persistent rAF loop, since `pointermove` stops firing when the
  finger holds still), so cross-column drags work one-handed.
- 44px+ touch targets throughout; tap a card for the detail modal (title,
  description, priority, status).

Best practices carried over: writes gate on a `useVibe(DB).can` verdict **and**
a signed-in viewer (plain-ACL verdicts are optimistic for anonymous visitors,
whose writes never sync); anonymous gets a read-only board and can still tap
cards to view. The detail modal edits from the board's loaded doc (never
`useDocument({_id})` pre-hydration) and spreads the full doc on save.
`createdAt`/`authorHandle` stamp at write time via `database.put`.

**Boards + members — private by default.** Tasks carry a `boardId`; a board's
name is the app title (tap it to switch, create, rename, or two-tap delete a
board — delete sweeps the board's tasks and members). [`access.js`](access.js)
implements the shared-lists per-object hybrid, per board: channel `board:<id>`
plus `board:<id>/admin`, creator is admin, and members added **by handle** from
the board sheet get read/write via `member`-doc grants.

Every user gets an **implicit personal default board** — channel
`board:default-<handle>`, no board doc, no public grant, same access model as
any other board (its user is implicitly admin and can invite members). Each
task write on a default board re-grants its user the channel, since there is no
board doc to carry the creator grant. Board docs may never claim a `default*`
id (a crafted one could grant away someone else's default channel). Nothing in
the app is world-readable: anonymous visitors see an empty board and a "log in"
notice. The app-owner identity bypasses channel checks.

> **Platform gotcha (#3077):** binding or changing an access.js does NOT
> re-evaluate outputs for existing docs — pre-existing docs keep replicating to
> everyone until rewritten through the gate (owner CLI `db put` of the same
> doc). Fresh channel-scoped docs are correctly withheld from non-members.

Candidate "Organize it on a board" evolution for the `/start` Productive lane
(#1896) — being polished interactively before the lane is wired.

Live at [https://vibes.diy/vibe/jchris/kanban-live](https://vibes.diy/vibe/jchris/kanban-live).

## Deploy

Always pass `--vibe jchris/kanban-live` so you don't publish under another handle:

```sh
cd vibes/kanban-live
npx vibes-diy push --vibe jchris/kanban-live   # deploy
npx vibes-diy pull jchris/kanban-live --dir .  # pull current live source
```
