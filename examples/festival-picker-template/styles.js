// The skin is BUILT, not written: `makeC(FESTIVAL.colors)` takes the five base colors
// from festival-config.js and derives every surface from them, so an instantiation
// re-skins the whole app by editing that one config file.
//
// Dark-mode variants are system-responsive via Tailwind's `dark:`
// (prefers-color-scheme) and are derived too — each surface is its light color mixed
// down into the dark base, which keeps the festival's hue identity in both modes.
// Arbitrary Tailwind values may not contain spaces, hence the underscores in
// `color-mix(in_oklab,…)`.
const DARK_BASE = '#14161b';
const DARK_TEXT = '#e9e9e9';
const DESTRUCTIVE = '#B22222';
const mix = (a, pct, b) => `color-mix(in_oklab,${a}_${pct}%,${b})`;

export const makeC = ({ bg, card, accent, text, muted }) => {
  // Two accent washes carry the layout: `band` for the header/event cards, the
  // stronger `deep` for the nav and day sections.
  const band = mix(accent, 22, card);
  const bandDark = mix(accent, 26, DARK_BASE);
  const deep = mix(accent, 40, card);
  const deepDark = mix(accent, 16, DARK_BASE);
  const surface = mix(card, 12, DARK_BASE);
  const bandBg = `bg-[${band}] dark:bg-[${bandDark}]`;
  const deepBg = `bg-[${deep}] dark:bg-[${deepDark}]`;
  const cardSurface = `bg-[${card}] dark:bg-[${surface}]`;
  const bodyTone = `text-[${text}] dark:text-[${DARK_TEXT}]`;
  const hoverBand = `hover:bg-[${band}] dark:hover:bg-[${bandDark}]`;

  return {
    pageBg: `bg-[${mix(bg, 94, text)}] dark:bg-[${mix(bg, 8, DARK_BASE)}]`,
    cardBg: cardSurface,
    headerBg: bandBg,
    navBg: deepBg,
    bodyText: bodyTone,
    border: '',
    pinkBg: `bg-[${accent}]`,
    eventCard: `${bandBg} rounded-[16px] m-0.5 p-2 shadow-lg`,
    favCard: `${deepBg} rounded-[16px] m-0.5 p-2 shadow-lg`,
    shiftCard: `${deepBg} rounded-[16px] m-0.5 p-2`,
    schedDay: `mb-1.5 ${deepBg} rounded-2xl m-0.5 p-2`,
    schedShift: `rounded-[12px] m-0.5 p-[7px] ${bandBg}`,
    schedEvent: `rounded-[12px] m-0.5 p-[7px] ${cardSurface}`,
    input: `p-[7px] m-0.5 rounded-xl font-bold ${bodyTone} ${cardSurface}`,
    navBtn: (active) =>
      `px-2.5 py-[7px] font-bold rounded-2xl m-0.5 transition-all ${active ? `bg-[${text}] dark:bg-[${DARK_TEXT}] text-[${card}] dark:text-[${DARK_BASE}]` : `${cardSurface} ${bodyTone} ${hoverBand}`}`,
    btnPink: `bg-[${accent}] text-white font-bold py-[7px] px-2.5 rounded-2xl m-0.5 hover:opacity-90 transition-all`,
    btnCyan: `${deepBg} ${bodyTone} font-bold py-[7px] px-2.5 rounded-2xl m-0.5 hover:opacity-90 transition-all`,
    // Same button, in-flight: color-only cue (full accent) while the write lands. Copy is unchanged.
    btnCyanWorking: `bg-[${accent}] text-white font-bold py-[7px] px-2.5 rounded-2xl m-0.5 opacity-90 transition-all cursor-wait`,
    badge: `bg-[${accent}] text-white px-[3px] py-[1px] rounded-full text-sm font-bold m-0.5`,
    favToggleOn: `p-[7px] rounded-2xl m-0.5 font-bold transition-all bg-[${accent}] text-white hover:opacity-90`,
    favToggleOff: `p-[7px] rounded-2xl m-0.5 font-bold transition-all ${cardSurface} ${bodyTone} ${hoverBand}`,
    linkBtn: `p-[7px] ${cardSurface} ${bodyTone} rounded-2xl m-0.5 ${hoverBand} transition-all`,
    noteArea: `w-full p-1.5 m-0.5 rounded-[4px] resize-none text-[16px] ${bodyTone} bg-transparent border border-[${muted}]`,
    deleteBtn: `p-[7px] bg-[${DESTRUCTIVE}] text-white rounded-2xl m-0.5 hover:opacity-80 transition-all`,
    deleteX: (pending) =>
      `px-0.5 py-[1px] rounded-full m-0.5 text-xs font-bold transition-all ${pending ? `bg-[${DESTRUCTIVE}] text-white` : `${cardSurface} ${bodyTone} hover:bg-[${DESTRUCTIVE}] hover:text-white`}`,
    noteBox: `mt-0.5 p-1.5 ${cardSurface} rounded-lg m-0.5`,
    shiftForm: `${bandBg} rounded-2xl m-0.5 p-2.5 mb-1.5`,
    spinner: 'w-4 h-4 m-0.5 rounded-full animate-spin',
    readOnlyBanner: `mt-0.5 ${cardSurface} ${bodyTone} px-[7px] py-1.5 rounded-lg text-sm font-bold m-0.5`,
    // Callout at the bottom-left, locked to the Vibes switch height (60px, 28px up
    // from the bottom) with even padding so the two read as a balanced pair.
    signInCallout: `bg-[${DARK_BASE}] text-white w-full sm:w-auto min-h-[60px] px-[16px] py-0.5 flex items-center gap-0.5 rounded-2xl shadow-2xl text-[11px] font-bold border border-white/20 text-balance leading-snug`,
    // The header's decorative ridge, in two accent depths.
    ridgeBack: `fill-[${mix(accent, 55, text)}] dark:fill-[${mix(accent, 12, DARK_BASE)}]`,
    ridgeFront: `fill-[${deep}] dark:fill-[${deepDark}]`,
  };
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

export const makeViewerTagStyle = ({ card, accent, text }) => ({
  '--accent': accent,
  '--accent-text': '#fff',
  '--card-bg': card,
  '--border': text,
  '--text': text,
  borderRadius: 999,
  fontWeight: 700,
  fontSize: 16,
});
