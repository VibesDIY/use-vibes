// mention-hub backend: the Bluesky half of social mention builds (#3323).
// Listens for @-mentions of the platform account that carry a prompt, applies
// the guardrails (dedupe, per-author + global daily caps, moderation), records
// each mention as a `mention` doc, and — once the CI builder lane
// (scripts/mention-builds.mjs) has built + published the vibe and verified it
// live — replies in-thread with a screenshot and the vibe link.
//
// Everything credential-touching runs in `scheduled` on purpose, exactly like
// vibes/meta-hub: it's the only lane that can query access-fn-bound databases
// (admin mode, as the owner), so the vault is structurally unreadable from
// fetch/onChange. The Bluesky XRPC client, credential parsing, and lazy
// session minting are ported from vibes/meta-hub/backend.js — same vault doc
// shape, so the same `identifier:app-password` paste works in both consoles.
//
// The quiet-failure rule (#3323 guardrails): this backend only ever posts a
// reply for a mention whose status is `built` — a status only the builder lane
// sets, and only after the published vibe answered 200. Build failures,
// moderation skips, cap skips, and reply errors are recorded on the doc and
// never posted anywhere. Reply text is a fixed template — model output is
// never echoed into our reply (prompt-injection-into-our-own-reply defense).
export const config = { scheduled: { interval: "1m" } };

const BSKY_HOST = "https://bsky.social";
export const BSKY_MAX_TEXT = 300; // code points, conservative for ZWJ emoji
const MAX_REPLY_ATTEMPTS = 5;

// Guardrail defaults (#3323: "required, this is unauthenticated compute").
// Overridable per-field via an owner-written `config` doc (kind "config",
// _id "config") in the oplog db — the dashboard has a form for it.
export const DEFAULTS = {
  maxPerAuthorPerDay: 2, // accepted builds per requester per UTC day
  maxGlobalPerDay: 20, // accepted builds per UTC day — the spend ceiling
  maxNewPerTick: 5, // newly accepted builds per tick (burst brake)
  maxRepliesPerTick: 2, // replies posted per tick
  minPromptChars: 8, // shorter than this isn't a prompt
  maxPromptChars: 2000,
  dedupeWindowDays: 7, // identical prompts inside this window are skipped
};

// --- Bluesky XRPC client (ported from vibes/meta-hub/backend.js) -------------
// The XRPC API is fully CORS-open (ACAO *), so these calls ride the CORS-parity
// egress lane — no platform allowlist entry needed.
async function bskyFetch(path, { method = "GET", body, token } = {}) {
  let res;
  try {
    res = await fetch(`${BSKY_HOST}/xrpc/${path}`, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    return { ok: false, transport: String((e && e.message) || e) };
  }
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = { raw: true };
  }
  if (data && data.vibesEgressDenied) return { ok: false, egressDenied: data.gate || true };
  if (!res.ok) {
    return { ok: false, status: res.status, code: data.error, message: data.message || data.error || `HTTP ${res.status}` };
  }
  return { ok: true, data };
}

// Raw-bytes variant for com.atproto.repo.uploadBlob — the one XRPC call whose
// body is not JSON.
async function bskyUploadBlob(bytes, contentType, token) {
  let res;
  try {
    res = await fetch(`${BSKY_HOST}/xrpc/com.atproto.repo.uploadBlob`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": contentType },
      body: bytes,
    });
  } catch (e) {
    return { ok: false, transport: String((e && e.message) || e) };
  }
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = { raw: true };
  }
  if (data && data.vibesEgressDenied) return { ok: false, egressDenied: data.gate || true };
  if (!res.ok) return { ok: false, status: res.status, message: data.message || data.error || `HTTP ${res.status}` };
  return { ok: true, blob: data.blob };
}

// The paste is `identifier:app-password`; split on the LAST colon so DIDs
// (`did:plc:...`) survive intact.
export function bskyParseCredential(paste) {
  const i = (paste || "").lastIndexOf(":");
  if (i <= 0 || i === paste.length - 1) return null;
  return { identifier: paste.slice(0, i).trim(), password: paste.slice(i + 1).trim() };
}

