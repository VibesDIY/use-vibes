// Committed dark: both color schemes render the same near-black terminal look, so
// most roles carry a single value with no `dark:` variant. Neon green (#39ff14) is
// the working color — accents only (wordmark, active nav, fav-on, badges), always
// with dark text on top (white-on-neon fails contrast). Body text stays #e8e8e8 on
// every surface. Per-track colors come from the feed's tag palette and tint event
// cards via the --lineup custom prop.
export const c = {
  pageBg: "bg-[#0a0a0c]",
  cardBg: "bg-[#141419]",
  headerBg: "bg-[#000000]",
  navBg: "bg-[#101014]",
  bodyText: "text-[#e8e8e8]",
  border: "",
  accentBg: "bg-[#39ff14]",
  eventCard: "bg-[#141419] rounded-[16px] m-0.5 p-2 shadow-lg",
  favCard: "bg-[#141419] rounded-[16px] m-0.5 p-2 shadow-lg",
  shiftCard: "bg-[#141419] rounded-[16px] m-0.5 p-2",
  schedDay: "mb-1.5 bg-[#141419] rounded-2xl m-0.5 p-2",
  schedShift: "rounded-[12px] m-0.5 p-[7px] bg-[#1a1a20]",
  schedEvent: "rounded-[12px] m-0.5 p-[7px] bg-[#1a1a20]",
  input: "p-[7px] m-0.5 rounded-xl font-bold text-[#e8e8e8] bg-[#1a1a20]",
  navBtn: (active) =>
    `px-2.5 py-[7px] font-bold rounded-2xl m-0.5 transition-all ${active ? "bg-[#39ff14] text-[#0a0a0c]" : "bg-[#1a1a20] text-[#e8e8e8] hover:bg-[#26262e]"}`,
  btnAccent: "bg-[#39ff14] text-[#0a0a0c] font-bold py-[7px] px-2.5 rounded-2xl m-0.5 hover:opacity-90 transition-all",
  btnDim:
    "bg-[#1c1c22] border border-[#39ff14]/40 text-[#e8e8e8] font-bold py-[7px] px-2.5 rounded-2xl m-0.5 hover:opacity-90 transition-all",
  // Same button, in-flight: border-only cue (full neon) while the write lands. Copy is unchanged.
  btnDimWorking:
    "bg-[#1c1c22] border border-[#39ff14] text-[#e8e8e8] font-bold py-[7px] px-2.5 rounded-2xl m-0.5 opacity-90 transition-all cursor-wait",
  badge: "bg-[#39ff14] text-[#0a0a0c] px-[3px] py-[1px] rounded-full text-sm font-bold m-0.5",
  favToggleOn: "p-[7px] rounded-2xl m-0.5 font-bold transition-all bg-[#39ff14] text-[#0a0a0c] hover:opacity-90",
  favToggleOff: "p-[7px] rounded-2xl m-0.5 font-bold transition-all bg-[#1a1a20] text-[#e8e8e8] hover:bg-[#26262e]",
  linkBtn: "p-[7px] bg-[#1a1a20] text-[#e8e8e8] rounded-2xl m-0.5 hover:bg-[#26262e] transition-all",
  noteArea: "w-full p-1.5 m-0.5 rounded-[4px] resize-none text-[16px] text-[#e8e8e8] bg-transparent border border-[#e8e8e8]/30",
  deleteBtn: "p-[7px] bg-[#B22222] text-white rounded-2xl m-0.5 hover:opacity-80 transition-all",
  deleteX: (pending) =>
    `px-0.5 py-[1px] rounded-full m-0.5 text-xs font-bold transition-all ${pending ? "bg-[#B22222] text-white" : "bg-[#1a1a20] text-[#e8e8e8] hover:bg-[#B22222] hover:text-white"}`,
  noteBox: "mt-0.5 p-1.5 bg-[#1a1a20] rounded-lg m-0.5",
  shiftForm: "bg-[#141419] border border-[#39ff14]/20 rounded-2xl m-0.5 p-2.5 mb-1.5",
  spinner: "w-4 h-4 m-0.5 rounded-full animate-spin",
  readOnlyBanner: "mt-0.5 bg-[#1a1a20] text-[#e8e8e8] px-[7px] py-1.5 rounded-lg text-sm font-bold m-0.5",
  // Callout at the bottom-left, locked to the Vibes switch height (60px, 28px up
  // from the bottom) with even padding so the two read as a balanced pair.
  signInCallout:
    "bg-[#000000] text-[#e8e8e8] w-full sm:w-auto min-h-[60px] px-[16px] py-0.5 flex items-center gap-0.5 rounded-2xl shadow-2xl text-[11px] font-bold border border-[#39ff14]/40 text-balance leading-snug",
};

export const lineupTag = (event) => {
  const label = event.lineup?.id || "Event";
  return { label, color: event.lineup?.color || "#39ff14", textColor: event.lineup?.textColor || "#ffffff" };
};

// The feed ships the per-track palette; cards mix the track color down into the
// dark surface (via the --lineup custom prop) so it reads as a tint, not full-bleed
// — the same look in both color schemes (committed dark).
export const eventCardStyle = (event) => ({ "--lineup": event.lineup?.color || "#39ff14" });
export const eventCardBg = "bg-[color-mix(in_oklab,var(--lineup)_36%,#141419)]";

export const viewerTagStyle = {
  "--accent": "#39ff14",
  "--accent-text": "#0a0a0c",
  "--card-bg": "rgba(20,20,25,0.85)",
  "--border": "#39ff14",
  "--text": "#e8e8e8",
  borderRadius: 999,
  fontWeight: 700,
  fontSize: 16,
};
