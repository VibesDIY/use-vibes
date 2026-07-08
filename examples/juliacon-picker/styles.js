// Dark-mode palette is system-responsive via Tailwind's `dark:` (prefers-color-scheme).
// Every surface has a dimmed dark variant so a single light text flip (bodyText) reads
// everywhere. Julia-brand roles: white surfaces with purple/green tints, Julia red
// (#CB3C33) as the primary action/fav accent, purple (#9558B2) as the secondary button.
export const c = {
  pageBg: "bg-[#f4f2f7] dark:bg-[#0f0e13]",
  cardBg: "bg-white dark:bg-[#18161f]",
  headerBg: "bg-[#ece4f3] dark:bg-[#241a2e]",
  navBg: "bg-[#389826] dark:bg-[#173d10]",
  bodyText: "text-[#2a2a2a] dark:text-[#ece9f1]",
  border: "",
  pinkBg: "bg-[#CB3C33]",
  eventCard: "bg-[#ece4f3] dark:bg-[#241a2e] rounded-[16px] m-0.5 p-2 shadow-lg",
  favCard: "bg-[#e3f1de] dark:bg-[#1a2b15] rounded-[16px] m-0.5 p-2 shadow-lg",
  shiftCard: "bg-[#e3f1de] dark:bg-[#1a2b15] rounded-[16px] m-0.5 p-2",
  schedDay: "mb-1.5 bg-[#e3f1de] dark:bg-[#1a2b15] rounded-2xl m-0.5 p-2",
  schedShift: "rounded-[12px] m-0.5 p-[7px] bg-[#ece4f3] dark:bg-[#241a2e]",
  schedEvent: "rounded-[12px] m-0.5 p-[7px] bg-white dark:bg-[#262031]",
  input: "p-[7px] m-0.5 rounded-xl font-bold text-[#2a2a2a] dark:text-[#ece9f1] bg-white dark:bg-[#262031]",
  navBtn: (active) =>
    `px-2.5 py-[7px] font-bold rounded-2xl m-0.5 transition-all ${active ? "bg-[#2a2a2a] dark:bg-[#ece9f1] text-white dark:text-[#18161f]" : "bg-white dark:bg-[#262031] text-[#2a2a2a] dark:text-[#ece9f1] hover:bg-[#ece4f3] dark:hover:bg-[#241a2e]"}`,
  btnPink: "bg-[#CB3C33] text-white font-bold py-[7px] px-2.5 rounded-2xl m-0.5 hover:opacity-90 transition-all",
  btnCyan: "bg-[#9558B2] dark:bg-[#3a2545] text-white font-bold py-[7px] px-2.5 rounded-2xl m-0.5 hover:opacity-90 transition-all",
  // Same button, in-flight: color-only cue (red) while the write lands. Copy is unchanged.
  btnCyanWorking: "bg-[#CB3C33] text-white font-bold py-[7px] px-2.5 rounded-2xl m-0.5 opacity-90 transition-all cursor-wait",
  badge: "bg-[#CB3C33] text-white px-[3px] py-[1px] rounded-full text-sm font-bold m-0.5",
  favToggleOn: "p-[7px] rounded-2xl m-0.5 font-bold transition-all bg-[#CB3C33] text-white hover:opacity-90",
  favToggleOff:
    "p-[7px] rounded-2xl m-0.5 font-bold transition-all bg-white dark:bg-[#262031] text-[#2a2a2a] dark:text-[#ece9f1] hover:bg-[#ece4f3] dark:hover:bg-[#241a2e]",
  linkBtn:
    "p-[7px] bg-white dark:bg-[#262031] text-[#2a2a2a] dark:text-[#ece9f1] rounded-2xl m-0.5 hover:bg-[#ece4f3] dark:hover:bg-[#241a2e] transition-all",
  noteArea:
    "w-full p-1.5 m-0.5 rounded-[4px] resize-none text-[16px] text-[#2a2a2a] dark:text-[#ece9f1] bg-transparent border border-[#2a2a2a]/40 dark:border-[#ece9f1]/30",
  deleteBtn: "p-[7px] bg-[#B22222] text-white rounded-2xl m-0.5 hover:opacity-80 transition-all",
  deleteX: (pending) =>
    `px-0.5 py-[1px] rounded-full m-0.5 text-xs font-bold transition-all ${pending ? "bg-[#B22222] text-white" : "bg-white dark:bg-[#262031] text-[#2a2a2a] dark:text-[#ece9f1] hover:bg-[#B22222] hover:text-white"}`,
  noteBox: "mt-0.5 p-1.5 bg-white dark:bg-[#262031] rounded-lg m-0.5",
  shiftForm: "bg-[#ece4f3] dark:bg-[#241a2e] rounded-2xl m-0.5 p-2.5 mb-1.5",
  spinner: "w-4 h-4 m-0.5 rounded-full animate-spin",
  readOnlyBanner:
    "mt-0.5 bg-white dark:bg-[#262031] text-[#2a2a2a] dark:text-[#ece9f1] px-[7px] py-1.5 rounded-lg text-sm font-bold m-0.5",
  // Callout at the bottom-left, locked to the Vibes switch height (60px, 28px up
  // from the bottom) with even padding so the two read as a balanced pair.
  signInCallout:
    "bg-[#18161f] text-white w-full sm:w-auto min-h-[60px] px-[16px] py-0.5 flex items-center gap-0.5 rounded-2xl shadow-2xl text-[11px] font-bold border border-white/20 text-balance leading-snug",
};

export const lineupTag = (event) => {
  const label = event.lineup?.id || "General";
  // Track colors are the saturated Julia brand cycle — all dark enough for white text.
  return { label, color: event.lineup?.color || "#9558B2", textColor: event.lineup?.textColor || "#fff" };
};

// The track color TINTS the card, never floods it: mixed toward white in light mode
// and into the dark surface in dark mode (via the --lineup custom prop + the
// `color-mix` classes on the card). Full-strength track colors live in the tag pills.
export const eventCardStyle = (event) => ({ "--lineup": event.lineup?.color || "#9558B2" });
export const eventCardBg =
  "bg-[color-mix(in_oklab,var(--lineup)_14%,white)] dark:bg-[color-mix(in_oklab,var(--lineup)_32%,#141218)]";

export const viewerTagStyle = {
  "--accent": "#CB3C33",
  "--accent-text": "#fff",
  "--card-bg": "rgba(255,255,255,0.85)",
  "--border": "#2a2a2a",
  "--text": "#2a2a2a",
  borderRadius: 999,
  fontWeight: 700,
  fontSize: 16,
};
