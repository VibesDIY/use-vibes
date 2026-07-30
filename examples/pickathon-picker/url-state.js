// Deep-link / address-bar state. Extracted from App.jsx so it can be tested without a
// browser: every function takes the window to act on, defaulting to the real one.
//
// A profile link arrives as `#friend=<handle>` on the vibes.diy URL (hash keeps the
// platform HTML cache warm — query params bypass it and pay full SSR every visit).
// The platform forwards the host hash into the iframe and mirrors our replaceState
// back to the address bar, which makes the fragment ordinary shareable navigation
// state, not a one-time secret: it names whose PROFILE is open, so it stays in the
// URL while the profile is up and is removed when it closes. Copying the address bar
// re-shares a profile view, which is exactly what the QR does. `?friend=` is kept as
// a fallback for QR codes printed before the hash migration.
const defaultWindow = () => (typeof window === 'undefined' ? undefined : window);

// Hash first, then this frame's query, then the host frame (cross-origin in
// production, so that last read usually throws and is deliberately swallowed).
export const readFriendParam = (win = defaultWindow()) => {
  if (!win) return null;
  try {
    const fromHash = new URLSearchParams((win.location.hash || '').slice(1)).get('friend');
    if (fromHash) return fromHash;
    const own = new URLSearchParams(win.location.search).get('friend');
    if (own) return own;
  } catch (e) {}
  try {
    if (win.top && win.top !== win) {
      const t = win.top.location;
      return (
        new URLSearchParams((t.hash || '').slice(1)).get('friend') ||
        new URLSearchParams(t.search).get('friend')
      );
    }
  } catch (e) {}
  return null;
};

// Mirror the open profile into the URL (`handle`), or clear it (`null`). Always drops
// the legacy `?friend=` query so a QR printed before the hash migration lands the
// visitor on the canonical hash form — what they copy is what we want re-shared.
// Other hash params (e.g. `super=1`) are preserved.
export const writeFriendParamToUrl = (handle, win = defaultWindow()) => {
  if (!win) return;
  const apply = (loc, hist) => {
    try {
      const u = new URL(loc.href);
      const h = new URLSearchParams((u.hash || '').slice(1));
      if (handle) h.set('friend', handle);
      else h.delete('friend');
      u.searchParams.delete('friend');
      const hs = h.toString();
      hist.replaceState(null, '', u.pathname + u.search + (hs ? '#' + hs : ''));
    } catch (e) {}
  };
  // The platform mirrors this replaceState up to the vibes.diy address bar.
  apply(win.location, win.history);
  // The parent vibes.diy URL is cross-origin, so this usually no-ops — best effort.
  try {
    if (win.top && win.top !== win) apply(win.top.location, win.top.history);
  } catch (e) {}
};

// QA scaffolding that ships harmlessly: `#now=2026-07-31T20:00` (or `?now=`) makes the
// Now tab reason from that instant instead of the wall clock, so the on-site view can be
// checked (and screenshotted) before the festival starts. Nothing is written, and an end
// user who sets it only time-travels their own Now tab.
export const readNowParam = (win = defaultWindow()) => {
  if (!win) return null;
  try {
    const fromHash = new URLSearchParams((win.location.hash || '').slice(1)).get('now');
    if (fromHash) return fromHash;
    const own = new URLSearchParams(win.location.search).get('now');
    if (own) return own;
  } catch (e) {}
  return null;
};

// Super mode is an easter egg, so it reads the HOST url when reachable and falls back
// to this frame's — the opposite preference order from the friend param, which the
// platform forwards inward.
export const readSuperParam = (win = defaultWindow()) => {
  const on = (loc) =>
    new URLSearchParams(loc.search).get('super') === '1' ||
    new URLSearchParams((loc.hash || '').slice(1)).get('super') === '1';
  if (!win) return false;
  try {
    const w = win.top && win.top !== win ? win.top : win;
    return on(w.location);
  } catch (e) {
    try {
      return on(win.location);
    } catch (e2) {
      return false;
    }
  }
};
