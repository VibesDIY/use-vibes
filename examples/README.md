# Example vibes

Real apps, source included. Every one of these is a vibe — `App.jsx` for
what people see, `access.js` for who can do what, and (where the app needs
one) `backend.js` for the part that runs when nobody's browser is open.
They're reference material for the [docs](https://good.vibes.diy/creator-documentation/)
and the [blog](https://good.vibes.diy/), and starting points for your own
apps: the fastest way to make one yours is to remix it on
[vibes.diy](https://vibes.diy/), or pull the source here and ship it with
the [CLI](https://good.vibes.diy/docs/cli) (`npx vibes-diy push`).

## Full apps (backend + access control)

| App | What it shows |
| --- | --- |
| [`meta-hub`](meta-hub/) | The remix hub that ships this platform — backend fan-out, owner-gated writes, a RUNBOOK for operating it |
| [`mention-hub`](mention-hub/) | Bluesky @-mention listener with guardrails — scheduled backend work, a write-only credential vault pattern |
| [`rolling-today`](rolling-today/) | Group ride calendar — backend jobs, calendar feeds, friends, unit-tested access rules |
| [`spelling-hive`](spelling-hive/) | Daily word puzzle with a backend that maintains server-controlled state |

## Festival & conference pickers

The same schedule-picker family, each tuned for a real event — multi-view
apps with favorites, friends, shifts, tested access control, and a backend:

[`pickathon-picker`](pickathon-picker/) ·
[`defcon-picker`](defcon-picker/) ·
[`euroscipy-picker`](euroscipy-picker/) ·
[`ietf-picker`](ietf-picker/) ·
[`juliacon-picker`](juliacon-picker/) ·
[`sotm-picker`](sotm-picker/)

## Starters

Small, readable, one-sitting apps — good first remixes:

- **Lists & boards:** [`kanban-board`](kanban-board/), [`kanban-live`](kanban-live/), [`task-list`](task-list/), [`to-do`](to-do/), [`todo-live`](todo-live/), [`lists-live`](lists-live/), [`shared-lists`](shared-lists/)
- **Groups & households:** [`family-grocery`](family-grocery/), [`grocery-live`](grocery-live/), [`habits-live`](habits-live/), [`team-channels`](team-channels/)
- **Games & toys:** [`word-jumble`](word-jumble/), [`match-pairs`](match-pairs/), [`spelling-hive`](spelling-hive/), [`hue-hunt`](hue-hunt/), [`hue-rush`](hue-rush/), [`tone-pairs`](tone-pairs/)
- **Music machines:** [`bloom-drums`](bloom-drums/), [`bloom-machine`](bloom-machine/), [`bloom-root`](bloom-root/), [`bloom-says`](bloom-says/)

## Also here

[`react-example`](react-example/) — embedding the `use-vibes` library in a
plain React app (a library example, not a full vibe).
