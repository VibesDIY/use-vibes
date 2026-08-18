// ── The substitution surface ─────────────────────────────────────────────────
// Everything a new festival changes lives in this file plus the mirrored block
// at the top of backend.js (the backend isolate resolves no imports, so its
// copy is duplicated on purpose and pinned by festival-config.test.js).
//
// What is NOT configurable here — and must not be forked per festival — is the
// picker itself: favorites, notes, extras, follower sharing, the `.ics`
// download/subscribe lanes, offline boot, load shedding. Those improve upstream
// in og/pickathon-picker and flow down to every instantiation.
//
// Days are the app's spine: `dayOrder` names them, `dates` maps each to its
// calendar date, and a set that starts after midnight still belongs to the
// night before (the 4 AM cutoff in festival-utils.js). A festival that runs
// past midnight therefore lists the day it STARTS, never the date the clock
// rolls over to.
export const FESTIVAL = {
  // Identity
  name: 'Example Fest',
  // Worn by the header when the logo image fails, and by the .ics calendar name.
  shortName: 'EXAMPLE FEST',
  // The Fireproof db name AND the useVibe() app name. Keep it in sync with
  // BACKEND_DB in backend.js — they address the same store.
  dbName: 'examplefest',
  // Where this app is deployed; the friend-connect QR points at it.
  vibeUrl: 'https://vibes.diy/vibe/festival/example-fest-2026',

  // Time
  tz: 'America/Los_Angeles',
  dayOrder: ['Friday', 'Saturday', 'Sunday'],
  dates: {
    Friday: '2026-09-18',
    Saturday: '2026-09-19',
    Sunday: '2026-09-20',
  },
  // Where "now" sits before the festival opens — the first gate time.
  fallbackStart: '2026-09-18T11:30:00',

  // Header copy. `title` is the app's own name (it is a fan-made picker, so it
  // reads as one); `subtitle` is the dates-and-place line under it.
  title: 'EXAMPLE FEST PICKER',
  subtitle: 'Sep 18–20, 2026 · Somewhere, ST',

  // Links out. `mapUrl` is optional; omit it and the map link is not rendered.
  officialUrl: 'https://example.com',
  mapUrl: '',
  logoUrl: '',
};

// The palette is the OTHER half of the skin, and it lives in styles.js — the
// Tailwind arbitrary-value classes there must stay literal strings, so they
// cannot read from this object. Change the hex values at the top of styles.js.
