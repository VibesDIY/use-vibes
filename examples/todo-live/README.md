# todo-live

**Step 1 of the `/start` Productive lane** (#3080, deploys to
`system/todo-live`): one to-do list — add, check (tap), delete, drag to
reorder. Kanban-live's pointer-drag feel in a single column: pointer capture,
rAF overlay, 5px tap-vs-drag threshold, live-query freeze while dragging,
fractional float `position` so a drop writes only the moved doc.

**Local-first.** Anonymous `/start` visitors use it instantly:
`useFireproof("todo", { anonymousLocal: true, migrate })` routes
put/del/useLiveQuery to a localStorage store while logged out, then migrates
into the cloud on first sign-in — the `migrate` hook stamps `authorHandle` and
the implicit personal list id (`default-<handle>`) so anonymous-era items land
on the user's private channel through the access gate, correctly granted.
Sign-in is an upsell at the first _invite_: the Friends sheet carries the
"sign in to sync & share" CTA (a `ViewerTag` login button) for logged-out
visitors. Returning signed-out devices ride the cloud db, whose
anonymous-write rejection surfaces as the sign-in nudge.

**Sharing.** Every user's list is an implicit per-user channel
(`list:default-<handle>` — no list doc; that's lists-live, the next step).
Friends added **by handle** get read/write via `member`-doc grants
([`access.js`](access.js)); lists shared with you appear in the Friends sheet
as a switcher. Each todo write (re)grants the scope's user their own channel
(implicit scopes have no doc to carry a creator grant). `listId`s outside the
`default-` namespace are rejected outright. The app-owner identity bypasses
channel checks; deletes fall back to `oldDoc` for tombstone-dropped fields.

Curated chips (via `starter-graph.ts` + `starters:activate`): multi-list →
`system/lists-live`, habit tracker → `system/habits-live`, chore wheel →
`system/chores-live` (pending #3040).

## Deploy

Always pass `--vibe system/todo-live` so you don't publish under another handle:

```sh
cd vibes/todo-live
npx vibes-diy push --vibe system/todo-live   # deploy
npx vibes-diy pull system/todo-live --dir .  # pull current live source
```
