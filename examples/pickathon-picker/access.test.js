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

  it('retired schedulecache docs are accepted but unreadable, and sweepable by anyone', () => {
    // The type is retired (the server-maintained `scheduleitem` docs are the single
    // source now). Legacy docs must still be WRITEABLE — a delete is a write, and the
    // old owner-check made the leftovers unsweepable — but must land on `discard`
    // with no grant so they replicate to nobody.
    const { ok } = run(
      { type: 'schedulecache', userId: 'alice', events: [], fetchedAt: 1 },
      null,
      alice
    );
    expect(ok.channels).toEqual(['discard']);
    expect(ok.grant).toEqual({});

    // A DIFFERENT handle (e.g. the vibe owner sweeping) must not be refused.
    const bob = { userHandle: 'bob' };
    const sweep = run({ type: 'schedulecache' }, { type: 'schedulecache', userId: 'alice' }, bob);
    expect(sweep.ok.channels).toEqual(['discard']);
  });

  it('schedule items are owner-written and WORLD-READABLE via grant.public', () => {
    const owner = { userHandle: 'jchris', isOwner: true };
    const { ok } = run(
      { _id: 'schedule-event-42', type: 'scheduleitem', eventId: '42', title: 'Band' },
      null,
      owner
    );
    // A channel listed under grant.public is readable by anonymous + everyone —
    // this is what makes the schedule replicate to every local store offline.
    expect(ok.channels).toEqual(['schedule']);
    expect(ok.grant).toEqual({ public: ['schedule'] });
  });

  it('only the owner can write the schedule mirror\'s state doc', () => {
    // The tick TRUSTS this doc to decide the schedule is already up to date, so
    // a stranger forging it could freeze the festival schedule. Without its own
    // branch it would fall through to the unknown-type branch, which takes a
    // write from anybody.
    expect(
      run({ type: 'schedulesync', fingerprints: {} }, null, { userHandle: 'mallory', isOwner: false })
    ).toEqual({ forbidden: 'owner only' });
    const { ok } = run({ type: 'schedulesync', fingerprints: {} }, null, {
      userHandle: 'jchris',
      isOwner: true,
    });
    expect(ok.channels).toEqual(['discard']); // bookkeeping, never for clients
    expect(ok.grant).toEqual({});
  });

  it('only the owner can write the tick liveness heartbeat', () => {
    // The heartbeat is how ops tells a dead alarm from a quiet one. A stranger
    // able to write it could forge liveness for a tick that has been dead for
    // days — so it is owner-only, exactly like the mirror's state doc.
    expect(
      run({ type: 'heartbeat', at: '2026-07-30T00:00:00.000Z' }, null, {
        userHandle: 'mallory',
        isOwner: false,
      })
    ).toEqual({ forbidden: 'owner only' });
    const { ok } = run({ type: 'heartbeat', at: '2026-07-30T00:00:00.000Z' }, null, {
      userHandle: 'jchris',
      isOwner: true,
    });
    expect(ok.channels).toEqual(['discard']); // ops-only, never replicated to clients
    expect(ok.grant).toEqual({});
  });

  it('the load-shed switch is owner-written and WORLD-READABLE (same channel as the schedule)', () => {
    // It has to reach EVERY client — including anonymous ones — or a shed level
    // would only apply to signed-in viewers, which is the opposite of the point.
    // Riding the existing public `schedule` channel means no new channel and no
    // per-user keying.
    const owner = { userHandle: 'jchris', isOwner: true };
    const { ok } = run({ _id: '0-load-shed', type: 'loadshed', level: 'read-only' }, null, owner);
    expect(ok.channels).toEqual(['schedule']);
    expect(ok.grant).toEqual({ public: ['schedule'] });
  });

  it('a stranger cannot flip the app read-only (it would be a griefing vector)', () => {
    // Owner-only WRITE is the security half: a signed-in stranger who could
    // write this doc could turn off everyone's picks for the whole festival.
    // Without its own branch it would fall through to the unknown-type branch,
    // which accepts a write from anybody.
    expect(
      run({ _id: '0-load-shed', type: 'loadshed', level: 'schedule-only' }, null, {
        userHandle: 'mallory',
        isOwner: false,
      })
    ).toEqual({ forbidden: 'owner only' });
  });

  it('turning the switch back OFF (and deleting it) is owner-only too', () => {
    // A delete is a write, and the tombstone carries no `type` — so the oldDoc
    // fallback has to keep it inside this branch rather than dropping it into
    // the accept-from-anybody one.
    const owner = { userHandle: 'jchris', isOwner: true };
    expect(run({}, { _id: '0-load-shed', type: 'loadshed', level: 'off' }, owner).ok.channels).toEqual(
      ['schedule']
    );
    expect(
      run({}, { _id: '0-load-shed', type: 'loadshed', level: 'read-only' }, {
        userHandle: 'mallory',
        isOwner: false,
      })
    ).toEqual({ forbidden: 'owner only' });
  });

  it('a non-owner cannot write a schedule item', () => {
    expect(
      run({ type: 'scheduleitem', eventId: '42' }, null, { userHandle: 'mallory', isOwner: false })
    ).toEqual({ forbidden: 'owner only' });
  });

  it('an anonymous reader can read a schedule item but NOT another user\'s favorite', () => {
    // Read visibility is decided by whether the doc's stored channel is public.
    const sched = run(
      { type: 'scheduleitem', eventId: '42' },
      null,
      { userHandle: 'jchris', isOwner: true }
    ).ok;
    const fav = run({ type: 'favorite', userId: 'alice', eventId: '1' }, null, alice).ok;
    const publicOf = (d) => (d.grant && d.grant.public) || [];
    // scheduleitem exposes a public channel → anonymous/all can read it.
    expect(publicOf(sched)).toContain('schedule');
    // a favorite exposes NO public channel → an anonymous reader cannot read it.
    expect(publicOf(fav)).toEqual([]);
    expect(sched.channels.every((ch) => publicOf(sched).includes(ch))).toBe(true);
    expect(fav.channels.some((ch) => publicOf(fav).includes(ch))).toBe(false);
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

describe('access.js — guards', () => {
  it('requires a signed-in user (with a calm, user-facing refusal — the shell toasts it)', () => {
    expect(run({ type: 'favorite', userId: 'alice', eventId: '1' }, null, null)).toEqual({
      forbidden: 'Saved on this device — sign in to sync your picks',
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
