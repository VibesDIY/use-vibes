// habits-live: per-user habit tracking with accountability VIEWERS. Every
// user's habits live on their implicit personal scope — "default-<handle>",
// channel "habits:default-<handle>". Friends invited by handle get the channel
// via member-doc grants, which makes them READ-ONLY BY CONSTRUCTION: habit and
// check writes additionally require the scope to be the writer's own, so a
// granted channel never confers write access. That's the accountability model
// — friends can see your streaks, only you can log your days.
//
// Because implicit scopes have no doc to carry a creator grant, every habit or
// check write (re)grants the scope's user their channel. Scope ids outside the
// default- namespace are rejected. Deletes arrive as tombstones that may not
// carry the original fields, so load-bearing fields fall back to oldDoc. The
// app OWNER identity bypasses scope checks (it's their app; also lets the
// owner's CLI migrate docs through the gate).
//
// IMPORTANT: the runtime extracts ONLY this exported function for sandboxed
// eval, so it must be SELF-CONTAINED (helpers inside the body). The export
// name MUST match the database name ("habits").
export function habits(doc, oldDoc, user, ctx) {
  const safeId = (id) => {
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(id)) throw { forbidden: 'Invalid id' };
    return id;
  };

  if (!user?.userHandle) throw { forbidden: 'Sign in to make changes' };
  const type = doc.type || (oldDoc && oldDoc.type);
  if (oldDoc && oldDoc.type && doc.type && doc.type !== oldDoc.type)
    throw { forbidden: 'type is immutable' };

  const myDefault = 'default-' + user.userHandle;

  switch (type) {
    case 'habit':
    case 'check': {
      // oldDoc is AUTHORITATIVE whenever it exists — a tombstone (or update)
      // must never re-route a doc via forged incoming fields.
      const scopeId = (oldDoc && oldDoc.scopeId) || doc.scopeId || myDefault;
      // Strictly immutable on non-delete updates (omission rejected, not
      // accepted-with-loss); the oldDoc fallback is for tombstones only.
      if (
        oldDoc &&
        !doc._deleted &&
        !user.isOwner &&
        oldDoc.scopeId !== undefined &&
        doc.scopeId !== oldDoc.scopeId
      ) {
        throw { forbidden: 'scopeId is immutable' };
      }
      if (!scopeId.startsWith('default-')) throw { forbidden: 'Only personal habit scopes exist' };
      // Writes are OWNER-ONLY regardless of channel grants: viewers are
      // read-only. (user.isOwner is the app-owner escape hatch, not a role.)
      if (scopeId !== myDefault && !user.isOwner)
        throw { forbidden: 'Only you can write your habits' };
      const chan = 'habits:' + safeId(scopeId);
      return { channels: [chan], grant: { users: { [scopeId.slice('default-'.length)]: [chan] } } };
    }
    case 'member': {
      // oldDoc-first: a delete's identity/scope comes from the STORED doc, so
      // a forged doc.userHandle can't claim the self-removal carve-out and a
      // forged doc.scopeId can't dodge the owner check (CharlieHelps, #3081).
      const scopeId = (oldDoc && oldDoc.scopeId) || doc.scopeId;
      if (typeof scopeId !== 'string' || !scopeId.startsWith('default-'))
        throw { forbidden: 'Invalid scope' };
      const chan = 'habits:' + safeId(scopeId);
      const memberHandle = (oldDoc && oldDoc.userHandle) || doc.userHandle;
      if (oldDoc && !doc._deleted) throw { forbidden: 'Membership grants are immutable' };
      if (doc._deleted) {
        // The scope's user may remove viewers; a viewer may remove themself.
        if (!user.isOwner && scopeId !== myDefault && memberHandle !== user.userHandle) {
          throw { forbidden: "Only the habits' owner can remove viewers" };
        }
        return { channels: [chan] };
      }
      if (scopeId !== myDefault && !user.isOwner)
        throw { forbidden: 'You can only invite viewers to your own habits' };
      if (doc.addedBy !== user.userHandle && !user.isOwner)
        throw { forbidden: 'addedBy must be you' };
      return { channels: [chan], grant: { users: { [safeId(memberHandle)]: [chan] } } };
    }
    default:
      throw { forbidden: 'Unknown doc type' };
  }
}
