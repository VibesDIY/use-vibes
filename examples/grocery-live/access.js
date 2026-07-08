// grocery-live: WHOLE-HOUSEHOLD sharing — deliberately coarser than
// lists-live's per-list friends. Everything a household owns (stores, items,
// membership) rides ONE channel, "home:<founder-handle>": one membership
// grant covers all of it. Every user's own household is implicit (you live in
// your own — householdId IS its founder's handle, no household doc), and a
// household switcher only appears once you've been invited to another.
//
// Membership itself is FOUNDER-ONLY to grant or revoke (per Charlie's #3081
// review — the one coarse grant that unlocks everything shouldn't be handed
// out transitively), though members may remove themselves; items and stores
// stay any-member. The founder needs no member doc because every write to
// their household (re)grants them their channel (implicit scopes have no doc
// to carry a creator grant). A crafted doc claiming someone else's handle as
// householdId just fails the channel check.
//
// Deletes arrive as tombstones that may not carry the original fields, so
// load-bearing fields fall back to oldDoc. The app OWNER identity bypasses
// channel checks (it's their app; also lets the owner's CLI migrate docs
// through the gate).
//
// IMPORTANT: the runtime extracts ONLY this exported function for sandboxed
// eval, so it must be SELF-CONTAINED (helpers inside the body). The export
// name MUST match the database name ("grocery").
export function grocery(doc, oldDoc, user, ctx) {
  const safeId = (id) => {
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(id)) throw { forbidden: 'Invalid id' };
    return id;
  };

  if (!user?.userHandle) throw { forbidden: 'Sign in to make changes' };
  const type = doc.type || (oldDoc && oldDoc.type);
  if (oldDoc && oldDoc.type && doc.type && doc.type !== oldDoc.type)
    throw { forbidden: 'type is immutable' };

  const myHome = user.userHandle;
  // oldDoc is AUTHORITATIVE whenever it exists — a tombstone (or update) must
  // never re-route a doc via forged incoming fields.
  const householdId = (oldDoc && oldDoc.householdId) || doc.householdId || myHome;
  // Strictly immutable on non-delete updates — an update that OMITS
  // householdId is rejected, not accepted-with-loss (a doc that shed its
  // household would re-home to the next writer's home channel). The oldDoc
  // fallback is for tombstones only.
  if (
    oldDoc &&
    !doc._deleted &&
    !user.isOwner &&
    oldDoc.householdId !== undefined &&
    doc.householdId !== oldDoc.householdId
  ) {
    throw { forbidden: 'householdId is immutable' };
  }
  const chan = 'home:' + safeId(householdId);
  // The founder's grant is re-issued by every household write; members carry
  // theirs on their member doc.
  const withFounderGrant = { channels: [chan], grant: { users: { [householdId]: [chan] } } };

  switch (type) {
    case 'item':
    case 'store': {
      if (!user.isOwner && householdId !== myHome) ctx.requireAccess(chan);
      if (
        oldDoc &&
        !doc._deleted &&
        !user.isOwner &&
        oldDoc.authorHandle !== undefined &&
        doc.authorHandle !== oldDoc.authorHandle
      ) {
        throw { forbidden: 'authorHandle is immutable' };
      }
      return withFounderGrant;
    }
    case 'member': {
      // oldDoc-first: a delete's identity comes from the STORED doc, so a
      // forged doc.userHandle can't claim the self-removal carve-out
      // (CharlieHelps, #3081).
      const memberHandle = (oldDoc && oldDoc.userHandle) || doc.userHandle;
      if (oldDoc && !doc._deleted) throw { forbidden: 'Membership grants are immutable' };
      if (doc._deleted) {
        // The founder may remove members; a member may remove themself.
        if (!user.isOwner && householdId !== myHome && memberHandle !== user.userHandle) {
          throw { forbidden: "Only the household's founder can remove members" };
        }
        return { channels: [chan] };
      }
      // FOUNDER-ONLY invites (Charlie's review, #3081): membership is the one
      // coarse grant that unlocks everything the household owns, so handing
      // out invite rights transitively is more blast radius than a starter
      // wants. Items/stores stay any-member.
      if (householdId !== myHome && !user.isOwner)
        throw { forbidden: "Only the household's founder can invite" };
      if (doc.addedBy !== user.userHandle && !user.isOwner)
        throw { forbidden: 'addedBy must be you' };
      return {
        channels: [chan],
        grant: { users: { [householdId]: [chan], [safeId(memberHandle)]: [chan] } },
      };
    }
    default:
      throw { forbidden: 'Unknown doc type' };
  }
}
