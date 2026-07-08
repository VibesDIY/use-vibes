# kanban-board

The classic three-column board (TO DO / IN PROGRESS / DONE) in the original
neo-brutalist style — modernized from the first-generation `jchris/kanban-board`
to current vibe best practices, keeping the **same database and doc shape** so
existing boards keep their tasks:

- Write surfaces gate on a `useVibe(DB).can` verdict **and** a signed-in viewer —
  on a plain-ACL db the verdict alone is optimistic for anonymous visitors, whose
  writes only land locally and never sync (the spectator trap). Read-only
  visitors see the board and a reason, not dead buttons or failed writes.
- Cards drag between and within columns; ordering is a fractional float
  `position` (drop-between averages the neighbours, one write per move). Legacy
  cards without `position` order by `createdAt` on the same scale.
- Writes go through `database.put` with `createdAt`/`authorHandle` stamped at
  write time (the old merge-then-`submit()` raced); authors render via
  `ViewerTag`.
- Columns sit side by side on desktop (it's a kanban board), stacked on mobile;
  each column has its own composer.

Candidate evolution step for the `/start` **Productive** lane (see the
`system/shared-lists` design, #1896).

Live at [https://vibes.diy/vibe/jchris/kanban-board](https://vibes.diy/vibe/jchris/kanban-board).

## Deploy

Always pass `--vibe jchris/kanban-board` so you don't publish under another handle:

```sh
cd vibes/kanban-board
npx vibes-diy push --vibe jchris/kanban-board   # deploy
npx vibes-diy pull jchris/kanban-board --dir .  # pull current live source
```
