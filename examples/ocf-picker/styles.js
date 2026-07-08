// OCF house style, lifted from oregoncountryfair.org: warm cream surfaces,
// terracotta as the primary action color, teal as the schedule accent, bronze
// for secondary buttons, slab-serif headings (font-serif — headings only; body
// stays sans). Dark mode is system-responsive via Tailwind's `dark:`
// (prefers-color-scheme) — every surface has a dimmed warm-dark variant so a
// single light text flip (bodyText) reads everywhere.
export const c = {
  pageBg: 'bg-[#f7f8ef] dark:bg-[#12100c]',
  cardBg: 'bg-[#fffaf2] dark:bg-[#1b1813]',
  headerBg: 'bg-[#f7e8d8] dark:bg-[#241c10]',
  navBg: 'bg-[#25a48f] dark:bg-[#123d36]',
  bodyText: 'text-[#3a2f28] dark:text-[#f0e9df]',
  border: '',
  accentBg: 'bg-[#d95931]',
  eventCard: 'bg-[#f7e8d8] dark:bg-[#241c10] rounded-[16px] m-0.5 p-2 shadow-lg',
  favCard: 'bg-[#25a48f] dark:bg-[#123d36] rounded-[16px] m-0.5 p-2 shadow-lg',
  shiftCard: 'bg-[#25a48f] dark:bg-[#123d36] rounded-[16px] m-0.5 p-2',
  schedDay: 'mb-1.5 bg-[#25a48f] dark:bg-[#123d36] rounded-2xl m-0.5 p-2',
  schedShift: 'rounded-[12px] m-0.5 p-[7px] bg-[#f7e8d8] dark:bg-[#241c10]',
  schedEvent: 'rounded-[12px] m-0.5 p-[7px] bg-[#efe4cf] dark:bg-[#1e1a12]',
  input:
    'p-[7px] m-0.5 rounded-xl font-bold text-[#3a2f28] dark:text-[#f0e9df] bg-[#efe4cf] dark:bg-[#1e1a12]',
  navBtn: (active) =>
    `px-2.5 py-[7px] font-bold rounded-2xl m-0.5 transition-all ${active ? 'bg-[#3a2f28] dark:bg-[#f0e9df] text-white dark:text-[#1b1813]' : 'bg-[#fffaf2] dark:bg-[#1e1a12] text-[#3a2f28] dark:text-[#f0e9df] hover:bg-[#f7e8d8] dark:hover:bg-[#241c10]'}`,
  btnAccent:
    'bg-[#d95931] text-white font-bold py-[7px] px-2.5 rounded-2xl m-0.5 hover:opacity-90 transition-all',
  btnCyan:
    'bg-[#cd7f32] dark:bg-[#4a3313] text-white font-bold py-[7px] px-2.5 rounded-2xl m-0.5 hover:opacity-90 transition-all',
  // Same button, in-flight: color-only cue (terracotta) while the write lands. Copy is unchanged.
  btnCyanWorking:
    'bg-[#d95931] text-white font-bold py-[7px] px-2.5 rounded-2xl m-0.5 opacity-90 transition-all cursor-wait',
  badge: 'bg-[#d95931] text-white px-[3px] py-[1px] rounded-full text-sm font-bold m-0.5',
  favToggleOn:
    'p-[7px] rounded-2xl m-0.5 font-bold transition-all bg-[#d95931] text-white hover:opacity-90',
  favToggleOff:
    'p-[7px] rounded-2xl m-0.5 font-bold transition-all bg-[#efe4cf] dark:bg-[#1e1a12] text-[#3a2f28] dark:text-[#f0e9df] hover:bg-[#f7e8d8] dark:hover:bg-[#241c10]',
  linkBtn:
    'p-[7px] bg-[#efe4cf] dark:bg-[#1e1a12] text-[#3a2f28] dark:text-[#f0e9df] rounded-2xl m-0.5 hover:bg-[#f7e8d8] dark:hover:bg-[#241c10] transition-all',
  noteArea:
    'w-full p-1.5 m-0.5 rounded-[4px] resize-none text-[16px] text-[#3a2f28] dark:text-[#f0e9df] bg-transparent border border-[#3a2f28]/40 dark:border-[#f0e9df]/30',
  deleteBtn: 'p-[7px] bg-[#B22222] text-white rounded-2xl m-0.5 hover:opacity-80 transition-all',
  deleteX: (pending) =>
    `px-0.5 py-[1px] rounded-full m-0.5 text-xs font-bold transition-all ${pending ? 'bg-[#B22222] text-white' : 'bg-[#efe4cf] dark:bg-[#1e1a12] text-[#3a2f28] dark:text-[#f0e9df] hover:bg-[#B22222] hover:text-white'}`,
  noteBox: 'mt-0.5 p-1.5 bg-[#efe4cf] dark:bg-[#1e1a12] rounded-lg m-0.5',
  shiftForm: 'bg-[#f7e8d8] dark:bg-[#241c10] rounded-2xl m-0.5 p-2.5 mb-1.5',
  spinner: 'w-4 h-4 m-0.5 rounded-full animate-spin',
  readOnlyBanner:
    'mt-0.5 bg-[#efe4cf] dark:bg-[#1e1a12] text-[#3a2f28] dark:text-[#f0e9df] px-[7px] py-1.5 rounded-lg text-sm font-bold m-0.5',
  // Callout at the bottom-left, locked to the Vibes switch height (60px, 28px up
  // from the bottom) with even padding so the two read as a balanced pair.
  signInCallout:
    'bg-[#241c10] text-[#f0e9df] w-full sm:w-auto min-h-[60px] px-[16px] py-0.5 flex items-center gap-0.5 rounded-2xl shadow-2xl text-[11px] font-bold border border-white/20 text-balance leading-snug',
};

// Genre colors are saturated hues (GENRE_COLORS in festival-utils.js), so the
// tag pill takes the full color with white text (readable in both modes).
export const lineupTag = (event) => {
  const label = event.lineup?.id || 'Event';
  return {
    label,
    color: event.lineup?.color || '#8a8378',
    textColor: event.lineup?.textColor || '#fff',
  };
};

// The genre hue tints the card via the --lineup custom prop. Both modes MIX the
// color into the surface (light mixes toward the cream card base, dark toward
// the warm-dark base): the palette is too saturated to be a full card
// background under dark text.
export const eventCardStyle = (event) => ({ '--lineup': event.lineup?.color || '#8a8378' });
export const eventCardBg =
  'bg-[color-mix(in_oklab,var(--lineup)_18%,#fffaf2)] dark:bg-[color-mix(in_oklab,var(--lineup)_36%,#171410)]';

export const viewerTagStyle = {
  '--accent': '#d95931',
  '--accent-text': '#fff',
  '--card-bg': 'rgba(255,250,242,0.85)',
  '--border': '#3a2f28',
  '--text': '#3a2f28',
  borderRadius: 999,
  fontWeight: 700,
  fontSize: 16,
};
