// The single substitution surface for a festival instantiation.
// Copy this directory, replace this file (and the backend.js snapshot —
// see the SCHEDULE SNAPSHOT marker there), adjust nothing else.
//
// Hoxeyville Skies Music Festival — the successor to the 25-year Hoxeyville Music
// Festival, on the same Hoxey grounds in Wellston, MI. Every set below is
// transcribed from the official "2026 Schedule" graphic published on
// hoxeyvilleskies.com/schedule; band names use that graphic's spellings.
//
// Colors are the festival's real palette: `bg`/`card` sampled from the official
// schedule graphic, `accent`/`text`/`muted` are the site theme's own accent,
// white, and lightAccent tokens.
export const FESTIVAL = {
  name: 'Hoxeyville Skies',
  slug: 'hoxeyville-skies-2026',
  dbName: 'hoxeyville-skies',
  year: 2026,
  tz: 'America/Detroit',
  location: 'Wellston, MI',
  dates: ['2026-08-07', '2026-08-08'],
  stages: ['Hoxey Stage', 'Gopherwood Stage'],
  tier: 'full',
  logoUrl:
    'https://images.squarespace-cdn.com/content/v1/697111116f844d03428ba760/72902f2c-a76c-403f-a74b-ef3d8dccbc43/Hoxey+Skies+Poster+2026+%281%29.jpg',
  sourceUrls: [
    'https://www.hoxeyvilleskies.com/schedule',
    'https://www.hoxeyvilleskies.com/lineup',
    'https://images.squarespace-cdn.com/content/v1/697111116f844d03428ba760/83648a01-4c97-4a9c-917c-145d90dd0700/Schedule+2026.png',
  ],
  colors: {
    bg: '#321e46',
    card: '#6b736d',
    accent: '#e81748',
    text: '#fcf0f0',
    muted: '#d1c8f4',
  },
};

const SRC = 'https://www.hoxeyvilleskies.com/schedule';

