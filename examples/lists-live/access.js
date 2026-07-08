// lists-live: the kanban-live per-object hybrid, per LIST — each list owns a
// channel "list:<id>" (its todos + membership) plus "list:<id>/admin" (who may
// invite/rename/delete). The list creator is admin; members get read/write on
// the list's todos. DIFFERENT friends per list is the point of this app.
//
// DEFAULT LISTS ARE PER-USER AND IMPLICIT: every user's personal list is
// "default-<their handle>" — no list doc, no public grant, and the same access
// model as any other list (its user is implicitly admin, so they can invite
// members to it). List docs may never claim a "default*" id, or a crafted list
// doc could grant its creator someone else's default channel. Because implicit
// scopes have no doc to carry a creator grant, every todo write on a default
// list (re)grants its user the channel.
//
// Deletes arrive as tombstones that may not carry the original fields, so
// load-bearing fields fall back to oldDoc. The app OWNER identity bypasses
// channel checks (it's their app; also lets the owner's CLI migrate docs
// through the gate, including re-homing otherwise-immutable fields).
//
// IMPORTANT: the runtime extracts ONLY this exported function for sandboxed
// eval, so it must be SELF-CONTAINED (helpers inside the body). The export
// name MUST match the database name ("lists").
export function lists(doc, oldDoc, user, ctx) {
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
    case 'list': {
      if (String(doc._id).startsWith('default')) throw { forbidden: 'Default lists are implicit' };
      const chan = 'list:' + safeId(doc._id);
      const creator = (oldDoc && oldDoc.creatorHandle) || doc.creatorHandle;
      if (oldDoc) {
        // Strictly immutable on non-delete updates: an update that OMITS
        // creatorHandle is rejected, not accepted-with-loss — a list doc that
        // shed its creator would later re-issue the admin grant to an
        // `undefined` user and lock the real creator out. The oldDoc fallback
        // is for tombstones only.
        if (
          !doc._deleted &&
          oldDoc.creatorHandle !== undefined &&
          doc.creatorHandle !== oldDoc.creatorHandle &&
          !user.isOwner
        ) {
          throw { forbidden: 'creatorHandle is immutable' };
        }
        if (!user.isOwner) ctx.requireAccess(chan + '/admin');
      } else if (doc.creatorHandle !== user.userHandle && !user.isOwner) {
        throw { forbidden: 'You must be the creator' };
      }
      return { channels: [chan], grant: { users: { [creator]: [chan, chan + '/admin'] } } };
    }
    case 'todo': {
      // oldDoc is AUTHORITATIVE whenever it exists — a tombstone (or update)
      // must never re-route a doc via forged incoming fields.
      const listId = (oldDoc && oldDoc.listId) || doc.listId || myDefault;
      // Strictly immutable on non-delete updates (omission rejected, not
      // accepted-with-loss); the oldDoc fallback is for tombstones only.
      if (oldDoc && !doc._deleted && !user.isOwner) {
        if (oldDoc.listId !== undefined && doc.listId !== oldDoc.listId)
          throw { forbidden: 'listId is immutable' };
        if (oldDoc.authorHandle !== undefined && doc.authorHandle !== oldDoc.authorHandle) {
          throw { forbidden: 'authorHandle is immutable' };
        }
      }
      if (!oldDoc && doc.authorHandle !== user.userHandle && !user.isOwner) {
        throw { forbidden: 'authorHandle must be you' };
      }
      const chan = 'list:' + safeId(listId);
      if (!user.isOwner && listId !== myDefault) ctx.requireAccess(chan);
      // Implicit default lists have no list doc to carry the creator grant, so
      // each todo write (re)grants the default's user their own channel.
      if (listId.startsWith('default-')) {
        return {
          channels: [chan],
          grant: { users: { [listId.slice('default-'.length)]: [chan, chan + '/admin'] } },
        };
      }
      return { channels: [chan] };
    }
    case 'member': {
      // oldDoc-first: a delete's identity/scope comes from the STORED doc, so
      // a forged doc.userHandle can't claim the self-removal carve-out and a
      // forged doc.listId can't dodge the admin check (CharlieHelps, #3081).
      const listId = (oldDoc && oldDoc.listId) || doc.listId;
      const chan = 'list:' + safeId(listId);
      const memberHandle = (oldDoc && oldDoc.userHandle) || doc.userHandle;
      if (oldDoc && !doc._deleted) throw { forbidden: 'Membership grants are immutable' };
      if (doc._deleted) {
        // The list's admin may remove members; a member may remove themself.
        if (!user.isOwner && listId !== myDefault && memberHandle !== user.userHandle) {
          ctx.requireAccess(chan + '/admin');
        }
        return { channels: [chan] };
      }
      if (!user.isOwner && listId !== myDefault) ctx.requireAccess(chan + '/admin');
      if (doc.addedBy !== user.userHandle && !user.isOwner)
        throw { forbidden: 'addedBy must be you' };
      return { channels: [chan], grant: { users: { [safeId(memberHandle)]: [chan] } } };
    }
    default:
      throw { forbidden: 'Unknown doc type' };
  }
}
