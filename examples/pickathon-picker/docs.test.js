import { describe, it, expect } from 'vitest';
import {
  favoriteDocId,
  noteDocId,
  calTokenDocId,
  migratePickathonDoc,
  icsSubscribePath,
  mintCalToken,
  ensureCalToken,
} from './docs.js';

describe('doc ids', () => {
  it('keys a favorite by (owner, event) so a re-pick is idempotent', () => {
    expect(favoriteDocId('alice', 'e1')).toBe('favorite-alice-e1');
    expect(favoriteDocId('alice', 'e1')).toBe(favoriteDocId('alice', 'e1'));
  });

  it('keys a note by (owner, event) and a token by owner', () => {
    expect(noteDocId('alice', 'e1')).toBe('note-alice-e1');
    expect(calTokenDocId('alice')).toBe('caltoken-alice');
  });
});

describe('migratePickathonDoc', () => {
  it('re-keys a favorite onto the signed-in handle', () => {
    const out = migratePickathonDoc(
      { _id: 'favorite-anonymous-e1', type: 'favorite', eventId: 'e1', userId: 'anonymous' },
      'alice'
    );
    expect(out).toEqual({
      _id: 'favorite-alice-e1',
      type: 'favorite',
      eventId: 'e1',
      userId: 'alice',
    });
  });

  it('re-keys a note the same way', () => {
    const out = migratePickathonDoc(
      { _id: 'note-anonymous-e1', type: 'note', eventId: 'e1', notes: 'hi' },
      'alice'
    );
    expect(out._id).toBe('note-alice-e1');
    expect(out.notes).toBe('hi');
  });

  it('drops a shift _id — a shift has no natural key, so it gets a fresh one', () => {
    const out = migratePickathonDoc({ _id: 'old', type: 'shift', day: 'Friday' }, 'alice');
    expect(out._id).toBeUndefined();
    expect(out).toEqual({ type: 'shift', day: 'Friday', userId: 'alice' });
  });

  it('re-stamps any other doc without touching its id', () => {
    const out = migratePickathonDoc({ _id: 'x', type: 'caltoken', token: 't' }, 'alice');
    expect(out).toEqual({ _id: 'x', type: 'caltoken', token: 't', userId: 'alice' });
  });

  it('is idempotent for an already-migrated favorite', () => {
    const once = migratePickathonDoc({ type: 'favorite', eventId: 'e1' }, 'alice');
    expect(migratePickathonDoc(once, 'alice')).toEqual(once);
  });
});

describe('icsSubscribePath', () => {
  it('carries the token, not the handle, as the capability', () => {
    expect(icsSubscribePath('tok', 'alice')).toBe('/_api/faves.ics?t=tok&n=alice');
  });

  it('escapes both values', () => {
    expect(icsSubscribePath('a+b/c', 'a b')).toBe('/_api/faves.ics?t=a%2Bb%2Fc&n=a%20b');
  });

  it('is null with no token — never advertise a feed that would sync empty', () => {
    expect(icsSubscribePath(null, 'alice')).toBe(null);
  });
});

describe('mintCalToken', () => {
  it('is url-safe base64 with no padding', () => {
    const t = mintCalToken((bytes) => bytes.fill(255));
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(t).not.toContain('=');
  });

  it('reflects the random bytes it was given', () => {
    const a = mintCalToken((b) => b.fill(0));
    const c = mintCalToken((b) => b.fill(1));
    expect(a).not.toBe(c);
  });
});

describe('ensureCalToken — mint exactly once per user, ever', () => {
  // The caltoken live query is mounted WITH the My Faves tab, so its first read is
  // [] even for a user who already holds a token. Minting off that empty read would
  // overwrite the doc (its _id is fixed per user) with a fresh token and silently
  // break every calendar already subscribed to the old URL — so the mint asks the
  // store directly instead of trusting the query.
  const rnd = (bytes) => bytes.fill(7);
  const mkDb = (existing) => {
    const puts = [];
    return {
      puts,
      get: async (id) => {
        if (existing && existing._id === id) return existing;
        throw new Error('Not found');
      },
      put: async (d) => {
        puts.push(d);
        return { id: d._id };
      },
    };
  };

  it('mints and stores a token when the user has none', async () => {
    const db = mkDb(null);
    const token = await ensureCalToken({ database: db, userId: 'alice', getRandomValues: rnd });
    expect(db.puts).toHaveLength(1);
    expect(db.puts[0]).toMatchObject({
      _id: 'caltoken-alice',
      type: 'caltoken',
      userId: 'alice',
      token,
    });
  });

  it('does NOT re-mint over an existing token — that would revoke live subscriptions', async () => {
    const db = mkDb({ _id: 'caltoken-alice', type: 'caltoken', userId: 'alice', token: 'keepme' });
    const token = await ensureCalToken({ database: db, userId: 'alice', getRandomValues: rnd });
    expect(db.puts).toEqual([]);
    expect(token).toBe('keepme');
  });

  it('treats a token-less leftover doc as no token and mints', async () => {
    const db = mkDb({ _id: 'caltoken-alice', type: 'caltoken', userId: 'alice' });
    await ensureCalToken({ database: db, userId: 'alice', getRandomValues: rnd });
    expect(db.puts).toHaveLength(1);
  });

  it('swallows a refused write (offline) rather than throwing into the effect', async () => {
    const db = { get: async () => { throw new Error('Not found'); }, put: async () => { throw new Error('offline'); } };
    await expect(
      ensureCalToken({ database: db, userId: 'alice', getRandomValues: rnd })
    ).resolves.toBe(null);
  });
});
