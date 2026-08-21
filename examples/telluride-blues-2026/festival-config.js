// ── The substitution surface ─────────────────────────────────────────────────
// Telluride Blues & Brews 2026 — an unofficial, fan-made schedule app.
// Everything here is data about the festival; the app itself is unmodified from
// picker-baseline (which tracks the live og/pickathon-picker source).
export const FESTIVAL = {
  name: 'Telluride Blues & Brews',
  shortName: 'TELLURIDE BLUES & BREWS',
  dbName: 'tellurideblues',
  vibeUrl: 'https://vibes.diy/vibe/festival/telluride-blues-2026',

  tz: 'America/Denver',
  dayOrder: ['Thursday', 'Friday', 'Saturday', 'Sunday'],
  dates: {
    Thursday: '2026-09-17',
    Friday: '2026-09-18',
    Saturday: '2026-09-19',
    Sunday: '2026-09-20',
  },
  // Gates open 11:30 AM Friday; Thursday is pre-festival events in town.
  fallbackStart: '2026-09-17T17:00:00',

  title: 'TELLURIDE BLUES & BREWS',
  subtitle: '2026 Schedule · Sep 17–20 · Town Park, Telluride, CO',

  officialUrl: 'https://tellurideblues.com/schedule',
  mapUrl: '',
  // No logoUrl: the festival's own mark is theirs, and this is a fan-made app.
  // The header draws its own sun in the festival's colours instead (SunMark in
  // icons.jsx), which also costs no network on campground signal.
  logoUrl: '',
};
