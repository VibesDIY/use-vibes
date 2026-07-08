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
  it("favorites go to super + the owner's share channel, granted to the owner only", () => {
    const { ok } = run({ type: 'favorite', userId: 'alice', eventId: '1' }, null, alice);
    expect(ok.channels).toEqual(['super', 'share-alice']);
    expect(ok.grant).toEqual({ users: { alice: ['share-alice'] } }); // nobody is granted "super"
  });

  it("notes are private to the owner's user channel", () => {
    const { ok } = run({ type: 'note', userId: 'alice', eventId: '1', notes: 'x' }, null, alice);
    expect(ok.channels).toEqual(['user-alice']);
    expect(ok.grant).toEqual({ users: { alice: ['user-alice'] } });
  });

  it('a shared shift goes to the share channel; a private shift stays in the user channel', () => {
    expect(
      run({ type: 'shift', userId: 'alice', shareWithFriends: true }, null, alice).ok.channels
    ).toEqual(['share-alice']);
    expect(
      run({ type: 'shift', userId: 'alice', shareWithFriends: false }, null, alice).ok.channels
    ).toEqual(['user-alice']);
  });

  it("a friend edge cross-grants read of each other's share channel", () => {
    const { ok } = run({ type: 'friend', userId: 'alice', friendSlug: 'bob' }, null, alice);
    expect(ok.channels).toEqual(['user-alice', 'user-bob']);
    expect(ok.grant).toEqual({
      users: {
        alice: ['user-alice', 'share-bob'], // alice reads bob's shared favorites/shifts
        bob: ['user-bob', 'share-alice'], // and bob reads alice's
      },
    });
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

describe('access.js — schedule-snapshot chunks (owner only)', () => {
  const chunk = {
    _id: 'schedule-snapshot-0',
    type: 'schedule-snapshot',
    seq: 0,
    total: 1,
    fetchedAt: 't',
    body: '[]',
  };
  const owner = { userHandle: 'jchris', isOwner: true };

  it('owner writes land in an unreadable channel with no grant', () => {
    const { ok } = run(chunk, null, owner);
    expect(ok.channels).toEqual(['snapshot-internal']);
    expect(ok.grant).toEqual({});
  });

  // Security regression (Codex, #3413): the backend serves the schedule to EVERYONE
  // from these docs when the upstream 403s, and the old unknown-type fallthrough
  // accepted them from any signed-in user — creates AND overwrites of the fixed
  // chunk _ids must be owner-only or the schedule is poisonable.
  it('a non-owner can neither create nor overwrite a chunk', () => {
    expect(run(chunk, null, alice)).toEqual({ forbidden: 'owner only' });
    expect(
      run({ ...chunk, body: 'poison' }, chunk, { userHandle: 'mallory', isOwner: false })
    ).toEqual({
      forbidden: 'owner only',
    });
  });

  it('tombstones without fields still resolve the type from oldDoc and stay owner-gated', () => {
    expect(run({ _id: 'schedule-snapshot-0', _deleted: true }, chunk, alice)).toEqual({
      forbidden: 'owner only',
    });
    expect(run({ _id: 'schedule-snapshot-0', _deleted: true }, chunk, owner).ok.channels).toEqual([
      'snapshot-internal',
    ]);
  });
});
