# habits-live

**The daily-recurring branch of the `/start` Productive lane** (#3080, deploys
to `system/habits-live`): habits reset every day, each check-in is a per-day
doc, and streaks (🔥) come from consecutive day-keys. Tap today's big button
to log; tap any dot in the week strip to fix a missed day.

**Day-keys are local-calendar and single-basis** (the hue-hunt lesson): the
key and the write derive from the same `Date`, so an 11pm check-in never lands
on "tomorrow". Check doc ids are deterministic (`check-<habitId>-<day>`) —
toggling is idempotent and the local→cloud migration overwrites rather than
duplicates. A minute-tick re-derives "today" when the calendar rolls over
mid-session.

**Accountability viewers, read-only by construction**
([`access.js`](access.js)): your habits live on your implicit scope
(`habits:default-<handle>`); friends invited by handle get the channel via
member-doc grants, but habit/check writes additionally require the scope to be
the writer's own — a granted channel never confers write access. Friends see
your streaks and cheer; only you log your days. Scopes shared with you appear
in the Friends sheet as a "Watching" switcher.

**Local-first**: the most personal app in the family — fully usable logged out
(`anonymousLocal`); sign-in is only for sync and sharing, upsold in the
Friends sheet.

## Deploy

Always pass `--vibe system/habits-live` so you don't publish under another handle:

```sh
cd vibes/habits-live
npx vibes-diy push --vibe system/habits-live   # deploy
npx vibes-diy pull system/habits-live --dir .  # pull current live source
```
