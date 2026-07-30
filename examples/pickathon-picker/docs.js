// Document identity for the `pickathon` db. The _id shapes are a contract with
// access.js and backend.js — favorites and notes are keyed by (owner, event) so a
// re-key on sign-in lands on the same doc instead of duplicating it.

export const favoriteDocId = (userId, eventId) => `favorite-${userId}-${eventId}`;
export const noteDocId = (userId, eventId) => `note-${userId}-${eventId}`;
export const calTokenDocId = (userId) => `caltoken-${userId}`;

// Re-stamp a locally-stored doc onto the freshly signed-in handle when useFireproof
// migrates the local store to the cloud on first login. Owned docs are keyed by user,
// so favorites/notes re-key deterministically; a shift has no natural key, so it drops
// its _id and gets a fresh one.
export const migratePickathonDoc = (doc, handle) => {
  if (doc.type === 'favorite')
    return { ...doc, userId: handle, _id: favoriteDocId(handle, doc.eventId) };
  if (doc.type === 'note') return { ...doc, userId: handle, _id: noteDocId(handle, doc.eventId) };
  if (doc.type === 'shift') {
    const { _id, ...rest } = doc;
    return { ...rest, userId: handle };
  }
  return { ...doc, userId: handle };
};

// The live calendar feed carries the TOKEN, not the handle: unguessable and revocable.
// `n` is a display hint only. Null unless there is both something to sync and a minted
// token, so we never advertise a subscription that would sync empty.
export const icsSubscribePath = (calToken, userId) =>
  calToken
    ? `/_api/faves.ics?t=${encodeURIComponent(calToken)}&n=${encodeURIComponent(userId)}`
    : null;

// URL-safe base64 of 16 random bytes — the calendar capability token, minted locally.
export const mintCalToken = (getRandomValues) => {
  const bytes = new Uint8Array(16);
  getRandomValues(bytes);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

// Mint the user's calendar token if — and only if — they don't already have one.
// The doc's _id is fixed per user, so a second mint OVERWRITES the first and every
// calendar already subscribed to the old URL goes dead. The caltoken live query is
// mounted with the My Faves tab (see App.jsx § lazy-mounted tab-scoped queries), so
// its first read is empty even for a user who has a token — which is exactly the
// wrong thing to mint from. This asks the store instead, which is authoritative.
// A refused write (offline) resolves to null; the subscribe controls simply don't
// appear until the user is back online.
export const ensureCalToken = async ({ database, userId, getRandomValues }) => {
  try {
    const existing = await database.get(calTokenDocId(userId));
    if (existing && existing.token) return existing.token;
  } catch (e) {
    // Not found — fall through and mint.
  }
  const token = mintCalToken(getRandomValues);
  try {
    await database.put({
      _id: calTokenDocId(userId),
      type: 'caltoken',
      userId,
      token,
      createdAt: Date.now(),
    });
  } catch (e) {
    return null;
  }
  return token;
};
