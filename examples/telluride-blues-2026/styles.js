// ── The palette (the other half of the skin) ─────────────────────────────────
// Telluride Blues & Brews, drawn from the festival's own site and mark rather
// than invented: the deep indigo the site sets every heading, nav link and
// announcement bar in (#3A3582), the gold it reserves for section labels
// (#D59F20), and the orange of the sun burst in the logo (#F08040). Paper is
// the site's near-white (#F5F4F8).
//
// These are Tailwind arbitrary values, so they must stay literal strings here —
// this file IS the theming seam. Swapping a festival means swapping these hexes
// and the stage tints at the bottom, and nothing else in this file.
//
// Dark-mode palette is system-responsive via Tailwind's `dark:`
// (prefers-color-scheme). Dark isn't a grey inversion: it's the same indigo
// taken down to night, so the brand identity survives the flip. Every surface
// has a dimmed dark variant so a single light text flip (bodyText) reads
// everywhere.
export const c = {
  pageBg: 'bg-[#F5F4F8] dark:bg-[#0F0E22]',
  cardBg: 'bg-white dark:bg-[#191833]',
  // The identity band. Deep indigo with white type, the way the site opens
  // every page — so the text ON it is onHeader, never bodyText.
  headerBg: 'bg-[#3A3582] dark:bg-[#272257]',
  // Text that sits on headerBg. Its own key because headerBg is a dark surface
  // in both schemes: reaching for bodyText there paints dark-on-dark.
  onHeader: 'text-white',
  // The sticky tab bar reads as a continuation of the header band, one step
  // deeper, so the top of the app is one solid indigo mass like the site's
  // header + announcement bar.
  navBg: 'bg-[#2C2765] dark:bg-[#1C1943]',
  bodyText: 'text-[#26243F] dark:text-[#E9E7F4]',
  border: '',
  shiftCard: 'bg-[#F7E9C4] dark:bg-[#302818] rounded-[16px] m-0.5 p-2',
  schedDay: 'mb-1.5 bg-[#3A3582] dark:bg-[#272257] rounded-2xl m-0.5 p-2',
  schedShift: 'rounded-[12px] m-0.5 p-[7px] bg-[#F7E9C4] dark:bg-[#302818]',
  input:
    'p-[7px] m-0.5 rounded-xl font-bold text-[#26243F] dark:text-[#E9E7F4] bg-white dark:bg-[#221F45]',
  // Active tab is the gold the site uses for its section labels — the one warm
  // note against the indigo, so "where am I" is legible at arm's length in
  // daylight.
  navBtn: (active) =>
    `px-2.5 py-[7px] font-bold rounded-2xl m-0.5 transition-all uppercase tracking-wide ${active ? 'bg-[#E4AF20] text-[#26224F]' : 'bg-white/10 text-white hover:bg-white/20'}`,
  // Primary action = the sun in the mark, darkened until white type clears
  // WCAG AA on it (#F08040 itself is a 2.6:1 background for white).
  btnPink:
    'bg-[#C25A16] text-white font-bold py-[7px] px-2.5 rounded-2xl m-0.5 hover:opacity-90 transition-all',
  btnCyan:
    'bg-[#3A3582] text-white font-bold py-[7px] px-2.5 rounded-2xl m-0.5 hover:opacity-90 transition-all',
  // Understated reverser (turn pick-sharing back off). Deliberately not a button
  // shape: undoing a share you chose should be findable, never a competing CTA.
  quietLink: (busy) =>
    `text-sm font-bold underline underline-offset-2 opacity-70 hover:opacity-100 transition-all text-[#26243F] dark:text-[#E9E7F4] ${busy ? 'opacity-40 cursor-wait' : ''}`,
  // In-flight state for any action button: grey + desaturated + wait cursor, so it
  // reads as "working" rather than a hover effect (hover is opacity-only).
  btnWorking:
    'bg-[#8a8f97] text-white/85 font-bold py-[7px] px-2.5 rounded-2xl m-0.5 saturate-50 transition-all cursor-wait',
  badge: 'bg-[#C25A16] text-white px-[3px] py-[1px] rounded-full text-sm font-bold m-0.5',
  // Load shedding (loadshed.js): appended to a write control that is temporarily
  // INERT rather than hidden — your pick state must stay legible even while you
  // can't change it. Same vocabulary as btnWorking (desaturate + a cursor that
  // says "not now"), so it reads as a state of the app, not a broken button.
  shedInert: 'opacity-60 saturate-50 cursor-not-allowed',
  favToggleOn:
    'p-[7px] rounded-2xl m-0.5 font-bold transition-all bg-[#C25A16] text-white hover:opacity-90',
  favToggleOff:
    'p-[7px] rounded-2xl m-0.5 font-bold transition-all bg-white dark:bg-[#221F45] text-[#3A3582] dark:text-[#E9E7F4] hover:bg-[#F7E9C4] dark:hover:bg-[#302818]',
  linkBtn:
    'p-[7px] bg-white dark:bg-[#221F45] text-[#3A3582] dark:text-[#E9E7F4] rounded-2xl m-0.5 hover:bg-[#F7E9C4] dark:hover:bg-[#302818] transition-all',
  // Same mark as linkBtn, but no pill: on a card that already carries a round
  // heart button, a second circle reads as a second toggle. Plain text color on
  // transparent so the artist link reads as a link, not a control.
  linkPlain:
    'p-[7px] bg-transparent text-[#3A3582] dark:text-[#E9E7F4] m-0.5 hover:opacity-70 transition-all',
  noteArea:
    'w-full p-1.5 m-0.5 rounded-[4px] resize-none text-[16px] text-[#26243F] dark:text-[#E9E7F4] bg-transparent border border-[#26243F]/40 dark:border-[#E9E7F4]/30',
  deleteBtn: 'p-[7px] bg-[#B22222] text-white rounded-2xl m-0.5 hover:opacity-80 transition-all',
  deleteX: (pending) =>
    `px-0.5 py-[1px] rounded-full m-0.5 text-xs font-bold transition-all ${pending ? 'bg-[#B22222] text-white' : 'bg-white dark:bg-[#221F45] text-[#26243F] dark:text-[#E9E7F4] hover:bg-[#B22222] hover:text-white'}`,
  noteBox: 'mt-0.5 p-1.5 bg-white dark:bg-[#221F45] rounded-lg m-0.5',
  shiftForm: 'bg-[#F7E9C4] dark:bg-[#302818] rounded-2xl m-0.5 p-2.5 mb-1.5',
  readOnlyBanner:
    'mt-0.5 bg-white dark:bg-[#221F45] text-[#26243F] dark:text-[#E9E7F4] px-[7px] py-1.5 rounded-lg text-sm font-bold m-0.5',
  // Callout at the bottom-left, locked to the Vibes switch height (60px, 28px up
  // from the bottom) with even padding so the two read as a balanced pair.
  signInCallout:
    'bg-[#26224F] text-white w-full sm:w-auto min-h-[60px] px-[16px] py-0.5 flex items-center gap-0.5 rounded-2xl shadow-2xl text-[11px] font-bold border border-white/20 text-balance leading-snug',
  // The header wordmark and every day heading: uppercase, heavy and tightly
  // tracked, which is the signature of the League Spartan the festival sets its
  // own headings in. We don't load that webfont — a festival app boots on
  // campground signal — so the shape is carried by weight and tracking over the
  // stack that is already there.
  display: 'font-black uppercase tracking-tight',
};

