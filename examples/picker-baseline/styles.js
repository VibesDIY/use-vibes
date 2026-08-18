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
  shiftCard: 'bg-[#71AD44] dark:bg-[#1d3015] rounded-[16px] m-0.5 p-2',
  schedDay: 'mb-1.5 bg-[#71AD44] dark:bg-[#1d3015] rounded-2xl m-0.5 p-2',
  schedShift: 'rounded-[12px] m-0.5 p-[7px] bg-[#BACD32] dark:bg-[#2c3510]',
  input:
    'p-[7px] m-0.5 rounded-xl font-bold text-[#4A4A4A] dark:text-[#e9e9e9] bg-white dark:bg-[#22252d]',
  navBtn: (active) =>
    `px-2.5 py-[7px] font-bold rounded-2xl m-0.5 transition-all ${active ? 'bg-[#4A4A4A] dark:bg-[#e9e9e9] text-white dark:text-[#181a20]' : 'bg-white dark:bg-[#22252d] text-[#4A4A4A] dark:text-[#e9e9e9] hover:bg-[#BACD32] dark:hover:bg-[#2c3510]'}`,
  btnPink:
    'bg-[#CD6C0C] text-white font-bold py-[7px] px-2.5 rounded-2xl m-0.5 hover:opacity-90 transition-all',
  btnCyan:
    'bg-[#71AD44] dark:bg-[#1d3015] text-white font-bold py-[7px] px-2.5 rounded-2xl m-0.5 hover:opacity-90 transition-all',
  // Understated reverser (turn pick-sharing back off). Deliberately not a button
  // shape: undoing a share you chose should be findable, never a competing CTA.
  quietLink: (busy) =>
    `text-sm font-bold underline underline-offset-2 opacity-70 hover:opacity-100 transition-all text-[#4A4A4A] dark:text-[#e9e9e9] ${busy ? 'opacity-40 cursor-wait' : ''}`,
  // In-flight state for any action button: grey + desaturated + wait cursor, so it
  // reads as "working" rather than a hover effect (hover is opacity-only).
  btnWorking:
    'bg-[#8b9083] text-white/85 font-bold py-[7px] px-2.5 rounded-2xl m-0.5 saturate-50 transition-all cursor-wait',
  badge: 'bg-[#CD6C0C] text-white px-[3px] py-[1px] rounded-full text-sm font-bold m-0.5',
  // Load shedding (loadshed.js): appended to a write control that is temporarily
  // INERT rather than hidden — your pick state must stay legible even while you
  // can't change it. Same vocabulary as btnWorking (desaturate + a cursor that
  // says "not now"), so it reads as a state of the app, not a broken button.
  shedInert: 'opacity-60 saturate-50 cursor-not-allowed',
  favToggleOn:
    'p-[7px] rounded-2xl m-0.5 font-bold transition-all bg-[#CD6C0C] text-white hover:opacity-90',
  favToggleOff:
    'p-[7px] rounded-2xl m-0.5 font-bold transition-all bg-white dark:bg-[#22252d] text-[#4A4A4A] dark:text-[#e9e9e9] hover:bg-[#BACD32] dark:hover:bg-[#2c3510]',
  linkBtn:
    'p-[7px] bg-white dark:bg-[#22252d] text-[#4A4A4A] dark:text-[#e9e9e9] rounded-2xl m-0.5 hover:bg-[#BACD32] dark:hover:bg-[#2c3510] transition-all',
  // Same mark as linkBtn, but no pill: on a card that already carries a round
  // heart button, a second circle reads as a second toggle. Plain text color on
  // transparent so the artist link reads as a link, not a control.
  linkPlain:
    'p-[7px] bg-transparent text-[#4A4A4A] dark:text-[#e9e9e9] m-0.5 hover:opacity-70 transition-all',
  noteArea:
    'w-full p-1.5 m-0.5 rounded-[4px] resize-none text-[16px] text-[#4A4A4A] dark:text-[#e9e9e9] bg-transparent border border-[#4A4A4A]/40 dark:border-[#e9e9e9]/30',
  deleteBtn: 'p-[7px] bg-[#B22222] text-white rounded-2xl m-0.5 hover:opacity-80 transition-all',
  deleteX: (pending) =>
    `px-0.5 py-[1px] rounded-full m-0.5 text-xs font-bold transition-all ${pending ? 'bg-[#B22222] text-white' : 'bg-white dark:bg-[#22252d] text-[#4A4A4A] dark:text-[#e9e9e9] hover:bg-[#B22222] hover:text-white'}`,
  noteBox: 'mt-0.5 p-1.5 bg-white dark:bg-[#22252d] rounded-lg m-0.5',
  shiftForm: 'bg-[#BACD32] dark:bg-[#2c3510] rounded-2xl m-0.5 p-2.5 mb-1.5',
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
