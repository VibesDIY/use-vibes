import { describe, it, expect } from 'vitest';
import { readFriendParam, writeFriendParamToUrl, readSuperParam, readNowParam } from './url-state.js';

// A stand-in for window/window.top: enough Location + History surface for the helpers,
// with replaceState actually rewriting the location so a set→clear round trip is
// observable. `throws` models the cross-origin frame, where reading .location throws.
const frame = (href) => {
  const f = { calls: [] };
  const set = (h) => {
    const u = new URL(h, 'https://vibes.diy');
    f.location = { href: u.href, hash: u.hash, search: u.search, pathname: u.pathname };
  };
  set(href);
  f.history = {
    replaceState: (_s, _t, url) => {
      f.calls.push(url);
      set(new URL(url, f.location.href).href);
    },
  };
  return f;
};

const win = (href, topHref) => {
  const w = frame(href);
  w.top = topHref === undefined ? w : topHref === 'cross-origin' ? crossOrigin() : frame(topHref);
  return w;
};

const crossOrigin = () => ({
  get location() {
    throw new Error('cross-origin');
  },
  get history() {
    throw new Error('cross-origin');
  },
});

describe('readFriendParam', () => {
  it('reads the hash form', () => {
    expect(readFriendParam(win('https://vibes.diy/vibe/qa/p#friend=alice'))).toBe('alice');
  });

  it('falls back to the legacy query form', () => {
    expect(readFriendParam(win('https://vibes.diy/vibe/qa/p?friend=bob'))).toBe('bob');
  });

  it('prefers the hash when both are present', () => {
    expect(readFriendParam(win('https://vibes.diy/p?friend=bob#friend=alice'))).toBe('alice');
  });

  it('ignores unrelated params', () => {
    expect(readFriendParam(win('https://vibes.diy/p#super=1'))).toBe(null);
  });

  it('decodes a percent-encoded handle', () => {
    expect(readFriendParam(win('https://vibes.diy/p#friend=a%20b'))).toBe('a b');
  });

  it('falls through to the host frame when this frame has nothing', () => {
    expect(readFriendParam(win('https://sandbox/app', 'https://vibes.diy/v#friend=carol'))).toBe(
      'carol'
    );
  });

  it('swallows a cross-origin host frame and reports nothing', () => {
    expect(readFriendParam(win('https://sandbox/app', 'cross-origin'))).toBe(null);
  });

  it('returns null with no window at all', () => {
    expect(readFriendParam(undefined)).toBe(null);
  });
});

describe('writeFriendParamToUrl', () => {
  it('sets the hash form', () => {
    const w = win('https://vibes.diy/vibe/qa/p');
    writeFriendParamToUrl('alice', w);
    expect(w.calls.at(-1)).toBe('/vibe/qa/p#friend=alice');
  });

  it('switches an already-open profile in place', () => {
    const w = win('https://vibes.diy/vibe/qa/p#friend=alice');
    writeFriendParamToUrl('bob', w);
    expect(w.calls.at(-1)).toBe('/vibe/qa/p#friend=bob');
  });

  it('clears the fragment on close', () => {
    const w = win('https://vibes.diy/vibe/qa/p#friend=alice');
    writeFriendParamToUrl(null, w);
    expect(w.calls.at(-1)).toBe('/vibe/qa/p');
  });

  it('normalizes the legacy query form to the hash form', () => {
    const w = win('https://vibes.diy/vibe/qa/p?friend=bob');
    writeFriendParamToUrl('bob', w);
    expect(w.calls.at(-1)).toBe('/vibe/qa/p#friend=bob');
  });

  it('preserves other hash params', () => {
    const w = win('https://vibes.diy/p#super=1');
    writeFriendParamToUrl('alice', w);
    expect(w.calls.at(-1)).toBe('/p#super=1&friend=alice');
    writeFriendParamToUrl(null, w);
    expect(w.calls.at(-1)).toBe('/p#super=1');
  });

  it('preserves other query params', () => {
    const w = win('https://vibes.diy/p?utm=x');
    writeFriendParamToUrl('alice', w);
    expect(w.calls.at(-1)).toBe('/p?utm=x#friend=alice');
  });

  it('best-efforts the host frame and never throws on a cross-origin one', () => {
    const w = win('https://sandbox/app', 'cross-origin');
    expect(() => writeFriendParamToUrl('alice', w)).not.toThrow();
    expect(w.calls.at(-1)).toBe('/app#friend=alice');
  });

  it('mirrors into a same-origin host frame too', () => {
    const w = win('https://vibes.diy/app', 'https://vibes.diy/vibe/qa/p');
    writeFriendParamToUrl('alice', w);
    expect(w.top.calls.at(-1)).toBe('/vibe/qa/p#friend=alice');
  });
});

// The hash IS the open-profile state, so what the sync callback reads back is what the
// app shows: present → open/switch, absent → closed.
describe('hash sync semantics', () => {
  it('round-trips open → switch → close', () => {
    const w = win('https://vibes.diy/vibe/qa/p');
    writeFriendParamToUrl('alice', w);
    expect(readFriendParam(w)).toBe('alice');
    writeFriendParamToUrl('bob', w);
    expect(readFriendParam(w)).toBe('bob');
    writeFriendParamToUrl(null, w);
    expect(readFriendParam(w)).toBe(null);
  });
});

describe('readSuperParam', () => {
  it('reads ?super=1 and #super=1', () => {
    expect(readSuperParam(win('https://vibes.diy/p?super=1'))).toBe(true);
    expect(readSuperParam(win('https://vibes.diy/p#super=1'))).toBe(true);
  });

  it('is off for any other value', () => {
    expect(readSuperParam(win('https://vibes.diy/p?super=true'))).toBe(false);
    expect(readSuperParam(win('https://vibes.diy/p'))).toBe(false);
  });

  it('prefers the host frame, and falls back to this one when it is cross-origin', () => {
    expect(readSuperParam(win('https://sandbox/app', 'https://vibes.diy/v?super=1'))).toBe(true);
    expect(readSuperParam(win('https://sandbox/app?super=1', 'cross-origin'))).toBe(true);
  });
});

describe('readNowParam (QA test clock)', () => {
  it('reads the hash form', () => {
    expect(readNowParam(win('https://vibes.diy/p#now=2026-07-31T20:00'))).toBe('2026-07-31T20:00');
  });

  it('reads the query form', () => {
    expect(readNowParam(win('https://vibes.diy/p?now=2026-07-31T20:00'))).toBe('2026-07-31T20:00');
  });

  it('prefers the hash when both are set', () => {
    expect(readNowParam(win('https://vibes.diy/p?now=2026-07-30T12:00#now=2026-07-31T20:00'))).toBe(
      '2026-07-31T20:00'
    );
  });

  it('is absent by default — no override means the real clock', () => {
    expect(readNowParam(win('https://vibes.diy/p#friend=alice'))).toBe(null);
  });
});
