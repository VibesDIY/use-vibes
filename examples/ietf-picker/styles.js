// Datatracker utilitarianism: information-dense white surfaces, blue as the working
// color, amber for the primary action, per-area color chips. Dark mode is
// system-responsive via Tailwind's `dark:` (prefers-color-scheme) — every surface
// has a dimmed dark variant so a single light text flip (bodyText) reads everywhere.
export const c = {
  pageBg: 'bg-[#f1f4f8] dark:bg-[#0d1117]',
  cardBg: 'bg-white dark:bg-[#161b22]',
  headerBg: 'bg-[#e9eef5] dark:bg-[#101826]',
  navBg: 'bg-[#205a9e] dark:bg-[#132f4f]',
  bodyText: 'text-[#1f2328] dark:text-[#e6edf3]',
  border: '',
  pinkBg: 'bg-[#b45309]',
  eventCard: 'bg-[#e9eef5] dark:bg-[#101826] rounded-lg m-0.5 p-2 shadow-lg',
  favCard: 'bg-[#e9eef5] dark:bg-[#101826] rounded-lg m-0.5 p-2 shadow-lg',
  shiftCard: 'bg-[#e9eef5] dark:bg-[#101826] rounded-lg m-0.5 p-2',
  schedDay: 'mb-1.5 bg-[#205a9e] dark:bg-[#132f4f] rounded-lg m-0.5 p-2',
  schedShift: 'rounded-md m-0.5 p-[7px] bg-[#e9eef5] dark:bg-[#101826]',
  schedEvent: 'rounded-md m-0.5 p-[7px] bg-white dark:bg-[#21262d]',
  input:
    'p-[7px] m-0.5 rounded-md font-bold text-[#1f2328] dark:text-[#e6edf3] bg-white dark:bg-[#21262d]',
  navBtn: (active) =>
    `px-2.5 py-[7px] font-bold rounded-lg m-0.5 transition-all ${active ? 'bg-[#1f2328] dark:bg-[#e6edf3] text-white dark:text-[#161b22]' : 'bg-white dark:bg-[#21262d] text-[#1f2328] dark:text-[#e6edf3] hover:bg-[#e9eef5] dark:hover:bg-[#101826]'}`,
  btnPink:
    'bg-[#b45309] text-white font-bold py-[7px] px-2.5 rounded-lg m-0.5 hover:opacity-90 transition-all',
  btnCyan:
    'bg-[#205a9e] dark:bg-[#132f4f] text-white font-bold py-[7px] px-2.5 rounded-lg m-0.5 hover:opacity-90 transition-all',
  // Same button, in-flight: color-only cue (amber) while the write lands. Copy is unchanged.
  btnCyanWorking:
    'bg-[#b45309] text-white font-bold py-[7px] px-2.5 rounded-lg m-0.5 opacity-90 transition-all cursor-wait',
  badge: 'bg-[#b45309] text-white px-[3px] py-[1px] rounded-full text-sm font-bold m-0.5',
  favToggleOn:
    'p-[7px] rounded-lg m-0.5 font-bold transition-all bg-[#b45309] text-white hover:opacity-90',
  favToggleOff:
    'p-[7px] rounded-lg m-0.5 font-bold transition-all bg-white dark:bg-[#21262d] text-[#1f2328] dark:text-[#e6edf3] hover:bg-[#e9eef5] dark:hover:bg-[#101826]',
  linkBtn:
    'p-[7px] bg-white dark:bg-[#21262d] text-[#1f2328] dark:text-[#e6edf3] rounded-lg m-0.5 hover:bg-[#e9eef5] dark:hover:bg-[#101826] transition-all',
  noteArea:
    'w-full p-1.5 m-0.5 rounded-[4px] resize-none text-[16px] text-[#1f2328] dark:text-[#e6edf3] bg-transparent border border-[#1f2328]/40 dark:border-[#e6edf3]/30',
  deleteBtn: 'p-[7px] bg-[#B22222] text-white rounded-lg m-0.5 hover:opacity-80 transition-all',
  deleteX: (pending) =>
    `px-0.5 py-[1px] rounded-full m-0.5 text-xs font-bold transition-all ${pending ? 'bg-[#B22222] text-white' : 'bg-white dark:bg-[#21262d] text-[#1f2328] dark:text-[#e6edf3] hover:bg-[#B22222] hover:text-white'}`,
  noteBox: 'mt-0.5 p-1.5 bg-white dark:bg-[#21262d] rounded-lg m-0.5',
  shiftForm: 'bg-[#e9eef5] dark:bg-[#101826] rounded-lg m-0.5 p-2.5 mb-1.5',
  spinner: 'w-4 h-4 m-0.5 rounded-full animate-spin',
  readOnlyBanner:
    'mt-0.5 bg-white dark:bg-[#21262d] text-[#1f2328] dark:text-[#e6edf3] px-[7px] py-1.5 rounded-lg text-sm font-bold m-0.5',
  // Callout at the bottom-left, locked to the Vibes switch height (60px, 28px up
  // from the bottom) with even padding so the two read as a balanced pair.
  signInCallout:
    'bg-[#1f2328] text-white w-full sm:w-auto min-h-[60px] px-[16px] py-0.5 flex items-center gap-0.5 rounded-lg shadow-2xl text-[11px] font-bold border border-white/20 text-balance leading-snug',
};

// Area colors are dark, saturated hues, so chips default to white text.
export const lineupTag = (event) => {
  const label = event.lineup?.id || 'other';
  return {
    label,
    color: event.lineup?.color || '#34495e',
    textColor: event.lineup?.textColor || '#fff',
  };
};

// Cards tint by area via the --lineup custom prop. The area hues are too dark to
// carry body text at full strength, so BOTH modes mix them down: toward white on
// light surfaces, into the dark surface in dark mode.
export const eventCardStyle = (event) => ({ '--lineup': event.lineup?.color || '#34495e' });
export const eventCardBg =
  'bg-[color-mix(in_oklab,var(--lineup)_16%,white)] dark:bg-[color-mix(in_oklab,var(--lineup)_32%,#11161d)]';

export const viewerTagStyle = {
  '--accent': '#b45309',
  '--accent-text': '#fff',
  '--card-bg': 'rgba(255,255,255,0.85)',
  '--border': '#1f2328',
  '--text': '#1f2328',
  borderRadius: 999,
  fontWeight: 700,
  fontSize: 16,
};
