// Load shedding: ONE owner-written config doc that turns viewer-driven work off
// during the festival rush, with no redeploy and no code change.
//
//   vibes-diy db put --db pickathon '{"_id":"0-load-shed","type":"loadshed","level":"read-only"}'
//
// Levels, and exactly what each one costs the viewer:
//   off            — normal operation. Also what an ABSENT doc and any
//                    unrecognized level mean: this switch FAILS OPEN, because a
//                    typo'd `db put` at 11pm on a Saturday must not brick the app.
//   read-only      — the schedule/browse/now/bands views keep FULL function;
//                    every write affordance goes inert (favorite toggling, the
//                    band-level heart, note editing, extras add/edit).
//   schedule-only  — read-only, PLUS the Friends tab and profile views render a
//                    one-line paused state INSTEAD of mounting their live
//                    queries. Those are the per-viewer follower fan-out reads —
//                    the amplification that actually costs the Sessions DO.
//
// Signed-in and anonymous viewers behave identically: shedding is about load,
// not about who you are.
//
// The `_id` leads with a DIGIT on purpose: it sorts ahead of every id this app
// mints (`caltoken-`, `favorite-`, `note-`, `schedule-event-`, uuid shifts), so
// the backend's whole-db read sees it inside the host's 2000-doc query cap
// (§4a). access.js makes it owner-only WRITE but world-READABLE — see the
// comment there for why both halves matter.
//
// backend.js and access.js CANNOT import this file (each runs alone in the
// backend isolate, no import resolution), so they carry literal copies of the id
// and type. loadshed.test.js pins the literals as the drift guard.

export const LOADSHED_ID = '0-load-shed';
export const LOADSHED_TYPE = 'loadshed';

export const SHED_OFF = 'off';
export const SHED_READ_ONLY = 'read-only';
export const SHED_SCHEDULE_ONLY = 'schedule-only';

const KNOWN_LEVELS = [SHED_OFF, SHED_READ_ONLY, SHED_SCHEDULE_ONLY];

// Fail-open by construction: only an exactly-recognized level sheds anything.
// Case/whitespace are forgiven because this doc is written by hand under
// pressure, but an unknown string is `off`, never "shed harder".
export const shedLevelOf = (doc) => {
  const raw = doc && typeof doc.level === 'string' ? doc.level.trim().toLowerCase() : '';
  return KNOWN_LEVELS.includes(raw) ? raw : SHED_OFF;
};

// The client reads this through a type-keyed live query, so it gets an array.
// Key on the id we own rather than "whatever came back".
export const shedLevelFromDocs = (docs) =>
  shedLevelOf((docs || []).find((d) => d && d._id === LOADSHED_ID));

export const picksPaused = (level) => level === SHED_READ_ONLY || level === SHED_SCHEDULE_ONLY;
export const socialPaused = (level) => level === SHED_SCHEDULE_ONLY;

// Copy rules (agents/local-first-copy-rules.md): say what is paused and that
// nothing is lost. Never imply data loss, never promise a time.
export const SHED_BANNER =
  'Festival mode: picks are paused right now — the schedule still works, and your existing picks are safe on this device.';
export const SHED_SOCIAL_LINE = 'Paused during the festival rush — your picks are safe.';
