// OSM-cartography house style: map greens with water-blue accents, so the whole
// UI reads like a map legend. Dark mode is system-responsive via Tailwind's
// `dark:` (prefers-color-scheme) — every surface has a dimmed dark variant so a
// single light text flip (bodyText) reads everywhere.
export const c = {
  pageBg: 'bg-[#f0f4ec] dark:bg-[#0e120b]',
  cardBg: 'bg-white dark:bg-[#161c12]',
  headerBg: 'bg-[#d8e8c8] dark:bg-[#16220e]',
  navBg: 'bg-[#4c7a34] dark:bg-[#1c3012]',
  bodyText: 'text-[#2b3a24] dark:text-[#e9f0e3]',
  border: '',
  accentBg: 'bg-[#2d6a8f]',
  eventCard: 'bg-[#d8e8c8] dark:bg-[#16220e] rounded-[16px] m-0.5 p-2 shadow-lg',
  favCard: 'bg-[#4c7a34] dark:bg-[#1c3012] rounded-[16px] m-0.5 p-2 shadow-lg',
  shiftCard: 'bg-[#4c7a34] dark:bg-[#1c3012] rounded-[16px] m-0.5 p-2',
  schedDay: 'mb-1.5 bg-[#4c7a34] dark:bg-[#1c3012] rounded-2xl m-0.5 p-2',
  schedShift: 'rounded-[12px] m-0.5 p-[7px] bg-[#d8e8c8] dark:bg-[#16220e]',
  schedEvent: 'rounded-[12px] m-0.5 p-[7px] bg-white dark:bg-[#1b2913]',
  input:
    'p-[7px] m-0.5 rounded-xl font-bold text-[#2b3a24] dark:text-[#e9f0e3] bg-white dark:bg-[#1b2913]',
  navBtn: (active) =>
    `px-2.5 py-[7px] font-bold rounded-2xl m-0.5 transition-all ${active ? 'bg-[#2b3a24] dark:bg-[#e9f0e3] text-white dark:text-[#161c12]' : 'bg-white dark:bg-[#1b2913] text-[#2b3a24] dark:text-[#e9f0e3] hover:bg-[#d8e8c8] dark:hover:bg-[#16220e]'}`,
  btnAccent:
    'bg-[#2d6a8f] text-white font-bold py-[7px] px-2.5 rounded-2xl m-0.5 hover:opacity-90 transition-all',
  btnCyan:
    'bg-[#4c7a34] dark:bg-[#1c3012] text-white font-bold py-[7px] px-2.5 rounded-2xl m-0.5 hover:opacity-90 transition-all',
  // Same button, in-flight: color-only cue (water blue) while the write lands. Copy is unchanged.
  btnCyanWorking:
    'bg-[#2d6a8f] text-white font-bold py-[7px] px-2.5 rounded-2xl m-0.5 opacity-90 transition-all cursor-wait',
  badge: 'bg-[#2d6a8f] text-white px-[3px] py-[1px] rounded-full text-sm font-bold m-0.5',
  favToggleOn:
    'p-[7px] rounded-2xl m-0.5 font-bold transition-all bg-[#2d6a8f] text-white hover:opacity-90',
  favToggleOff:
    'p-[7px] rounded-2xl m-0.5 font-bold transition-all bg-white dark:bg-[#1b2913] text-[#2b3a24] dark:text-[#e9f0e3] hover:bg-[#d8e8c8] dark:hover:bg-[#16220e]',
  linkBtn:
    'p-[7px] bg-white dark:bg-[#1b2913] text-[#2b3a24] dark:text-[#e9f0e3] rounded-2xl m-0.5 hover:bg-[#d8e8c8] dark:hover:bg-[#16220e] transition-all',
  noteArea:
    'w-full p-1.5 m-0.5 rounded-[4px] resize-none text-[16px] text-[#2b3a24] dark:text-[#e9f0e3] bg-transparent border border-[#2b3a24]/40 dark:border-[#e9f0e3]/30',
  deleteBtn: 'p-[7px] bg-[#B22222] text-white rounded-2xl m-0.5 hover:opacity-80 transition-all',
  deleteX: (pending) =>
    `px-0.5 py-[1px] rounded-full m-0.5 text-xs font-bold transition-all ${pending ? 'bg-[#B22222] text-white' : 'bg-white dark:bg-[#1b2913] text-[#2b3a24] dark:text-[#e9f0e3] hover:bg-[#B22222] hover:text-white'}`,
  noteBox: 'mt-0.5 p-1.5 bg-white dark:bg-[#1b2913] rounded-lg m-0.5',
  shiftForm: 'bg-[#d8e8c8] dark:bg-[#16220e] rounded-2xl m-0.5 p-2.5 mb-1.5',
  spinner: 'w-4 h-4 m-0.5 rounded-full animate-spin',
  readOnlyBanner:
    'mt-0.5 bg-white dark:bg-[#1b2913] text-[#2b3a24] dark:text-[#e9f0e3] px-[7px] py-1.5 rounded-lg text-sm font-bold m-0.5',
  // Callout at the bottom-left, locked to the Vibes switch height (60px, 28px up
  // from the bottom) with even padding so the two read as a balanced pair.
  signInCallout:
    'bg-[#16220e] text-white w-full sm:w-auto min-h-[60px] px-[16px] py-0.5 flex items-center gap-0.5 rounded-2xl shadow-2xl text-[11px] font-bold border border-white/20 text-balance leading-snug',
};

// Track colors are saturated legend hues, so the tag pill takes the full color
// with white text (readable in both modes).
export const lineupTag = (event) => {
  const label = event.lineup?.id || 'General';
  return {
    label,
    color: event.lineup?.color || '#4c7a34',
    textColor: event.lineup?.textColor || '#fff',
  };
};

// The track hue tints the card via the --lineup custom prop. Both modes MIX the
// color into the surface (light mixes toward white, dark toward the dark base):
// the legend palette is too saturated to be a full card background under dark text.
export const eventCardStyle = (event) => ({ '--lineup': event.lineup?.color || '#4c7a34' });
export const eventCardBg =
  'bg-[color-mix(in_oklab,var(--lineup)_18%,#ffffff)] dark:bg-[color-mix(in_oklab,var(--lineup)_36%,#10150c)]';

export const viewerTagStyle = {
  '--accent': '#2d6a8f',
  '--accent-text': '#fff',
  '--card-bg': 'rgba(255,255,255,0.85)',
  '--border': '#2b3a24',
  '--text': '#2b3a24',
  borderRadius: 999,
  fontWeight: 700,
  fontSize: 16,
};
