// Dark-mode palette is system-responsive via Tailwind's `dark:` (prefers-color-scheme).
// Every surface has a dimmed dark variant so a single light text flip (bodyText) reads
// everywhere. Bright brand hues (lime #BACD32 / green #71AD44) map to dark tints that
// keep the same warm/cool identity.
export const c = {
  pageBg: 'bg-[#EEE] dark:bg-[#0e0f12]',
  cardBg: 'bg-white dark:bg-[#181a20]',
  headerBg: 'bg-[#BACD32] dark:bg-[#2c3510]',
  navBg: 'bg-[#71AD44] dark:bg-[#1d3015]',
  bodyText: 'text-[#4A4A4A] dark:text-[#e9e9e9]',
  border: '',
  pinkBg: 'bg-[#CD6C0C]',
  eventCard: 'bg-[#BACD32] dark:bg-[#2c3510] rounded-[16px] m-0.5 p-2 shadow-lg',
  favCard: 'bg-[#71AD44] dark:bg-[#1d3015] rounded-[16px] m-0.5 p-2 shadow-lg',
  shiftCard: 'bg-[#71AD44] dark:bg-[#1d3015] rounded-[16px] m-0.5 p-2',
  schedDay: 'mb-1.5 bg-[#71AD44] dark:bg-[#1d3015] rounded-2xl m-0.5 p-2',
  schedShift: 'rounded-[12px] m-0.5 p-[7px] bg-[#BACD32] dark:bg-[#2c3510]',
  schedEvent: 'rounded-[12px] m-0.5 p-[7px] bg-white dark:bg-[#22252d]',
  input:
    'p-[7px] m-0.5 rounded-xl font-bold text-[#4A4A4A] dark:text-[#e9e9e9] bg-white dark:bg-[#22252d]',
  navBtn: (active) =>
    `px-2.5 py-[7px] font-bold rounded-2xl m-0.5 transition-all ${active ? 'bg-[#4A4A4A] dark:bg-[#e9e9e9] text-white dark:text-[#181a20]' : 'bg-white dark:bg-[#22252d] text-[#4A4A4A] dark:text-[#e9e9e9] hover:bg-[#BACD32] dark:hover:bg-[#2c3510]'}`,
  btnPink:
    'bg-[#CD6C0C] text-white font-bold py-[7px] px-2.5 rounded-2xl m-0.5 hover:opacity-90 transition-all',
  btnCyan:
    'bg-[#71AD44] dark:bg-[#1d3015] text-white font-bold py-[7px] px-2.5 rounded-2xl m-0.5 hover:opacity-90 transition-all',
  // Same button, in-flight: color-only cue (orange) while the write lands. Copy is unchanged.
  btnCyanWorking:
    'bg-[#CD6C0C] text-white font-bold py-[7px] px-2.5 rounded-2xl m-0.5 opacity-90 transition-all cursor-wait',
  badge: 'bg-[#CD6C0C] text-white px-[3px] py-[1px] rounded-full text-sm font-bold m-0.5',
  favToggleOn:
    'p-[7px] rounded-2xl m-0.5 font-bold transition-all bg-[#CD6C0C] text-white hover:opacity-90',
  favToggleOff:
    'p-[7px] rounded-2xl m-0.5 font-bold transition-all bg-white dark:bg-[#22252d] text-[#4A4A4A] dark:text-[#e9e9e9] hover:bg-[#BACD32] dark:hover:bg-[#2c3510]',
  linkBtn:
    'p-[7px] bg-white dark:bg-[#22252d] text-[#4A4A4A] dark:text-[#e9e9e9] rounded-2xl m-0.5 hover:bg-[#BACD32] dark:hover:bg-[#2c3510] transition-all',
  noteArea:
    'w-full p-1.5 m-0.5 rounded-[4px] resize-none text-[16px] text-[#4A4A4A] dark:text-[#e9e9e9] bg-transparent border border-[#4A4A4A]/40 dark:border-[#e9e9e9]/30',
  deleteBtn: 'p-[7px] bg-[#B22222] text-white rounded-2xl m-0.5 hover:opacity-80 transition-all',
  deleteX: (pending) =>
    `px-0.5 py-[1px] rounded-full m-0.5 text-xs font-bold transition-all ${pending ? 'bg-[#B22222] text-white' : 'bg-white dark:bg-[#22252d] text-[#4A4A4A] dark:text-[#e9e9e9] hover:bg-[#B22222] hover:text-white'}`,
  noteBox: 'mt-0.5 p-1.5 bg-white dark:bg-[#22252d] rounded-lg m-0.5',
  shiftForm: 'bg-[#BACD32] dark:bg-[#2c3510] rounded-2xl m-0.5 p-2.5 mb-1.5',
  spinner: 'w-4 h-4 m-0.5 rounded-full animate-spin',
  readOnlyBanner:
    'mt-0.5 bg-white dark:bg-[#22252d] text-[#4A4A4A] dark:text-[#e9e9e9] px-[7px] py-1.5 rounded-lg text-sm font-bold m-0.5',
  // Callout at the bottom-left, locked to the Vibes switch height (60px, 28px up
  // from the bottom) with even padding so the two read as a balanced pair.
  signInCallout:
    'bg-[#181a20] text-white w-full sm:w-auto min-h-[60px] px-[16px] py-0.5 flex items-center gap-0.5 rounded-2xl shadow-2xl text-[11px] font-bold border border-white/20 text-balance leading-snug',
};

export const lineupTag = (event) => {
  const label = event.lineup?.id || 'music';
  return {
    label,
    color: event.lineup?.color || '#d7c57d',
    textColor: event.lineup?.textColor || '#000',
  };
};

// Light mode: full lineup color. Dark mode: the same hue mixed down into the dark
// surface (via the --lineup custom prop + a `dark:bg-[color-mix(...)]` class on the card).
export const eventCardStyle = (event) => ({ '--lineup': event.lineup?.color || '#d7c57d' });
export const eventCardBg =
  'bg-[var(--lineup)] dark:bg-[color-mix(in_oklab,var(--lineup)_36%,#14161b)]';

export const viewerTagStyle = {
  '--accent': '#CD6C0C',
  '--accent-text': '#fff',
  '--card-bg': 'rgba(255,255,255,0.85)',
  '--border': '#4A4A4A',
  '--text': '#4A4A4A',
  borderRadius: 999,
  fontWeight: 700,
  fontSize: 16,
};
