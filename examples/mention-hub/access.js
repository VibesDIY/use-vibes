// mention-hub: the Bluesky mention-builds console (#3323). Owner-only, same
// shape as vibes/meta-hub: the credential vault is write-only (channel granted
// to NO ONE — only the scheduled backend reads it, in admin mode), and the
// mention ledger / oplog / config live on an owner-granted ops channel. The
// CI builder lane authenticates as the owner account, so it passes the same
// gates when it reads pending builds and writes results back.
export default function (doc, oldDoc, user, ctx) {
  if (!user || !user.isOwner) throw { forbidden: "mention-hub is owner-only" };
  if (doc.kind === "token") {
    // Write-only intake: the owner can WRITE the credential doc (paste form,
    // session rotation), but no browser ever syncs it back. The dashboard
    // reads the redacted `token-status` projection instead.
    return { channels: ["vault"] };
  }
  if (doc.kind === "mention" || doc.kind === "oplog" || doc.kind === "token-status" || doc.kind === "listener-state" || doc.kind === "config") {
    return { channels: ["ops"], grant: { roles: { owner: ["ops"] } } };
  }
  throw { forbidden: "unknown document type" };
}
