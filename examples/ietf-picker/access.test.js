import { describe, it, expect } from 'vitest';
import access from './access.js';

// access.js returns an AccessDescriptor or throws { forbidden }. Normalize.
function run(doc, oldDoc, user) {
  try {
    return { ok: access(doc, oldDoc, user, {}) };
  } catch (e) {
    return { forbidden: e.forbidden };
  }
}
const alice = { userHandle: 'alice' };

describe('access.js — channel routing', () => {
  it("favorites go to super + the owner's share channel, follower-readable via audience", () => {
    const { ok } = run({ type: 'favorite', userId: 'alice', eventId: '1' }, null, alice);
    expect(ok.channels).toEqual(['super', 'share-alice']);
    // The follow graph lives in the platform: followers (and always the owner —
    // X ∈ followersOf X) read via the audience label; no self-grant needed.
    expect(ok.audience).toEqual({ followersOf: 'alice' });
    expect(ok.grant).toBeUndefined();
  });

  it("notes are private to the owner's user channel", () => {
    const { ok } = run({ type: 'note', userId: 'alice', eventId: '1', notes: 'x' }, null, alice);
    expect(ok.channels).toEqual(['user-alice']);
    expect(ok.grant).toEqual({ users: { alice: ['user-alice'] } });
  });

  it('a shared shift is follower-readable; a private shift stays in the user channel', () => {
    const shared = run({ type: 'shift', userId: 'alice', shareWithFriends: true }, null, alice).ok;
    expect(shared.channels).toEqual(['share-alice']);
    expect(shared.audience).toEqual({ followersOf: 'alice' });
    const priv = run({ type: 'shift', userId: 'alice', shareWithFriends: false }, null, alice).ok;
    expect(priv.channels).toEqual(['user-alice']);
    expect(priv.audience).toBeUndefined();
    expect(priv.grant).toEqual({ users: { alice: ['user-alice'] } });
  });

  it('legacy friend edge docs are accepted but land unreadable (graph moved to the platform)', () => {
    const { ok } = run({ type: 'friend', userId: 'alice', friendSlug: 'bob' }, null, alice);
    expect(ok.channels).toEqual(['discard']);
    expect(ok.grant).toEqual({});
  });
});

describe('access.js — super grants (owner only)', () => {
  it("an owner's grant doc unlocks the super channel for its grantee", () => {
    const { ok } = run({ type: 'grant', grantTo: 'carol' }, null, {
      userHandle: 'jchris',
      isOwner: true,
    });
    expect(ok.grant.users.carol).toEqual(['super']);
  });

  it('a non-owner cannot mint a super grant', () => {
    expect(
      run({ type: 'grant', grantTo: 'mallory' }, null, { userHandle: 'mallory', isOwner: false })
    ).toEqual({
      forbidden: 'owner only',
    });
  });
});

describe('access.js — side-meetings snapshot chunks (owner only)', () => {
  it('the owner writes snapshot chunks into an internal channel with no grant', () => {
    const { ok } = run(
      { _id: 'side-snapshot-0', type: 'side-snapshot', seq: 0, total: 1, body: '{}' },
      null,
      { userHandle: 'calendar', isOwner: true }
    );
    expect(ok.channels).toEqual(['snapshot-internal']);
    expect(ok.grant).toEqual({});
  });

  it('a non-owner cannot write (or overwrite) a snapshot chunk — no board poisoning', () => {
    expect(
      run({ _id: 'side-snapshot-0', type: 'side-snapshot', seq: 0, body: '{}' }, null, alice)
    ).toEqual({ forbidden: 'owner only' });
    expect(
      run(
        { _id: 'side-snapshot-0', type: 'side-snapshot', seq: 0, body: 'poison' },
        { type: 'side-snapshot', seq: 0, body: '{}' },
        alice
      )
    ).toEqual({ forbidden: 'owner only' });
  });
});

describe('access.js — guards', () => {
  it('requires a signed-in user', () => {
    expect(run({ type: 'favorite', userId: 'alice', eventId: '1' }, null, null)).toEqual({
      forbidden: 'authentication required',
    });
  });

  it('rejects writing a favorite for someone else', () => {
    expect(run({ type: 'favorite', userId: 'bob', eventId: '1' }, null, alice)).toEqual({
      forbidden: 'not owner',
    });
  });

  // Security regression: on an update/delete the owner is authoritative from oldDoc, so a
  // spoofed doc.userId can't hijack someone else's _id.
  it("rejects overwriting a victim's favorite via spoofed doc.userId", () => {
    expect(
      run(
        { _id: 'favorite-alice-1', type: 'favorite', userId: 'attacker', eventId: '1' },
        { type: 'favorite', userId: 'alice' },
        {
          userHandle: 'attacker',
        }
      )
    ).toEqual({ forbidden: 'not owner' });
  });

  it('routes unknown/legacy types to an unreadable channel instead of throwing', () => {
    const { ok } = run({ type: 'geocode', userId: 'alice' }, null, alice);
    expect(ok.channels).toEqual(['discard']);
    expect(ok.grant).toEqual({});
  });
});
