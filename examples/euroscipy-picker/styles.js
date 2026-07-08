// Dark-mode palette is system-responsive via Tailwind's `dark:` (prefers-color-scheme).
// Every surface has a dimmed dark variant so a single light text flip (bodyText) reads
// everywhere. The look is scientific-Python: Python blue surfaces with one restrained
// yellow accent — and the yellow ALWAYS carries dark text (white on #FFD43B fails
// contrast), which is why the accent classes pair bg-[#FFD43B] with text-[#1a1a1a].
export const c = {
  pageBg: "bg-[#eef2f6] dark:bg-[#0c1116]",
  cardBg: "bg-white dark:bg-[#141b22]",
  headerBg: "bg-[#dbe7f3] dark:bg-[#101c2a]",
  navBg: "bg-[#306998] dark:bg-[#16324a]",
  bodyText: "text-[#22303c] dark:text-[#e4edf5]",
  border: "",
  accentBg: "bg-[#FFD43B]",
  eventCard: "bg-[#dbe7f3] dark:bg-[#101c2a] rounded-[16px] m-0.5 p-2 shadow-lg",
  favCard: "bg-[#e7eef6] dark:bg-[#15202b] rounded-[16px] m-0.5 p-2 shadow-lg",
  shiftCard: "bg-[#e7eef6] dark:bg-[#15202b] rounded-[16px] m-0.5 p-2",
  schedDay: "mb-1.5 bg-[#306998] dark:bg-[#16324a] rounded-2xl m-0.5 p-2",
  schedShift: "rounded-[12px] m-0.5 p-[7px] bg-[#dbe7f3] dark:bg-[#101c2a]",
  schedEvent: "rounded-[12px] m-0.5 p-[7px] bg-white dark:bg-[#15202b]",
  input: "p-[7px] m-0.5 rounded-xl font-bold text-[#22303c] dark:text-[#e4edf5] bg-white dark:bg-[#15202b]",
  navBtn: (active) =>
    `px-2.5 py-[7px] font-bold rounded-2xl m-0.5 transition-all ${active ? "bg-[#FFD43B] text-[#1a1a1a]" : "bg-white dark:bg-[#15202b] text-[#22303c] dark:text-[#e4edf5] hover:bg-[#dbe7f3] dark:hover:bg-[#101c2a]"}`,
  btnAccent: "bg-[#FFD43B] text-[#1a1a1a] font-bold py-[7px] px-2.5 rounded-2xl m-0.5 hover:opacity-90 transition-all",
  btnBlue: "bg-[#4B8BBE] dark:bg-[#1d3a55] text-white font-bold py-[7px] px-2.5 rounded-2xl m-0.5 hover:opacity-90 transition-all",
  // Same button, in-flight: color-only cue (yellow) while the write lands. Copy is unchanged.
  btnBlueWorking: "bg-[#FFD43B] text-[#1a1a1a] font-bold py-[7px] px-2.5 rounded-2xl m-0.5 opacity-90 transition-all cursor-wait",
  badge: "bg-[#FFD43B] text-[#1a1a1a] px-[3px] py-[1px] rounded-full text-sm font-bold m-0.5",
  favToggleOn: "p-[7px] rounded-2xl m-0.5 font-bold transition-all bg-[#FFD43B] text-[#1a1a1a] hover:opacity-90",
  favToggleOff:
    "p-[7px] rounded-2xl m-0.5 font-bold transition-all bg-white dark:bg-[#15202b] text-[#22303c] dark:text-[#e4edf5] hover:bg-[#dbe7f3] dark:hover:bg-[#101c2a]",
  linkBtn:
    "p-[7px] bg-white dark:bg-[#15202b] text-[#22303c] dark:text-[#e4edf5] rounded-2xl m-0.5 hover:bg-[#dbe7f3] dark:hover:bg-[#101c2a] transition-all",
  noteArea:
    "w-full p-1.5 m-0.5 rounded-[4px] resize-none text-[16px] text-[#22303c] dark:text-[#e4edf5] bg-transparent border border-[#22303c]/40 dark:border-[#e4edf5]/30",
  deleteBtn: "p-[7px] bg-[#B22222] text-white rounded-2xl m-0.5 hover:opacity-80 transition-all",
  deleteX: (pending) =>
    `px-0.5 py-[1px] rounded-full m-0.5 text-xs font-bold transition-all ${pending ? "bg-[#B22222] text-white" : "bg-white dark:bg-[#15202b] text-[#22303c] dark:text-[#e4edf5] hover:bg-[#B22222] hover:text-white"}`,
  noteBox: "mt-0.5 p-1.5 bg-white dark:bg-[#15202b] rounded-lg m-0.5",
  shiftForm: "bg-[#dbe7f3] dark:bg-[#101c2a] rounded-2xl m-0.5 p-2.5 mb-1.5",
  spinner: "w-4 h-4 m-0.5 rounded-full animate-spin",
  readOnlyBanner:
    "mt-0.5 bg-white dark:bg-[#15202b] text-[#22303c] dark:text-[#e4edf5] px-[7px] py-1.5 rounded-lg text-sm font-bold m-0.5",
  // Callout at the bottom-left, locked to the Vibes switch height (60px, 28px up
  // from the bottom) with even padding so the two read as a balanced pair.
  signInCallout:
    "bg-[#141b22] text-white w-full sm:w-auto min-h-[60px] px-[16px] py-0.5 flex items-center gap-0.5 rounded-2xl shadow-2xl text-[11px] font-bold border border-white/20 text-balance leading-snug",
};

export const lineupTag = (event) => {
  const label = event.lineup?.id || "General";
  return { label, color: event.lineup?.color || "#306998", textColor: event.lineup?.textColor || "#fff" };
};

// Track colors are saturated brand hues, so cards TINT rather than fill: the hue is
// mixed into the light/dark card base (via the --lineup custom prop) so bodyText
// stays readable on every track color.
export const eventCardStyle = (event) => ({ "--lineup": event.lineup?.color || "#306998" });
export const eventCardBg =
  "bg-[color-mix(in_oklab,var(--lineup)_18%,white)] dark:bg-[color-mix(in_oklab,var(--lineup)_36%,#141b22)]";

export const viewerTagStyle = {
  "--accent": "#FFD43B",
  "--accent-text": "#1a1a1a",
  "--card-bg": "rgba(255,255,255,0.85)",
  "--border": "#22303c",
  "--text": "#22303c",
  borderRadius: 999,
  fontWeight: 700,
  fontSize: 16,
};