// The published grid runs both stages from midday into the small hours, so the
// late sets carry an end timestamp on the FOLLOWING calendar date while their
// festival `day` stays the night they belong to. The two "12:00 Acoustic" sets
// are published with a start and no end — recorded as end: null rather than
// inventing a duration.
export const SCHEDULE = [
  // ── Friday, August 7 ──────────────────────────────────────────────────────
  {
    id: 'fri-hoxey-lost-in-the-woods',
    band: 'Lost In the Woods',
    day: '2026-08-07',
    start: '2026-08-07T15:45:00',
    end: '2026-08-07T16:45:00',
    stage: 'Hoxey Stage',
    url: SRC,
  },
  {
    id: 'fri-hoxey-sweet-dee-and-the-wild-honeys',
    band: 'Sweet Dee & the Wild Honeys',
    day: '2026-08-07',
    start: '2026-08-07T17:30:00',
    end: '2026-08-07T18:30:00',
    stage: 'Hoxey Stage',
    url: SRC,
  },
  {
    id: 'fri-hoxey-flexadecibel',
    band: 'Flexadecibel',
    day: '2026-08-07',
    start: '2026-08-07T19:15:00',
    end: '2026-08-07T20:15:00',
    stage: 'Hoxey Stage',
    url: SRC,
  },
  {
    id: 'fri-hoxey-grahame-lesh-and-friends',
    band: 'Grahame Lesh & Friends',
    day: '2026-08-07',
    start: '2026-08-07T21:00:00',
    end: '2026-08-08T00:00:00',
    stage: 'Hoxey Stage',
    url: SRC,
  },
  {
    id: 'fri-gopherwood-megan-dooley',
    band: 'Megan Dooley',
    day: '2026-08-07',
    start: '2026-08-07T15:00:00',
    end: '2026-08-07T15:45:00',
    stage: 'Gopherwood Stage',
    url: SRC,
  },
  {
    id: 'fri-gopherwood-high-strung-steel',
    band: 'High Strung Steel',
    day: '2026-08-07',
    start: '2026-08-07T16:45:00',
    end: '2026-08-07T17:30:00',
    stage: 'Gopherwood Stage',
    url: SRC,
  },
  {
    id: 'fri-gopherwood-1000-watt-prophets',
    band: '1000 Watt Prophets',
    day: '2026-08-07',
    start: '2026-08-07T18:30:00',
    end: '2026-08-07T19:15:00',
    stage: 'Gopherwood Stage',
    url: SRC,
  },
  {
    // Published as "12:00 Acoustic" — a midnight start with no announced end.
    id: 'fri-gopherwood-smokin-dobroleles-acoustic',
    band: "The Smokin' Dobroleles (Acoustic)",
    day: '2026-08-07',
    start: '2026-08-08T00:00:00',
    end: null,
    stage: 'Gopherwood Stage',
    url: SRC,
  },

  // ── Saturday, August 8 ────────────────────────────────────────────────────
  {
    id: 'sat-hoxey-venus-envy',
    band: 'Venus Envy',
    day: '2026-08-08',
    start: '2026-08-08T13:00:00',
    end: '2026-08-08T14:00:00',
    stage: 'Hoxey Stage',
    url: SRC,
  },
  {
    id: 'sat-hoxey-joe-johnson-and-the-bluebacks',
    band: 'Joe Johnson & the Bluebacks',
    day: '2026-08-08',
    start: '2026-08-08T14:45:00',
    end: '2026-08-08T15:45:00',
    stage: 'Hoxey Stage',
    url: SRC,
  },
  {
    id: 'sat-hoxey-luke-winslow-king-band',
    band: 'Luke Winslow-King Band',
    day: '2026-08-08',
    start: '2026-08-08T16:30:00',
    end: '2026-08-08T17:30:00',
    stage: 'Hoxey Stage',
    url: SRC,
  },
  {
    id: 'sat-hoxey-smokin-dobroleles',
    band: "The Smokin' Dobroleles",
    day: '2026-08-08',
    start: '2026-08-08T18:15:00',
    end: '2026-08-08T19:15:00',
    stage: 'Hoxey Stage',
    url: SRC,
  },
  {
    id: 'sat-hoxey-airborne-or-aquatic',
    band: 'Airborne or Aquatic?',
    day: '2026-08-08',
    start: '2026-08-08T20:00:00',
    end: '2026-08-08T21:30:00',
    stage: 'Hoxey Stage',
    url: SRC,
  },
  {
    id: 'sat-hoxey-ekoostik-hookah',
    band: 'ekoostik hookah',
    day: '2026-08-08',
    start: '2026-08-08T22:15:00',
    end: '2026-08-09T00:00:00',
    stage: 'Hoxey Stage',
    url: SRC,
  },
  {
    id: 'sat-gopherwood-lake-effect-family-band',
    band: 'Lake Effect Family Band',
    day: '2026-08-08',
    start: '2026-08-08T12:00:00',
    end: '2026-08-08T13:00:00',
    stage: 'Gopherwood Stage',
    url: SRC,
  },
  {
    id: 'sat-gopherwood-barefoot',
    band: 'Barefoot',
    day: '2026-08-08',
    start: '2026-08-08T14:00:00',
    end: '2026-08-08T14:45:00',
    stage: 'Gopherwood Stage',
    url: SRC,
  },
  {
    id: 'sat-gopherwood-sometime-soon',
    band: 'Sometime Soon',
    day: '2026-08-08',
    start: '2026-08-08T15:45:00',
    end: '2026-08-08T16:30:00',
    stage: 'Gopherwood Stage',
    url: SRC,
  },
  {
    id: 'sat-gopherwood-mitten-pickers',
    band: 'Mitten Pickers',
    day: '2026-08-08',
    start: '2026-08-08T17:30:00',
    end: '2026-08-08T18:15:00',
    stage: 'Gopherwood Stage',
    url: SRC,
  },
  {
    id: 'sat-gopherwood-herb-and-hanson',
    band: 'Herb & Hanson',
    day: '2026-08-08',
    start: '2026-08-08T19:15:00',
    end: '2026-08-08T20:00:00',
    stage: 'Gopherwood Stage',
    url: SRC,
  },
  {
    // Published as "12:00 Acoustic" — a midnight start with no announced end.
    id: 'sat-gopherwood-artist-jam-acoustic',
    band: 'Artist Jam (Acoustic)',
    day: '2026-08-08',
    start: '2026-08-09T00:00:00',
    end: null,
    stage: 'Gopherwood Stage',
    url: SRC,
  },
];
