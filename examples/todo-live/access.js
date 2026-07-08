// todo-live: ONE personal list per user, shareable with friends by handle.
// Every list is a per-user IMPLICIT scope — listId is always "default-<handle>",
// there is no list doc (that's lists-live, the next step in the lane). Channel
// "list:<listId>" carries the list's todos and its membership; the scope's user
// is implicitly admin. Because implicit scopes have no doc to carry a creator
// grant, EVERY todo write (re)grants the scope's user their channel — without
// it, grant-filtered reads hide the list from its own owner.
//
// Deletes arrive as tombstones that may not carry the original fields, so every
// load-bearing field falls back to oldDoc. The app OWNER identity bypasses
// channel checks (it's their app; also lets the owner's CLI migrate docs
// through the gate).
//
// IMPORTANT: the runtime extracts ONLY this exported function for sandboxed
// eval, so it must be SELF-CONTAINED (helpers inside the body). The export
// name MUST match the database name ("todo").
export function todo(doc, oldDoc, user, ctx) {
  const safeId = (id) => {
    if (typeof id !== "string" || !/^[A-Za-z0-9_-]+$/.test(id)) throw { forbidden: "Invalid id" };
    return id;
  };

  if (!user?.userHandle) throw { forbidden: "Sign in to make changes" };
  const type = doc.type || (oldDoc && oldDoc.type);
  if (oldDoc && oldDoc.type && doc.type && doc.type !== oldDoc.type) throw { forbidden: "type is immutable" };

  const myDefault = "default-" + user.userHandle;

  switch (type) {
    case "todo": {
      // oldDoc is AUTHORITATIVE whenever it exists — a tombstone (or update)
      // must never re-route a doc via forged incoming fields.
      const listId = (oldDoc && oldDoc.listId) || doc.listId || myDefault;
      // Anchor fields are STRICTLY immutable on non-delete updates — an update
      // that omits them is rejected, not accepted-with-loss (a doc that shed
      // its listId would re-home to the next writer's default). The oldDoc
      // fallback above exists for tombstones only.
      if (oldDoc && !doc._deleted && !user.isOwner) {
        if (oldDoc.listId !== undefined && doc.listId !== oldDoc.listId) throw { forbidden: "listId is immutable" };
        if (oldDoc.authorHandle !== undefined && doc.authorHandle !== oldDoc.authorHandle) {
          throw { forbidden: "authorHandle is immutable" };
        }
      }
      // todo-live has ONLY implicit personal lists — a crafted listId outside
      // the default- namespace has no admin story here, so reject it outright.
      if (!listId.startsWith("default-")) throw { forbidden: "Only personal lists exist in todo-live" };
      const chan = "list:" + safeId(listId);
      if (!oldDoc && doc.authorHandle !== user.userHandle && !user.isOwner) {
        throw { forbidden: "authorHandle must be you" };
      }
      if (!user.isOwner && listId !== myDefault) ctx.requireAccess(chan);
      return { channels: [chan], grant: { users: { [listId.slice("default-".length)]: [chan, chan + "/admin"] } } };
    }
    case "member": {
      // oldDoc-first: a delete's identity/scope comes from the STORED doc, so
      // a forged doc.userHandle can't claim the self-removal carve-out and a
      // forged doc.listId can't dodge the admin check (CharlieHelps, #3081).
      const listId = (oldDoc && oldDoc.listId) || doc.listId;
      if (typeof listId !== "string" || !listId.startsWith("default-")) throw { forbidden: "Invalid list" };
      const chan = "list:" + safeId(listId);
      const memberHandle = (oldDoc && oldDoc.userHandle) || doc.userHandle;
      if (oldDoc && !doc._deleted) throw { forbidden: "Membership grants are immutable" };
      if (doc._deleted) {
        // The list's user may remove members; a member may remove themself.
        if (!user.isOwner && listId !== myDefault && memberHandle !== user.userHandle) {
          ctx.requireAccess(chan + "/admin");
        }
        return { channels: [chan] };
      }
      if (!user.isOwner && listId !== myDefault) ctx.requireAccess(chan + "/admin");
      if (doc.addedBy !== user.userHandle && !user.isOwner) throw { forbidden: "addedBy must be you" };
      return { channels: [chan], grant: { users: { [safeId(memberHandle)]: [chan] } } };
    }
    default:
      throw { forbidden: "Unknown doc type" };
  }
}
