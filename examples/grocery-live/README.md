# grocery-live

**The grocery branch of the `/start` Productive lane** (#3080, deploys to
`system/grocery-live`): lists become **stores** (the store picker is the app
title — kanban-live's sheet pattern: switch, create, rename, two-tap delete),
and the special feature is the **recipe box**: type "lasagna" and `callAI`
(JSON schema `{ingredients:[{name, quantity?}]}`) adds deduped unchecked items
to the active store, each visibly tagged ✨ with the recipe it came from.
Dedupe is by normalized name against the store's _unchecked_ items — checked
ones re-add, because you need more. Checked items collapse into an
"In the cart" section (grocery lists are reused; unchecking puts things back),
with a clear-cart sweep for after the shop.

**Whole-household sharing** ([`access.js`](access.js)) — deliberately coarser
than lists-live's per-list friends: everything a household owns (stores,
items, membership) rides ONE channel, `home:<founder-handle>`, and one
membership grant covers all of it. You live in your own implicit household
(householdId IS its founder's handle — no household doc; every write re-grants
the founder). Membership is **founder-only to grant or revoke** (members may
remove themselves) — the one coarse grant that unlocks everything shouldn't be
handed out transitively, per Charlie's #3081 review; items and stores stay
any-member. A household switcher appears only if you've been invited to
another.
Merge/move between households is out of scope. Deletes fall back to `oldDoc`
for tombstone-dropped fields; the app-owner identity bypasses channel checks.

**Local-first pre-invite**: `anonymousLocal` runs everything against a
localStorage store while logged out, migrating into the cloud (and your
implicit household) on first sign-in.

## Deploy

Always pass `--vibe system/grocery-live` so you don't publish under another handle:

```sh
cd vibes/grocery-live
npx vibes-diy push --vibe system/grocery-live   # deploy
npx vibes-diy pull system/grocery-live --dir .  # pull current live source
```
