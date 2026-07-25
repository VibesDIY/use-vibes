export default function (doc, oldDoc, user, ctx) {
  // Deletes arrive as tombstones that may not carry the original fields, so fall back to
  // oldDoc for type/owner/etc.
  const type = doc.type || (oldDoc && oldDoc.type);

  // Owner is authoritative from the existing doc on updates/deletes — we must NOT trust
  // an incoming doc.userId that could target someone else's _id and pass the checks
  // below. doc.userId is trusted only on true creates (no oldDoc).
  const ownerId = oldDoc ? oldDoc.userId : doc.userId;

  // Every write needs a real account. Logged-out favorites never reach the cloud — they
  // live in localStorage and migrate in on first sign-in.
  if (!user) throw { forbidden: 'authentication required' };

  // Favorites live in the owner's *shared* channel and are readable by the
  // owner's PLATFORM FOLLOWERS via the audience label — the follow graph now
  // lives in the platform (Settings → Social), not in this db. Resolution is
  // read-time: a new follower sees history instantly, an unfollow/block revokes
  // instantly, and the owner is always in their own audience (X ∈ followersOf X),
  // so no self-grant is needed. Favorites are still mirrored into the global
  // "super" firehose, which stays locked behind an owner-written `grant` doc.
  if (type === 'favorite') {
    if (ownerId !== user.userHandle) throw { forbidden: 'not owner' };
    const share = `share-${ownerId}`;
    return { channels: ['super', share], audience: { followersOf: ownerId } };
  }

  // Calendar-subscription token: the random capability that makes the user's
  // .ics URL unguessable (auto-minted client-side when the schedule tab opens).
  // PRIVATE like notes — the token IS the secret; the backend's scheduled lane
  // reads it unfiltered regardless. Revoked by deleting the doc.
  if (type === 'caltoken') {
    if (ownerId !== user.userHandle) throw { forbidden: 'not owner' };
    const ch = `user-${ownerId}`;
    return { channels: [ch], grant: { users: { [ownerId]: [ch] } } };
  }

  // Notes are private to their owner — their own user channel, never shared with friends.
  if (type === 'note') {
    if (ownerId !== user.userHandle) throw { forbidden: 'not owner' };
    const ch = `user-${ownerId}`;
    return { channels: [ch], grant: { users: { [ownerId]: [ch] } } };
  }

  // A shift marked shareWithFriends is readable by the owner's followers (same
  // audience label as favorites); a private shift stays on the owner's private
  // user channel with a plain self-grant — `audience` is only for follower
  // visibility, it does not replace channels+grant for private data.
  if (type === 'shift') {
    if (ownerId !== user.userHandle) throw { forbidden: 'not owner' };
    const shared =
      doc.shareWithFriends != null ? doc.shareWithFriends : oldDoc && oldDoc.shareWithFriends;
    if (shared) {
      return { channels: [`share-${ownerId}`], audience: { followersOf: ownerId } };
    }
    const ch = `user-${ownerId}`;
    return { channels: [ch], grant: { users: { [ownerId]: [ch] } } };
  }

  // The friend graph moved to the platform (follow edges, privacy, blocks —
  // Settings → Social). This app no longer stores `type:"friend"` docs; legacy
  // edge docs fall through to the unknown-type branch below (kept, unreadable).
  // NOTE: their old cross-grants stop applying once this function is live —
  // visibility comes from platform follows only. See RUNBOOK § Social migration.

  // A `grant` doc unlocks the "super" favorites firehose for one user (doc.grantTo).
  // Owner-only — `user.isOwner` is the reserved vibe-owner flag (the account that owns
  // this deployment, i.e. whoever writes it via the CLI). A regular user must not be able
  // to grant themselves the whole festival's favorites. See RUNBOOK.md § Granting super access.
  if (type === 'grant') {
    if (!user.isOwner) throw { forbidden: 'owner only' };
    const grantee = doc.grantTo != null ? doc.grantTo : oldDoc && oldDoc.grantTo;
    return {
      channels: ['grants'],
      grant: { users: { [user.userHandle]: ['grants', 'super'], [grantee]: ['super'] } },
    };
  }

  // Unknown / legacy doc types: accept the write but route it to an unreadable channel
  // (no grant) rather than throwing — a single stray local doc must not fail the whole
  // anonymousLocal sign-in migration.
  return { channels: ['discard'], grant: {} };
}