// ── Stage colour ─────────────────────────────────────────────────────────────
// The feed gives every set a stage but no colour of its own (`lineup` comes back
// empty), so the tint is derived here from the stage name — presentation only,
// which keeps it out of the mirrored docs and off the content-hashed eventId.
// Every tint is LIGHT on purpose: the cards carry `bodyText`, so a saturated
// surface would be dark-on-dark.
const STAGE_TINTS = [
  [/main/i, '#DCD9F0'], // the brand indigo, opened right up
  [/blues/i, '#FBD9BE'], // the sun in the mark
  [/campground/i, '#F5E7BC'], // the gold the site labels sections in
  [/truck/i, '#D6E7DC'], // Town Park green
];
const DEFAULT_TINT = '#E7E3EE'; // special events and anything new the feed adds

export const stageTint = (event) => {
  const stage = event?.venueTitle || '';
  for (const [re, hex] of STAGE_TINTS) if (re.test(stage)) return hex;
  return DEFAULT_TINT;
};

// Null when the feed has no lineup of its own to name — the stage already prints
// on the card's meta line, so a pill that reads "MUSIC" on all 54 sets is a
// coloured shape carrying no information. Callers render the pill only if this
// returns one.
export const lineupTag = (event) => {
  const label = event.lineup?.id;
  if (!label) return null;
  return {
    label,
    color: event.lineup?.color || stageTint(event),
    textColor: event.lineup?.textColor || '#26243F',
  };
};

// Light mode: the full stage tint. Dark mode: the same hue mixed down into the
// dark surface (via the --lineup custom prop + a `dark:bg-[color-mix(...)]`
// class on the card), so stage grouping survives the flip.
export const eventCardStyle = (event) => ({ '--lineup': stageTint(event) });
export const eventCardBg =
  'bg-[var(--lineup)] dark:bg-[color-mix(in_oklab,var(--lineup)_30%,#14142b)]';
