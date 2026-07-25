// The five base colors come from festival-config.js — `FESTIVAL.colors` is the
// single substitution surface — but the skin itself stays HAND-WRITTEN, not derived
// via the template's makeC(): Hinterland ships a DARK-FIRST editorial poster look
// matched to hinterlandiowa.com (right-angle corners, warm-dark cards, no
// prefers-color-scheme variants). makeC's light-first derivation would replace that
// live design, so the live skin wins and only the base hexes are lifted to config.
import { FESTIVAL } from './festival-config.js';

const { bg, card, accent, text, muted } = FESTIVAL.colors;

// Hinterland 2026 — DARK EDITORIAL, matched to hinterlandiowa.com's live site:
//   the page is dark warm-brown #353329 (their body) with cream #FBF6EF type,
//   a powder-blue #A9C7D0 masthead, day-colored bands (Thu green #3BB683,
//   Fri powder-blue #A9C7D0, Sat periwinkle #7E88B0, Sun coral #F7B192),
//   Migra display serif on headings, Helvetica Now Text on everything else.
// House style is EDITORIAL / POSTER: right-angle corners (no rounding),
// warm-dark cards on the dark page, terracotta #C8613C the single action accent.
// Dark-first by design (not just a system-dark variant) so it reads like their
// site for every viewer.

export const DAY_COLORS = {
  thu: '#3BB683',
  fri: '#A9C7D0',
  sat: '#7E88B0',
  sun: '#F7B192',
  mon: '#F2B441',
};
// Day → band style (colored bar, dark ink, Migra italic set by the view).
export const dayBand = (day = '') => {
  const key = String(day).slice(0, 3).toLowerCase();
  return { background: DAY_COLORS[key] || '#A9C7D0', color: '#353329' };
};

export const c = {
  pageBg: `bg-[${bg}]`,
  cardBg: 'bg-transparent',
  headerBg: `bg-[${muted}]`,
  navBg: 'bg-[#2c2b22]',
  bodyText: `text-[${text}]`,
  border: '',
  pinkBg: `bg-[${accent}]`,
  // Warm-dark cards on the dark page; the day/stage color rides the --lineup prop.
  eventCard: `bg-[${card}] m-0.5 p-2 shadow-lg`,
  favCard: 'bg-[#2c5a44] m-0.5 p-2 shadow-lg',
  shiftCard: 'bg-[#2c5a44] m-0.5 p-2',
  schedDay: `mb-1.5 bg-[${card}] m-0.5 p-2`,
  schedShift: `m-0.5 p-[7px] bg-[${card}]`,
  schedEvent: `m-0.5 p-[7px] bg-[${card}]`,
  input: `p-[7px] m-0.5 font-medium text-[${text}] bg-[${card}] placeholder:text-[${text}]/50`,
  navBtn: (active) =>
    `px-2.5 py-[7px] font-bold m-0.5 transition-all ${active ? `bg-[${text}] text-[${bg}]` : `bg-[${card}] text-[${text}] hover:bg-[#4f4b3b]`}`,
  btnPink: `bg-[${accent}] text-white font-bold py-[7px] px-2.5 m-0.5 hover:opacity-90 transition-all`,
  btnCyan:
    'bg-[#3BB683] text-[#12261d] font-bold py-[7px] px-2.5 m-0.5 hover:opacity-90 transition-all',
  // Same button, in-flight: color-only cue (terracotta) while the write lands.
  btnCyanWorking: `bg-[${accent}] text-white font-bold py-[7px] px-2.5 m-0.5 opacity-90 transition-all cursor-wait`,
  badge: `bg-[#F7B192] text-[${bg}] px-[4px] py-[1px] text-sm font-bold m-0.5`,
  favToggleOn: `p-[7px] m-0.5 font-bold transition-all bg-[${accent}] text-white hover:opacity-90`,
  favToggleOff: `p-[7px] m-0.5 font-bold transition-all bg-[${card}] text-[${text}] hover:bg-[#4f4b3b]`,
  linkBtn: `p-[7px] bg-[${card}] text-[${text}] m-0.5 hover:bg-[#4f4b3b] transition-all`,
  noteArea: `w-full p-1.5 m-0.5 resize-none text-[16px] text-[${text}] bg-transparent border border-[${text}]/30`,
  deleteBtn: 'p-[7px] bg-[#B22222] text-white m-0.5 hover:opacity-80 transition-all',
  deleteX: (pending) =>
    `px-1 py-[1px] m-0.5 text-xs font-bold transition-all ${pending ? 'bg-[#B22222] text-white' : `bg-[${card}] text-[${text}] hover:bg-[#B22222] hover:text-white`}`,
  noteBox: `mt-0.5 p-1.5 bg-[${card}] m-0.5`,
  shiftForm: `bg-[${card}] m-0.5 p-2.5 mb-1.5`,
  // Loading spinner stays circular — a square spinning border reads as a glitch.
  spinner: 'w-4 h-4 m-0.5 rounded-full animate-spin',
  readOnlyBanner: `mt-0.5 bg-[${card}] text-[${text}] px-[7px] py-1.5 text-sm font-bold m-0.5`,
  // Callout at the bottom, locked to the Vibes switch height (60px).
  signInCallout: `bg-[${muted}] text-[${bg}] w-full sm:w-auto min-h-[60px] px-[16px] py-0.5 flex items-center gap-0.5 shadow-2xl text-[11px] font-bold text-balance leading-snug`,
};

export const lineupTag = (event) => {
  const label = event.lineup?.id || 'music';
  return {
    label,
    color: event.lineup?.color || '#F7B192',
    textColor: event.lineup?.textColor || '#353329',
  };
};

// The stage/day color tints a card via the --lineup custom prop, mixed down into
// the dark surface so text stays cream-readable.
export const eventCardStyle = (event) => ({
  '--lineup': event.lineup?.color || '#F7B192',
});
export const eventCardBg = `bg-[color-mix(in_oklab,var(--lineup)_38%,${bg})]`;

export const viewerTagStyle = {
  '--accent': '#C8613C',
  '--accent-text': '#fff',
  '--card-bg': 'rgba(64,61,49,0.92)',
  '--border': '#A9C7D0',
  '--text': '#FBF6EF',
  borderRadius: 0,
  fontWeight: 700,
  fontSize: 16,
};
