// Per-object hybrid (the shared-lists pattern, per-board): each board owns a
// channel "board:<id>" (its tasks + membership) plus "board:<id>/admin" (who
// may invite/rename). The board creator is admin; members get read/write on
// the board's tasks.
//
// DEFAULT BOARDS ARE PER-USER AND IMPLICIT: every user's personal board is
// "default-<their handle>" — no board doc, no public grant, and the same
// access model as any other board (its user is implicitly admin, so they can
// invite members to it). Board docs may never claim a "default*" id, or a
// crafted board doc could grant its creator someone else's default channel.
//
// The app OWNER identity bypasses channel checks (it's their app; also lets
// the owner's CLI migrate docs through the gate, including re-homing boardId).
//
// IMPORTANT: the runtime extracts ONLY this exported function for sandboxed
// eval, so it must be SELF-CONTAINED (helpers inside the body). The export
// name MUST match the database name ("kanban").
export function kanban(doc, oldDoc, user, ctx) {
  const safeId = (id) => {
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(id)) throw { forbidden: 'Invalid id' };
    return id;
  };

  if (!user?.userHandle) throw { forbidden: 'Sign in to make changes' };
  if (oldDoc && doc.type !== oldDoc.type) throw { forbidden: 'type is immutable' };

  const myDefault = 'default-' + user.userHandle;

  switch (doc.type) {
    case 'board': {
      if (String(doc._id).startsWith('default')) throw { forbidden: 'Default boards are implicit' };
      const chan = 'board:' + safeId(doc._id);
      if (oldDoc) {
        if (doc.creatorHandle !== oldDoc.creatorHandle)
          throw { forbidden: 'creatorHandle is immutable' };
        if (!user.isOwner) ctx.requireAccess(chan + '/admin');
      } else if (doc.creatorHandle !== user.userHandle && !user.isOwner) {
        throw { forbidden: 'You must be the creator' };
      }
      return {
        channels: [chan],
        grant: { users: { [doc.creatorHandle]: [chan, chan + '/admin'] } },
      };
    }
    case 'task': {
      if (oldDoc && doc.boardId !== oldDoc.boardId && !user.isOwner)
        throw { forbidden: 'boardId is immutable' };
      if (oldDoc) {
        if (doc.authorHandle !== oldDoc.authorHandle && !user.isOwner)
          throw { forbidden: 'authorHandle is immutable' };
      } else if (doc.authorHandle !== user.userHandle && !user.isOwner) {
        throw { forbidden: 'authorHandle must be you' };
      }
      const boardId = doc.boardId || (oldDoc && oldDoc.boardId) || myDefault;
      const chan = 'board:' + safeId(boardId);
      if (!user.isOwner && boardId !== myDefault) ctx.requireAccess(chan);
      // Implicit default boards have no board doc to carry the creator grant,
      // so each task write (re)grants the default's user their own channel —
      // without it, grant-filtered reads hide the board even from its owner.
      if (boardId.startsWith('default-')) {
        return {
          channels: [chan],
          grant: { users: { [boardId.slice('default-'.length)]: [chan, chan + '/admin'] } },
        };
      }
      return { channels: [chan] };
    }
    case 'member': {
      const chan = 'board:' + safeId(doc.boardId);
      if (!user.isOwner && doc.boardId !== myDefault) ctx.requireAccess(chan + '/admin');
      if (oldDoc) throw { forbidden: 'Membership grants are immutable' };
      if (doc.addedBy !== user.userHandle && !user.isOwner)
        throw { forbidden: 'addedBy must be you' };
      return { channels: [chan], grant: { users: { [doc.userHandle]: [chan] } } };
    }
    default:
      throw { forbidden: 'Unknown doc type' };
  }
}
