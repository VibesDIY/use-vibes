# festival-picker-template — superseded

**Use [`../picker-baseline`](../picker-baseline) instead.**

This template was forked from `pickathon-picker` in July 2026 and the reference
app has moved on a long way since. Missing here, and present in the live app:
the scheduled schedule **mirror** (this one embeds a static snapshot), the
capability-token `.ics` subscription lane, load shedding, cursor-walked db reads
(the #4293 class of bug), and the `docs`/`picks`/`url-state`/`social-logic`
modules.

`picker-baseline` is a clone of the **live** `og/pickathon-picker` source
(`vibes-diy pull --published`) with the same substitution surface. Clones start
from live source, so improvements made upstream reach every festival.

Kept only because `salmonfest-2026` and `hoxeyville-skies-2026` were
instantiated from it. Neither ever deployed (their slugs hold stub fsIds and
both festivals have passed).
