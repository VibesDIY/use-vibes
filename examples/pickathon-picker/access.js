export default function (doc, oldDoc, user, ctx) {
  // Deletes arrive as tombstones that may not carry the original fields, so fall back to
  // oldDoc for type/owner/etc.
  const type = doc.type || (oldDoc && oldDoc.type);

  // Owner is authoritative from the existing doc on updates/deletes — we must NOT trust
  // an incoming doc.userId that could target someone else's _id and pass the checks
  // below. doc.userId is trusted on true creates (no oldDoc) AND on re-creates over a
  // deletion tombstone: a tombstone oldDoc carries no `userId` (fields are stripped on
  // delete), so `oldDoc ? oldDoc.userId : doc.userId` would yield `undefined` and make
  // every owner check throw "not owner" — silently refusing every re-favorite of a
  // previously-removed event (toggleFavorite deletes on un-favorite). Fall back to
  // doc.userId whenever oldDoc has no userId; a LIVE doc's userId still wins, so the
  // anti-impersonation guard on genuine updates is unchanged.
  const ownerId = oldDoc && oldDoc.userId != null ? oldDoc.userId : doc.userId;

  // Every CLOUD write needs a real account. Logged-out writes are expected and fine —
  // they stay in the device-local store and migrate in on first sign-in; this refusal
  // only turns down the (routine) sync attempt. The shell surfaces this exact string
  // in a toast, so keep it calm and routine, never ominous.
  if (!user) throw { forbidden: 'Saved on this device — sign in to sync your picks' };

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

  // Central festival schedule: server-maintained and WORLD-READABLE. The
  // `scheduled` tick runs as the vibe OWNER (isOwner:true — backend-db-callback.js)
  // and mirrors the pickathon.com feed into one `scheduleitem` doc per event.
  // Listing the channel under `grant.public` makes it readable by anonymous and
  // every viewer, so the schedule replicates to each client's LOCAL store and
  // renders OFFLINE with no per-user keying and no network fetch. Owner-only WRITE
  // so a signed-in stranger can't inject fake schedule docs. This is the opposite
  // of favorites' `super` channel, which is deliberately NOT world-readable
  // (RUNBOOK § Channels) to avoid syncing every user's picks to every client.
  if (type === 'scheduleitem') {
    if (!user.isOwner) throw { forbidden: 'owner only' };
    return { channels: ['schedule'], grant: { public: ['schedule'] } };
  }

  // The schedule mirror's own bookkeeping (`_id: 0-schedule-sync-state`): a
  // fingerprint per mirrored event, written by the `scheduled` tick so it can
  // tell "unchanged" without re-reading the schedule docs — which no longer fit
  // inside the backend query's 2000-doc cap. OWNER-ONLY WRITE is the point: this
  // doc is what the tick TRUSTS, so a signed-in stranger forging it could
  // convince the mirror everything is already up to date and freeze the
  // festival schedule. (Without this branch it would fall through to the
  // unknown-type branch below, which accepts a write from anybody.) No grant —
  // nothing here is for clients; the tick reads it unfiltered in admin mode.
  if (type === 'schedulesync') {
    if (!user.isOwner) throw { forbidden: 'owner only' };
    return { channels: ['discard'], grant: {} };
  }

  // The load-shed switch (`_id: 0-load-shed`, see loadshed.js): one owner-written
  // doc whose `level` turns viewer-driven work off during the festival rush
  // without a redeploy. Two halves, both load-bearing:
  //
  //   WORLD-READABLE — it rides the same public `schedule` channel as the
  //   scheduleitem docs, so it replicates to EVERY client's local store,
  //   anonymous ones included. A switch only signed-in viewers could see would
  //   shed nothing (anonymous browsing is most of the festival traffic), and
  //   riding the existing public channel costs no new channel and no per-user
  //   keying. There is nothing private in it: it says "picks are paused".
  //
  //   OWNER-ONLY WRITE — a signed-in stranger who could write it would be able
  //   to flip everyone's app read-only, or hide the Friends tab for the whole
  //   festival, from a single `db put`. That is a pure griefing vector, so it
  //   gets the same treatment as the mirror's state doc and the heartbeat. The
  //   unknown-type branch at the bottom accepts a write from anybody, which is
  //   exactly why this branch has to exist. Deletes (a write, tombstoned with no
  //   `type`) stay in here via the oldDoc fallback at the top of the file.
  if (type === 'loadshed') {
    if (!user.isOwner) throw { forbidden: 'owner only' };
    return { channels: ['schedule'], grant: { public: ['schedule'] } };
  }

  // The tick's liveness heartbeat (`_id: 0-tick-heartbeat`): one doc, restamped
  // roughly hourly by the `scheduled` lane, whose timestamp is the only durable
  // evidence the alarm is still running (a vibe backend's console output goes
  // nowhere — platform #4305). Read it with
  //   vibes-diy db get 0-tick-heartbeat --db pickathon --vibe og/pickathon-picker
  // OWNER-ONLY WRITE, for the same reason as the mirror's state doc above: a
  // signed-in stranger who could restamp it would forge liveness for a tick
  // that has been dead for days, which is exactly the alarm this doc is. No
  // grant — it is ops evidence, never client data.
  if (type === 'heartbeat') {
    if (!user.isOwner) throw { forbidden: 'owner only' };
    return { channels: ['discard'], grant: {} };
  }

  // RETIRED: `schedulecache` was a per-user write-through copy of the whole feed
  // (`_id: schedule-cache-{userId}`), from before the server-maintained
  // `scheduleitem` docs above became the single source. It stored the SAME public
  // schedule once per user — 10 copies × ~96 KB was 74% of this db, and every
  // `scheduled` tick (which queries the whole db) paid for it. The app no longer
  // reads or writes it; legacy docs fall through to the unknown-type branch below
  // (accepted, routed to `discard`, unreadable) exactly like retired `friend` docs.
  // Removing the owner check here is also what makes the leftovers DELETABLE: the
  // old branch threw 'not owner' for every handle but the doc's own, so not even
  // the vibe owner could sweep them.

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
