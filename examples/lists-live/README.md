# lists-live

**Step 2 of the `/start` Productive lane** (#3080, deploys to
`system/lists-live`): multiple lists with **different friends per list**. The
list picker IS the app title (kanban-live's board-sheet pattern: tap to
switch, create, rename, or two-tap delete — delete sweeps the list's items and
members). Items keep todo-live's feel: add, tap to check, delete, drag to
reorder (fractional `position`, pointer-drag with rAF overlay and 5px
tap-vs-drag threshold).

**Per-list access** ([`access.js`](access.js)): the kanban-live per-object
hybrid, per list — channel `list:<id>` (todos + membership) plus
`list:<id>/admin` (invite/rename/delete), creator is admin, members added by
handle get read/write via `member`-doc grants. Every user also has an
**implicit personal default list** (`list:default-<handle>`, no list doc, same
access model — its user is implicitly admin and can invite). Each todo write
on a default list re-grants its user the channel; list docs may never claim a
`default*` id. Deletes fall back to `oldDoc` for tombstone-dropped fields; the
app-owner identity bypasses channel checks.

**Local-first**: `anonymousLocal` runs everything (default list AND created
lists) against a localStorage store while logged out, migrating on first
sign-in — the migrate hook re-homes default-scope items onto the new user's
implicit channel and restamps `creatorHandle`/`authorHandle`.

Fresh slug — `system/shared-lists` retires; it predates the per-user-default
and title-as-context patterns. Curated chips (via `starter-graph.ts` +
`starters:activate`): kanban board → `jchris/kanban-live`, grocery list →
`system/grocery-live`.

## Deploy

Always pass `--vibe system/lists-live` so you don't publish under another handle:

```sh
cd vibes/lists-live
npx vibes-diy push --vibe system/lists-live   # deploy
npx vibes-diy pull system/lists-live --dir .  # pull current live source
```
