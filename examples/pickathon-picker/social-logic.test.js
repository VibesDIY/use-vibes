import { describe, it, expect } from 'vitest';
import {
  activeFollowHandles,
  followStateMap,
  profilePicksVisible,
  followButtonState,
  profileEmptyMessage,
  armPath,
} from './social-logic.js';

describe('activeFollowHandles', () => {
  it('counts only ACTIVE edges — a requested follow grants no reads', () => {
    const s = activeFollowHandles([
      { handle: 'alice', state: 'active' },
      { handle: 'bob', state: 'requested' },
    ]);
    expect([...s]).toEqual(['alice']);
  });
});

describe('followStateMap', () => {
  it('keeps the state of every edge, requested included', () => {
    const m = followStateMap([
      { handle: 'alice', state: 'active' },
      { handle: 'bob', state: 'requested' },
    ]);
    expect(m.get('alice')).toBe('active');
    expect(m.get('bob')).toBe('requested');
    expect(m.get('carol')).toBeUndefined();
  });
});

describe('profilePicksVisible', () => {
  const followed = new Set(['alice']);

  it('shows a followed handle picks', () => {
    expect(
      profilePicksVisible({ handle: 'alice', isSelf: false, followedHandles: followed })
    ).toBe(true);
  });

  it('shows nothing for someone you do not follow', () => {
    expect(profilePicksVisible({ handle: 'bob', isSelf: false, followedHandles: followed })).toBe(
      false
    );
  });

  it('gates your OWN profile on the arm, not on owning the docs', () => {
    expect(
      profilePicksVisible({
        handle: 'me',
        isSelf: true,
        followersEnabled: false,
        followedHandles: followed,
      })
    ).toBe(false);
    expect(
      profilePicksVisible({
        handle: 'me',
        isSelf: true,
        followersEnabled: true,
        followedHandles: followed,
      })
    ).toBe(true);
  });

  it('is false with no profile open', () => {
    expect(profilePicksVisible({ handle: null, followedHandles: followed })).toBe(false);
  });
});

describe('followButtonState', () => {
  it('offers nothing on your own profile', () => {
    expect(followButtonState({ isSelf: true, signedIn: true, socialReady: true })).toBe('none');
  });

  it('asks a signed-out visitor to sign in', () => {
    expect(followButtonState({ isSelf: false, signedIn: false })).toBe('signin');
  });

  it('waits for the graph snapshot before offering an action', () => {
    expect(followButtonState({ isSelf: false, signedIn: true, socialReady: false })).toBe('loading');
  });

  it('reflects the edge state once known', () => {
    const base = { isSelf: false, signedIn: true, socialReady: true };
    expect(followButtonState({ ...base, followState: 'active' })).toBe('following');
    expect(followButtonState({ ...base, followState: 'requested' })).toBe('requested');
    expect(followButtonState({ ...base, followState: null })).toBe('follow');
  });
});

describe('profileEmptyMessage', () => {
  it('names pick-sharing on your own un-armed profile (there it is actionable)', () => {
    expect(profileEmptyMessage({ isSelf: true, sharingOff: true })).toBe(
      "Your followers see nothing here — you haven't turned on pick-sharing yet."
    );
  });

  it('says your armed-but-empty profile shows followers an empty schedule', () => {
    expect(profileEmptyMessage({ isSelf: true, sharingOff: false })).toBe(
      "You haven't picked any events yet — your followers see an empty schedule."
    );
  });

  it('never names pick-sharing to a follower — the viewer cannot act on it', () => {
    const msg = profileEmptyMessage({ isSelf: false, followState: 'active', signedIn: true });
    expect(msg).toBe("No picks to show — they haven't shared any yet.");
    expect(msg).not.toMatch(/sharing/i);
  });

  it('explains a pending request', () => {
    expect(profileEmptyMessage({ isSelf: false, followState: 'requested', signedIn: true })).toBe(
      'Their account is private — once they approve your request, their picks show up here.'
    );
  });

  it('tells a signed-in non-follower what following unlocks', () => {
    expect(profileEmptyMessage({ isSelf: false, followState: null, signedIn: true })).toBe(
      'Follow to see the events they picked and the extras they share with followers.'
    );
  });

  it('tells a signed-out visitor to sign in first', () => {
    expect(profileEmptyMessage({ isSelf: false, followState: null, signedIn: false })).toBe(
      'Sign in and follow to see the events they picked and the extras they share.'
    );
  });
});

describe('armPath', () => {
  it('routes a first-ever arm through the platform consent matrix', () => {
    expect(armPath({ disarmed: false, canSetVisibility: true })).toBe('consent');
  });

  it('re-arms a session-disarmed viewer with a plain level flip (already consented)', () => {
    expect(armPath({ disarmed: true, canSetVisibility: true })).toBe('level');
  });

  it('falls back to consent when the runtime has no visibility setter', () => {
    expect(armPath({ disarmed: true, canSetVisibility: false })).toBe('consent');
  });
});
