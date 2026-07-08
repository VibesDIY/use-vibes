// family-grocery: kanban-live's per-object hybrid, per FAMILY GROUP — each
// group owns a channel "group:<id>" (its stores, items, membership) plus
// "group:<id>/admin" (who may invite/rename/delete). The group creator is
// admin; members get read/write on everything the group owns — adding someone
// to a group shares ALL of its store lists at once, which is the point of the
// app. Anyone can start groups, and you can belong to any number of them.
//
// DEFAULT GROUPS ARE PER-USER AND IMPLICIT: every user's personal group is
// "default-<their handle>" — no group doc, no public grant, and the same
// access model as any other group (its user is implicitly admin, so they can
// invite family to it). Group docs may never claim a "default*" id, or a
// crafted group doc could grant its creator someone else's default channel.
// Because implicit scopes have no doc to carry a creator grant, every
// store/item write on a default group (re)grants its user the channel.
//
// Deletes arrive as tombstones that may not carry the original fields, so
// load-bearing fields fall back to oldDoc. The app OWNER identity bypasses
// channel checks (it's their app; also lets the owner's CLI migrate docs
// through the gate, including re-homing otherwise-immutable fields).
//
// IMPORTANT: the runtime extracts ONLY this exported function for sandboxed
// eval, so it must be SELF-CONTAINED (helpers inside the body). The export
// name MUST match the database name ("groceries").
export function groceries(doc, oldDoc, user, ctx) {
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
    case 'group': {
      if (String(doc._id).startsWith('default')) throw { forbidden: 'Default groups are implicit' };
      const chan = 'group:' + safeId(doc._id);
      const creator = (oldDoc && oldDoc.creatorHandle) || doc.creatorHandle;
      if (oldDoc) {
        // Strictly immutable on non-delete updates: an update that OMITS
        // creatorHandle is rejected, not accepted-with-loss — a group doc that
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
    case 'store':
    case 'item': {
      // oldDoc is AUTHORITATIVE whenever it exists — a tombstone (or update)
      // must never re-route a doc via forged incoming fields.
      const groupId = (oldDoc && oldDoc.groupId) || doc.groupId || myDefault;
      // Strictly immutable on non-delete updates (omission rejected, not
      // accepted-with-loss); the oldDoc fallback is for tombstones only.
      if (oldDoc && !doc._deleted && !user.isOwner) {
        if (oldDoc.groupId !== undefined && doc.groupId !== oldDoc.groupId)
          throw { forbidden: 'groupId is immutable' };
        if (oldDoc.authorHandle !== undefined && doc.authorHandle !== oldDoc.authorHandle) {
          throw { forbidden: 'authorHandle is immutable' };
        }
      }
      if (!oldDoc && doc.authorHandle !== user.userHandle && !user.isOwner) {
        throw { forbidden: 'authorHandle must be you' };
      }
      const chan = 'group:' + safeId(groupId);
      if (!user.isOwner && groupId !== myDefault) ctx.requireAccess(chan);
      // Implicit default groups have no group doc to carry the creator grant,
      // so each write (re)grants the default's user their own channel.
      if (groupId.startsWith('default-')) {
        return {
          channels: [chan],
          grant: { users: { [groupId.slice('default-'.length)]: [chan, chan + '/admin'] } },
        };
      }
      return { channels: [chan] };
    }
    case 'member': {
      // oldDoc-first: a delete's identity/scope comes from the STORED doc, so
      // a forged doc.userHandle can't claim the self-removal carve-out and a
      // forged doc.groupId can't dodge the admin check (CharlieHelps, #3081).
      const groupId = (oldDoc && oldDoc.groupId) || doc.groupId;
      const chan = 'group:' + safeId(groupId);
      const memberHandle = (oldDoc && oldDoc.userHandle) || doc.userHandle;
      if (oldDoc && !doc._deleted) throw { forbidden: 'Membership grants are immutable' };
      if (doc._deleted) {
        // The group's admin may remove members; a member may remove themself.
        if (!user.isOwner && groupId !== myDefault && memberHandle !== user.userHandle) {
          ctx.requireAccess(chan + '/admin');
        }
        return { channels: [chan] };
      }
      if (!user.isOwner && groupId !== myDefault) ctx.requireAccess(chan + '/admin');
      if (doc.addedBy !== user.userHandle && !user.isOwner)
        throw { forbidden: 'addedBy must be you' };
      // On default groups the member doc may be the ONLY grant-bearing doc
      // (an empty group has no store/item writes re-granting its user), so it
      // must also carry the group owner's grant — without it, grant-filtered
      // reads hide the membership from the owner (Codex P2 on #3375).
      if (groupId.startsWith('default-')) {
        return {
          channels: [chan],
          grant: {
            users: {
              [safeId(memberHandle)]: [chan],
              [groupId.slice('default-'.length)]: [chan, chan + '/admin'],
            },
          },
        };
      }
      return { channels: [chan], grant: { users: { [safeId(memberHandle)]: [chan] } } };
    }
    default:
      throw { forbidden: 'Unknown doc type' };
  }
}
