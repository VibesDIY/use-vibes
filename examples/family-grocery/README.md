# family-grocery

**Family grocery shopping** (deploys to `jchris/family-grocery`): one list per
**store**, stores grouped into **family groups**. Anyone can start a group, you
can belong to any number of them, and adding someone to a group shares every
store list in it at once — the investor ask that seeded it ("a list per store,
all his lists shared with people he adds, anyone can start a family-group,
member or owner of more than one").

Built from the house patterns:

- **Access** ([`access.js`](access.js)): kanban-live's per-object hybrid, per
  group — channel `group:<id>` + `group:<id>/admin`, creator is admin, members
  added **by handle** get read/write on everything the group owns. Every user
  has an implicit personal group `default-<handle>` ("My family"); group docs
  may never claim a `default*` id. Hardened per lists-live: oldDoc-authoritative
  tombstones, strict immutability on updates, self-removal carve-out.
- **Drag and drop**: kanban-live's pointer machinery (pointer capture, rAF
  overlay, 5px tap-vs-drag threshold, live-query freeze while dragging, edge
  auto-scroll) with **stores as the columns** — drag an item to another store
  or reorder within one (fractional `position`, only the moved doc writes).
  A plain tap toggles the item in/out of the per-store cart section.
- **Local-first pre-invite**: `anonymousLocal` runs everything on-device while
  logged out, migrating into your implicit group on first sign-in
  (grocery-live's pattern).

**Theme: smooth**, deliberately not the neobrutalist house look — warm paper
gradient background, white rounded cards, soft shadows, one calm green accent,
pill chips for members. Spacing/radii use arbitrary px values (vibe Tailwind's
numeric spacing scale is px-scaled).

Sibling apps: `vibes/kanban-live` (drag machinery), `vibes/grocery-live`
(household-coarse sharing + recipe box), `vibes/lists-live` (per-list friends).
This one differs from grocery-live in that groups are **explicit and plural**
(create many, join many) rather than one implicit household per user.

Live at [https://vibes.diy/vibe/jchris/family-grocery](https://vibes.diy/vibe/jchris/family-grocery).

## Deploy

Always pass `--vibe jchris/family-grocery` so you don't publish under another handle:

```sh
cd vibes/family-grocery
npx vibes-diy push --vibe jchris/family-grocery   # deploy
npx vibes-diy pull jchris/family-grocery --dir .  # pull current live source
```
