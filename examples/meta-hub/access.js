// meta-hub: the Vibes DIY social-publishing console. Everything in this app —
// Meta API tokens (vault), publish requests, and the operations log — is
// owner-only. The scheduled backend acts as the owner (admin mode), so it
// passes these gates; no other identity can read or write anything here.
export default function (doc, oldDoc, user, ctx) {
  if (!user || !user.isOwner) throw { forbidden: 'meta-hub is owner-only' };
  if (doc.kind === 'token') {
    // Write-only intake: the owner can WRITE token docs (the paste form and
    // the scheduled rotator), but the `vault` channel is granted to NO ONE,
    // so raw token values never sync to any browser — not even the owner's.
    // Only the scheduled handler reads them, and it does so in admin mode,
    // which bypasses the read ACL. The dashboard reads the redacted
    // `token-status` projection (below) instead.
    return { channels: ['vault'] };
  }
  if (doc.kind === 'publish-request' || doc.kind === 'oplog' || doc.kind === 'token-status') {
    return { channels: ['ops'], grant: { roles: { owner: ['ops'] } } };
  }
  throw { forbidden: 'unknown document type' };
}