// Bluesky does NOT auto-detect links; facet offsets are UTF-8 BYTE positions.
export function bskyLinkFacets(text) {
  const enc = new TextEncoder();
  const facets = [];
  const re = /https?:\/\/\S+/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const byteStart = enc.encode(text.slice(0, m.index)).length;
    facets.push({
      index: { byteStart, byteEnd: byteStart + enc.encode(m[0]).length },
      features: [{ $type: "app.bsky.richtext.facet#link", uri: m[0] }],
    });
  }
  return facets;
}

export function bskyPermalink(uri, handle) {
  const rkey = (uri || "").split("/").pop();
  return rkey && handle ? `https://bsky.app/profile/${handle}/post/${rkey}` : null;
}

// Access JWTs last ~2h; a session minted within this window is reused without
// a network round-trip. refreshSession keeps the lineage alive off the cached
// refresh JWT; createSession (rate-limited ~300/day) is the paste-time and
// dead-lineage fallback only.
const BSKY_SESSION_FRESH_MS = 30 * 60000;

async function bskySession(ctx, t) {
  const persist = async (data) => {
    const next = {
      ...t,
      did: data.did || t.did,
      handle: data.handle || t.handle,
      accessJwt: data.accessJwt,
      refreshJwt: data.refreshJwt,
      refreshedAt: new Date().toISOString(),
      needsReauth: false,
      lastError: null,
    };
    await ctx.db.put(next, { db: "vault" });
    // Mutate the caller's snapshot too: atproto refresh tokens are single-use,
    // and later calls in the same tick must see the rotated JWTs.
    Object.assign(t, next);
    return { accessJwt: data.accessJwt, t: next };
  };
  if (t.accessJwt && Date.now() - new Date(t.refreshedAt || 0).getTime() < BSKY_SESSION_FRESH_MS) {
    return { accessJwt: t.accessJwt, t };
  }
  if (t.refreshJwt) {
    const r = await bskyFetch("com.atproto.server.refreshSession", { method: "POST", token: t.refreshJwt });
    if (r.ok) return persist(r.data);
    // An expired/revoked refresh JWT is recoverable — fall through to the app password.
  }
  const cred = bskyParseCredential(t.token);
  if (!cred) return { r: { ok: false, status: 401, message: "bsky credential must be `identifier:app-password`" } };
  const r = await bskyFetch("com.atproto.server.createSession", {
    method: "POST",
    body: { identifier: cred.identifier, password: cred.password },
  });
  if (!r.ok) return { r };
  return persist(r.data);
}

// --- Pure mention-triage helpers (unit-tested in backend.test.js) ------------

export function dayKey(iso) {
  return String(iso || "").slice(0, 10);
}

// A mention doc's id is derived from the post's at-uri, so reprocessing the
// same notification is a natural no-op (idempotency without a cursor).
// at://did:plc:xyz/app.bsky.feed.post/3lc2abc → mention-did:plc:xyz-3lc2abc
export function mentionDocId(uri) {
  const m = /^at:\/\/([^/]+)\/[^/]+\/([^/]+)$/.exec(uri || "");
  if (!m) return null;
  return `mention-${m[1]}-${m[2]}`.replace(/[^a-zA-Z0-9:._-]/g, "_");
}

// Strip every @-mention of OUR handle (the trigger token), collapse
// whitespace. Other @-mentions stay — they may be part of the prompt.
export function extractPrompt(text, selfHandle) {
  let s = String(text || "");
  if (selfHandle) {
    const escaped = selfHandle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    s = s.replace(new RegExp(`@${escaped}\\b`, "gi"), " ");
  }
  return s.replace(/\s+/g, " ").trim();
}

// Dedupe key: case- and punctuation-insensitive so "Make me a todo app!" and
// "make me a TODO app" collapse.
export function promptKey(prompt) {
  return String(prompt || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "-");
}

