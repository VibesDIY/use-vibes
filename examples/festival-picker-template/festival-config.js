// The single substitution surface for a festival instantiation.
// Copy this directory, replace this file (and the backend.js snapshot —
// see the SCHEDULE SNAPSHOT marker there), adjust nothing else.
export const FESTIVAL = {
  name: 'Template Fest',
  slug: 'template-fest-2026',
  dbName: 'template-fest',
  year: 2026,
  tz: 'America/Chicago',
  location: 'Anytown, IA',
  dates: ['2026-07-30', '2026-07-31'],
  stages: ['Main Stage'],
  tier: 'full',
  logoUrl: '',
  sourceUrls: ['https://example.com/lineup'],
  colors: {
    bg: '#faf7f2',
    card: '#ffffff',
    accent: '#c0472b',
    text: '#1a1a1a',
    muted: '#6b6b6b',
  },
};

export const SCHEDULE = [
  {
    id: 'act-1',
    band: 'First Act',
    day: '2026-07-30',
    start: '2026-07-30T18:00:00',
    end: '2026-07-30T19:00:00',
    stage: 'Main Stage',
    url: 'https://example.com/lineup',
  },
  {
    id: 'act-2',
    band: 'Second Act',
    day: '2026-07-31',
    start: '2026-07-31T20:00:00',
    end: '2026-07-31T21:30:00',
    stage: 'Main Stage',
    url: 'https://example.com/lineup',
  },
];