// Conservative prompt gate. False positives just mean a silent skip (the
// requester can rephrase); false negatives still face the codegen pipeline's
// own safety behavior downstream. Prompts carrying URLs are skipped outright —
// link spam is the top abuse vector for a public trigger, and a legit build
// prompt doesn't need one.
const MODERATION_PATTERNS = [
  { re: /https?:\/\//i, reason: "prompt contains a link" },
  { re: /\b(nsfw|porn|nude|naked|sexual|xxx|erotic|hentai)\b/i, reason: "adult content" },
  { re: /\b(airdrop|presale|pump\s*and\s*dump|wallet\s*drainer|seed\s*phrase)\b/i, reason: "crypto-scam pattern" },
  { re: /\b(phishing|keylogger|malware|ransomware|ddos|botnet)\b/i, reason: "abuse tooling" },
  { re: /\b(kill|murder|bomb|shoot|massacre)\b/i, reason: "violent content" },
];

export function moderatePrompt(prompt, cfg = DEFAULTS) {
  const chars = [...String(prompt || "")].length;
  if (chars < cfg.minPromptChars) return { ok: false, reason: "prompt too short" };
  if (chars > cfg.maxPromptChars) return { ok: false, reason: "prompt too long" };
  for (const { re, reason } of MODERATION_PATTERNS) {
    if (re.test(prompt)) return { ok: false, reason: `moderation: ${reason}` };
  }
  return { ok: true };
}

// The tick's triage core: turn one page of notifications into the mention docs
// to write, enforcing every guardrail against the docs that already exist.
// Pure — all clock and db state comes in as arguments.
export function planMentions({ notifications, selfDid, selfHandle, existing, cfg, nowIso }) {
  const day = dayKey(nowIso);
  const existingIds = new Set(existing.map((d) => d._id));
  const accepted = existing.filter((d) => d.kind === "mention" && d.status !== "skipped");
  const windowStart = new Date(new Date(nowIso).getTime() - cfg.dedupeWindowDays * 86400000).toISOString();
  const recentKeys = new Set(accepted.filter((d) => (d.createdAt || "") >= windowStart).map((d) => d.promptKey));
  let todayCount = accepted.filter((d) => d.day === day).length;
  const authorCounts = new Map();
  for (const d of accepted) {
    if (d.day === day) authorCounts.set(d.authorDid, (authorCounts.get(d.authorDid) || 0) + 1);
  }

  const out = [];
  let acceptedThisTick = 0;
  const mentionsOldestFirst = (notifications || [])
    .filter((n) => n.reason === "mention" && n.uri && n.cid)
    .sort((a, b) => ((a.indexedAt || "") < (b.indexedAt || "") ? -1 : 1));

  for (const n of mentionsOldestFirst) {
    const id = mentionDocId(n.uri);
    if (!id || existingIds.has(id)) continue;
    existingIds.add(id);
    const record = n.record || {};
    const reply = record.reply || {};
    const base = {
      _id: id,
      kind: "mention",
      uri: n.uri,
      cid: n.cid,
      rootUri: (reply.root && reply.root.uri) || n.uri,
      rootCid: (reply.root && reply.root.cid) || n.cid,
      authorDid: (n.author && n.author.did) || null,
      authorHandle: (n.author && n.author.handle) || null,
      text: record.text || "",
      indexedAt: n.indexedAt || nowIso,
      day,
      attempts: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    const skip = (reason) => out.push({ ...base, prompt: base.prompt || "", status: "skipped", reason });

    if (base.authorDid === selfDid) {
      skip("own post");
      continue;
    }
    const prompt = extractPrompt(base.text, selfHandle);
    const key = promptKey(prompt);
    base.prompt = prompt;
    base.promptKey = key;
    const mod = moderatePrompt(prompt, cfg);
    if (mod.ok !== true) {
      skip(mod.reason);
      continue;
    }
    if (recentKeys.has(key)) {
      skip("duplicate prompt");
      continue;
    }
    if ((authorCounts.get(base.authorDid) || 0) >= cfg.maxPerAuthorPerDay) {
      skip("author daily cap");
      continue;
    }
    if (todayCount >= cfg.maxGlobalPerDay) {
      skip("global daily cap");
      continue;
    }
    if (acceptedThisTick >= cfg.maxNewPerTick) {
      // Not recorded as skipped: leave it unwritten so next tick's page picks
      // it up fresh — a burst brake, not a verdict.
      continue;
    }
    out.push({ ...base, status: "pending-build" });
    acceptedThisTick += 1;
    todayCount += 1;
    authorCounts.set(base.authorDid, (authorCounts.get(base.authorDid) || 0) + 1);
    recentKeys.add(key);
  }
  return out;
}

// The in-thread reply. Fixed template — never model output, never error text.
export function buildReplyRecord({ mention, vibeUrl, createdAt, embed }) {
  const text = `Built it — try it live: ${vibeUrl}\n\nMake your own at https://vibes.diy`;
  if ([...text].length > BSKY_MAX_TEXT) return { error: `reply text is ${[...text].length} chars (max ${BSKY_MAX_TEXT})` };
  return {
    record: {
      $type: "app.bsky.feed.post",
      text,
      createdAt,
      facets: bskyLinkFacets(text),
      reply: {
        root: { uri: mention.rootUri, cid: mention.rootCid },
        parent: { uri: mention.uri, cid: mention.cid },
      },
      ...(embed ? { embed } : {}),
    },
  };
}

// --- Tick plumbing ------------------------------------------------------------

async function log(ctx, entry) {
  await ctx.db.put({ kind: "oplog", at: new Date().toISOString(), ...entry }, { db: "oplog" });
}

async function loadConfig(ctx) {
  const docs = await ctx.db.query({ db: "oplog" });
  const cfgDoc = docs.find((d) => d.kind === "config") || {};
  const cfg = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) {
    if (typeof cfgDoc[k] === "number" && cfgDoc[k] >= 0) cfg[k] = cfgDoc[k];
  }
  return cfg;
}

// Redacted status projection for the dashboard (the vault channel is granted
// to no one — same write-only pattern as meta-hub).
async function projectTokenStatus(ctx, t) {
  const statuses = (await ctx.db.query({ db: "oplog" })).filter((d) => d.kind === "token-status");
  const next = {
    _id: "status-bsky",
    kind: "token-status",
    platform: "bsky",
    handle: (t && t.handle) || null,
    did: (t && t.did) || null,
    refreshedAt: (t && t.refreshedAt) || null,
    needsReauth: !!(t && t.needsReauth),
    lastError: (t && t.lastError) || null,
    hasToken: !!(t && t.token),
  };
  const prev = statuses.find((s) => s._id === next._id);
  const changed =
    !prev || ["handle", "did", "refreshedAt", "needsReauth", "lastError", "hasToken"].some((k) => prev[k] !== next[k]);
  if (changed) await ctx.db.put({ ...next, at: new Date().toISOString() }, { db: "oplog" });
}

async function noteListenerState(ctx, patch) {
  const docs = await ctx.db.query({ db: "oplog" });
  const prev = docs.find((d) => d._id === "listener-state") || { _id: "listener-state", kind: "listener-state" };
  await ctx.db.put({ ...prev, ...patch, at: new Date().toISOString() }, { db: "oplog" });
}

// Verify a fresh paste: minting a session IS the verification (it answers with
// the account's did + handle, which bskySession persists on the vault doc).
async function enrichToken(ctx, t) {
  const s = await bskySession(ctx, t);
  if (s.accessJwt) {
    await ctx.db.put({ ...s.t, needsReauth: false, lastError: null }, { db: "vault" });
    await log(ctx, { op: "token-verified", platform: "bsky", handle: s.t.handle });
  } else {
    await ctx.db.put({ ...t, needsReauth: s.r.status === 401, lastError: s.r.message || JSON.stringify(s.r) }, { db: "vault" });
    await log(ctx, { op: "token-verify-failed", platform: "bsky", error: s.r.message || s.r.egressDenied });
  }
}

// Fetch the publish screenshot and turn it into an images embed. Best-effort:
// any failure (egress-blocked, not yet captured, wrong content type) degrades
// to the external link-card embed — the reply still ships.
async function screenshotEmbed(m, accessJwt) {
  if (!m.screenshotUrl) return null;
  let res;
  try {
    res = await fetch(m.screenshotUrl);
  } catch {
    return null;
  }
  const contentType = (res.headers && res.headers.get && res.headers.get("content-type")) || "";
  if (!res.ok || !contentType.startsWith("image/")) return null;
  const bytes = await res.arrayBuffer();
  // Bluesky rejects blobs >~1MB; the publish screenshot is a q85 720p JPEG
  // (well under), but guard anyway rather than fail the createRecord.
  if (bytes.byteLength === 0 || bytes.byteLength > 950000) return null;
  const up = await bskyUploadBlob(bytes, contentType, accessJwt);
  if (!up.ok) return null;
  return {
    $type: "app.bsky.embed.images",
    images: [{ image: up.blob, alt: "Screenshot of the app built from this post", aspectRatio: { width: 1280, height: 720 } }],
  };
}

async function replyToMention(ctx, m, t, accessJwt) {
  const save = (patch) =>
    ctx.db.put({ ...m, ...patch, attempts: (m.attempts || 0) + 1, updatedAt: new Date().toISOString() }, { db: "requests" });
  if ((m.attempts || 0) >= MAX_REPLY_ATTEMPTS) {
    // Quiet failure: never post an error, just stop trying.
    await log(ctx, { op: "reply-gave-up", uri: m.uri });
    return save({ status: "error", error: `reply gave up after ${MAX_REPLY_ATTEMPTS} attempts` });
  }
  try {
    // The fallback card is constant text like everything else we post: the
    // no-echo invariant covers embed metadata too — untrusted prompt text
    // must never ride into our outbound post body (Charlie review, #3329).
    const embed = (await screenshotEmbed(m, accessJwt)) || {
      $type: "app.bsky.embed.external",
      external: { uri: m.vibeUrl, title: "Live on Vibes DIY", description: "Built with Vibes DIY — prompt to app." },
    };
    const body = buildReplyRecord({ mention: m, vibeUrl: m.vibeUrl, createdAt: new Date().toISOString(), embed });
    if (body.error) return save({ status: "error", error: body.error });
    const r = await bskyFetch("com.atproto.repo.createRecord", {
      method: "POST",
      body: { repo: t.did, collection: "app.bsky.feed.post", record: body.record },
      token: accessJwt,
    });
    if (!r.ok) {
      if (r.status === 401) {
        // Dead credential: flag the vault doc and hold — the tick skips
        // needsReauth tokens, so this doc resumes after a fresh paste.
        await ctx.db.put({ ...t, needsReauth: true, lastError: r.message }, { db: "vault" });
        await log(ctx, { op: "reply-held", uri: m.uri, error: "token needs re-auth" });
        return save({ status: "built" });
      }
      await log(ctx, { op: "reply-failed", uri: m.uri, error: r.message || r.egressDenied || r.transport });
      return save({ status: "built" }); // retry next tick, bounded by MAX_REPLY_ATTEMPTS
    }
    const permalink = bskyPermalink(r.data.uri, t.handle);
    await save({ status: "replied", replyUri: r.data.uri || null, replyPermalink: permalink, repliedAt: new Date().toISOString() });
    await log(ctx, { op: "replied", uri: m.uri, vibeUrl: m.vibeUrl, permalink });
  } catch (e) {
    await save({ status: "built", lastError: String((e && e.message) || e) });
  }
}

export async function scheduled(event, ctx) {
  const vault = (await ctx.db.query({ db: "vault" })).filter((d) => d.kind === "token" && d.platform === "bsky");
  const t = vault[0];
  await projectTokenStatus(ctx, t);
  if (!t || !t.token) return;
  if (!t.did || !t.handle) {
    await enrichToken(ctx, t);
    return;
  }
  if (t.needsReauth) return;

  const cfg = await loadConfig(ctx);
  const s = await bskySession(ctx, t);
  if (!s.accessJwt) {
    await noteListenerState(ctx, { lastError: s.r.message || s.r.egressDenied || s.r.transport || "session failed" });
    return;
  }

  const existing = (await ctx.db.query({ db: "requests" })).filter((d) => d.kind === "mention");

  // 1. Listen: one page of the newest notifications. Deterministic doc ids
  // make reprocessing idempotent, so no cursor bookkeeping is needed; a burst
  // deeper than one page ages out unprocessed (documented in the RUNBOOK).
  const nowIso = new Date().toISOString();
  const rList = await bskyFetch("app.bsky.notification.listNotifications?limit=50", { token: s.accessJwt });
  if (rList.ok) {
    const plan = planMentions({
      notifications: rList.data.notifications || [],
      selfDid: s.t.did,
      selfHandle: s.t.handle,
      existing,
      cfg,
      nowIso,
    });
    for (const doc of plan) {
      await ctx.db.put(doc, { db: "requests" });
      if (doc.status === "pending-build") await log(ctx, { op: "mention-accepted", uri: doc.uri, prompt: doc.prompt });
    }
    await noteListenerState(ctx, { lastPollAt: nowIso, lastError: null, newDocs: plan.length });
  } else {
    await noteListenerState(ctx, { lastPollAt: nowIso, lastError: rList.message || rList.egressDenied || rList.transport });
  }

  // 2. Reply to verified-live builds (the builder lane sets `built` only after
  // the published vibe answered 200).
  const built = existing.filter((d) => d.status === "built" && d.vibeUrl);
  for (const m of built.slice(0, cfg.maxRepliesPerTick)) {
    await replyToMention(ctx, m, s.t, s.accessJwt);
  }
}
