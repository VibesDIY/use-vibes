// meta-hub backend: token vault rotation + Instagram carousel publishing.
// Everything token-touching runs in `scheduled` on purpose — it's the only
// lane that can query access-fn-bound databases (admin mode, as the owner),
// so the vault is structurally unreadable from fetch/onChange. Each tick:
//   1. probe egress (a tokenless Graph call — proves the proxy path works)
//   2. rotate any token older than ROTATE_AFTER_DAYS via refresh_access_token
//   3. advance pending publish-requests through the container -> publish
//      state machine, persisting progress so a slow container just resumes
//      on the next tick.
export const config = { scheduled: { interval: '1m' } };

const HOSTS = {
  ig: 'https://graph.instagram.com',
  threads: 'https://graph.threads.net',
  fbpage: 'https://graph.facebook.com',
  linkedin: 'https://api.linkedin.com',
  bsky: 'https://bsky.social',
};
const REFRESH_GRANT = { ig: 'ig_refresh_token', threads: 'th_refresh_token' };
// Instagram's Graph API is versioned v23.0; the Threads API is its own
// surface versioned v1.0 — a v23.0 path 404s on graph.threads.net.
const VER = { ig: 'v23.0', threads: 'v1.0', fbpage: 'v23.0' };
const ROTATE_AFTER_DAYS = 7;
const MAX_ATTEMPTS = 15;
// Platforms whose tokens the rotator must NOT touch: fbpage Page tokens have
// no scheduled expiration; LinkedIn CANNOT self-rotate — the refresh_token
// grant is restricted to approved Marketing partners, so a member token just
// dies at ~60 days and the owner re-pastes (the dashboard countdown warns);
// bsky's pasted app password never expires and its short-lived session JWTs
// are minted lazily at publish time (see bskySession), never on the timer.
const NO_ROTATE = new Set(['fbpage', 'linkedin', 'bsky']);

async function graph(host, path, { method = 'GET', params = {}, token } = {}) {
  const qs = new URLSearchParams(params);
  if (token) qs.set('access_token', token);
  let res;
  try {
    res =
      method === 'POST'
        ? await fetch(`${host}/${path}`, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: qs.toString(),
          })
        : await fetch(`${host}/${path}?${qs.toString()}`);
  } catch (e) {
    return { ok: false, transport: String((e && e.message) || e) };
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = { raw: true };
  }
  if (data && data.vibesEgressDenied) return { ok: false, egressDenied: data.gate || true };
  if (!res.ok || (data && data.error)) {
    const err = (data && data.error) || {};
    return { ok: false, code: err.code, message: err.message || `HTTP ${res.status}` };
  }
  return { ok: true, data };
}

// --- LinkedIn: not a Meta dialect, its own tiny client -----------------------
// Differences that keep it out of graph()/DIALECT: Bearer-header auth (never a
// query param), JSON bodies, two mandatory version headers, and the created
// post's id arrives in the x-restli-id RESPONSE HEADER of an empty 201 body.
// Egress-wise api.linkedin.com sends no CORS headers, so these calls ride the
// platform allowlist (vibes.diy/api/svc/intern/egress-platform-list.ts), not
// the CORS lane — the dashboard's "linkedin lane" probe shows whether that
// allowlist is deployed.
// LinkedIn versions monthly (YYYYMM) and sunsets versions after ~1 year; when
// this one sunsets, publishes fail with a clear version error in lastError —
// bump the constant.
export const LI_VERSION = '202606';
export const LI_MAX_TEXT = 3000;

export async function liFetch(path, { method = 'GET', body, token } = {}) {
  let res;
  try {
    res = await fetch(`${HOSTS.linkedin}/${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        'linkedin-version': LI_VERSION,
        'x-restli-protocol-version': '2.0.0',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    return { ok: false, transport: String((e && e.message) || e) };
  }
  let data = {};
  try {
    const text = await res.text();
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: true };
  }
  if (data && data.vibesEgressDenied) return { ok: false, egressDenied: data.gate || true };
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      code: data.serviceErrorCode,
      message: data.message || `HTTP ${res.status}`,
    };
  }
  return { ok: true, data, id: res.headers.get('x-restli-id') };
}

// LinkedIn commentary is "little text format": these characters are control
// syntax and unescaped ones 400 the post (parentheses in normal prose are the
// classic trip-up). `#` stays live so hashtags keep working; escaping @[]()
// means mention templates can't be authored from a caption — acceptable here.
export function liEscape(s) {
  return String(s).replace(/[\\|{}@[\]()<>*_~]/g, (c) => `\\${c}`);
}

// Build the article-share body, or return { error } for a bad request doc.
// LinkedIn's Posts API does not scrape URLs (docs are explicit — partners set
// title/description/thumbnail themselves), so the card carries exactly what the
// request provides: source link + title + optional description, and an optional
// `thumbnail` image URN (from liUploadThumb) for the card picture.
export function liPostBody(author, req, thumbnail) {
  const text = req.caption || '';
  const link = req.link || (text.match(/https?:\/\/\S+/) || [])[0];
  if (!link)
    return {
      error: 'linkedin article share needs a link (a `link` field or a URL in the caption)',
    };
  const commentary = liEscape(text);
  if (commentary.length > LI_MAX_TEXT) {
    return {
      error: `linkedin text is ${commentary.length} chars after escaping (max ${LI_MAX_TEXT})`,
    };
  }
  return {
    post: {
      author,
      commentary,
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      content: {
        article: {
          source: link,
          title: req.title || req.slug || link,
          ...(req.description ? { description: req.description } : {}),
          // A `urn:li:image:…` from the Images API upload (liUploadThumb) gives
          // the card a picture; LinkedIn never scrapes the URL, so without it
          // the card is text-only. Best-effort — omitted on any upload failure.
          ...(thumbnail ? { thumbnail } : {}),
        },
      },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    },
  };
}

// A dead LinkedIn token is an HTTP 401 (Meta's equivalent is code 190).
export function liTokenDead(r) {
  return r.status === 401;
}

// --- LinkedIn Images API: article-card thumbnail upload ----------------------
// Two hops, both Bearer server-to-server (no CORS → they ride the platform
// egress allowlist, NOT the CORS lane):
//   1. POST /rest/images?action=initializeUpload {initializeUploadRequest:{owner}}
//      → { value: { uploadUrl, image } }; uploadUrl is a signed one-time URL on
//      www.linkedin.com/dms-uploads/<opaque>, image is the urn:li:image:… .
//   2. PUT the raw bytes to that uploadUrl.
// The image URN then goes on content.article.thumbnail (see liPostBody). A
// w_member_social token CANNOT GET /rest/images, so there is NO status poll —
// we reference the URN immediately and LinkedIn finishes processing async.
// Everything here is best-effort: the caller posts the text+link card on any
// error rather than failing the post.
async function liInitImageUpload(author, token) {
  const r = await liFetch('rest/images?action=initializeUpload', {
    method: 'POST',
    body: { initializeUploadRequest: { owner: author } },
    token,
  });
  if (!r.ok) return { error: r.message || r.egressDenied || `HTTP ${r.status}` };
  const v = (r.data && r.data.value) || {};
  if (!v.uploadUrl || !v.image) return { error: 'initializeUpload: missing uploadUrl/image' };
  return { uploadUrl: v.uploadUrl, image: v.image };
}

// Raw fetch, not liFetch: the uploadUrl is a full signed URL on www.linkedin.com
// (not an api.linkedin.com path) and must carry the image bytes, not the
// version/restli JSON headers. Bearer auth per LinkedIn's upload contract.
async function liPutImageBytes(uploadUrl, bytes, mimeType, token) {
  let res;
  try {
    res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': mimeType || 'application/octet-stream',
      },
      body: bytes,
    });
  } catch (e) {
    return { error: `image PUT transport: ${String((e && e.message) || e)}` };
  }
  // A denied egress PUT (allowlist not deployed) comes back as a JSON marker.
  if (res.status === 403) {
    try {
      const j = await res.json();
      if (j && j.vibesEgressDenied) return { error: `image PUT egress denied: ${j.gate || true}` };
    } catch {
      /* not JSON — fall through to the generic status error */
    }
  }
  if (!res.ok) return { error: `image PUT HTTP ${res.status}` };
  return { ok: true };
}

// Orchestrate bytes → init → put → { image } URN, or { error }. Best-effort
// caller (the linkedin publish branch) turns any error into a text-only post.
async function liUploadThumb(req, images, author, token) {
  const src = await cardThumbBytes(req, images);
  if (!src.bytes) return { error: src.error };
  const init = await liInitImageUpload(author, token);
  if (init.error) return { error: init.error };
  const put = await liPutImageBytes(init.uploadUrl, src.bytes, src.mimeType, token);
  if (put.error) return { error: put.error };
  return { image: init.image };
}

// --- Bluesky (AT Protocol): the sixth channel --------------------------------
// No egress allowlist needed, unlike LinkedIn: the XRPC API is fully CORS-open
// (ACAO *, preflights admit `authorization`) because Bluesky's own client is a
// browser SPA — so these calls ride the same CORS-parity lane as Meta.
// The credential model is different from every other platform: the owner
// pastes `identifier:app-password` ONCE (app passwords never expire); the
// backend mints short-lived session JWTs from it — refreshSession when the
// cached refresh JWT still works, createSession from the app password as
// fallback. createSession is rate-limited (~300/day per account), so sessions
// are minted lazily at publish/verify time, NEVER on the 1-minute timer.
export const BSKY_MAX_TEXT = 300; // graphemes; we count code points (conservative for ZWJ emoji)

async function bskyFetch(path, { method = 'GET', body, token } = {}) {
  let res;
  try {
    res = await fetch(`${HOSTS.bsky}/xrpc/${path}`, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
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
    return {
      ok: false,
      status: res.status,
      code: data.error,
      message: data.message || data.error || `HTTP ${res.status}`,
    };
  }
  return { ok: true, data };
}

// Bluesky's blob limit is 1,000,000 bytes; the branded card JPEGs are ~80KB.
const BSKY_BLOB_MAX = 1_000_000;

// POST raw image bytes to uploadBlob → { blob } or { error }. Best-effort: the
// caller posts without a thumb on any error rather than failing the post.
async function bskyUploadBlobBytes(bytes, mimeType, accessJwt) {
  if (!bytes || bytes.length === 0) return { error: 'empty thumb bytes' };
  if (bytes.length > BSKY_BLOB_MAX)
    return { error: `thumb too big: ${bytes.length} bytes (max ${BSKY_BLOB_MAX})` };
  let res;
  try {
    res = await fetch(`${HOSTS.bsky}/xrpc/com.atproto.repo.uploadBlob`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessJwt}`,
        'content-type': mimeType || 'application/octet-stream',
      },
      body: bytes,
    });
  } catch (e) {
    return { error: `uploadBlob transport: ${String((e && e.message) || e)}` };
  }
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (data && data.vibesEgressDenied)
    return { error: `uploadBlob egress denied: ${data.gate || true}` };
  if (!res.ok || !data.blob)
    return { error: data.message || data.error || `uploadBlob HTTP ${res.status}` };
  return { blob: data.blob };
}

// Get the card-thumbnail bytes for a request, or { error }. Platform-neutral:
// both Bluesky (uploadBlob) and LinkedIn (Images API) upload the same card
// bytes, they just differ in the upload call. Neither scrapes the URL, so the
// card is imageless without an upload. PRIMARY source is `thumbBase64` embedded
// in the doc — the backend CANNOT fetch our card images: `*.vibes.diy` is on
// the egress FLOOR denylist (#3048, SSRF prevention, beats every policy), so
// the queuer (which can read good.vibes.diy) inlines the bytes. FALLBACK is a
// URL in `images[0]`, which only works for non-floor, CORS-open hosts.
async function cardThumbBytes(req, images) {
  if (req.thumbBase64) {
    try {
      const bytes = Uint8Array.from(atob(req.thumbBase64), (c) => c.charCodeAt(0));
      return { bytes, mimeType: req.thumbMime || 'image/jpeg' };
    } catch (e) {
      return { error: `thumbBase64 decode: ${String((e && e.message) || e)}` };
    }
  }
  if (!images[0]) return { error: 'no thumb source (thumbBase64 or images[0])' };
  let img;
  try {
    img = await fetch(images[0]);
  } catch (e) {
    return { error: `thumb fetch transport: ${String((e && e.message) || e)}` };
  }
  const contentType = img.headers.get('content-type') || '';
  // A denied egress fetch comes back as a JSON marker, not image bytes (a
  // platform host hits the floor); an error page is also non-image.
  if (!img.ok || !contentType.startsWith('image/')) {
    let detail = `HTTP ${img.status}`;
    try {
      const j = await img.json();
      if (j && j.vibesEgressDenied) detail = `egress denied: ${j.gate || true}`;
    } catch {
      /* not JSON — keep the HTTP-status detail */
    }
    return {
      error: `thumb fetch not an image (${detail}, content-type: ${contentType || 'none'})`,
    };
  }
  try {
    return { bytes: new Uint8Array(await img.arrayBuffer()), mimeType: contentType };
  } catch (e) {
    return { error: `thumb body read: ${String((e && e.message) || e)}` };
  }
}

// The paste is `identifier:app-password`. App passwords are
// xxxx-xxxx-xxxx-xxxx (never a colon), while the identifier may be a handle,
// an email, or a DID (`did:plc:...`) — so split on the LAST colon, which is
// correct for all three (a first-colon split would shear a DID in half).
export function bskyParseCredential(paste) {
  const i = (paste || '').lastIndexOf(':');
  if (i <= 0 || i === paste.length - 1) return null;
  return { identifier: paste.slice(0, i).trim(), password: paste.slice(i + 1).trim() };
}

// Bluesky does NOT auto-detect links: a bare URL is plain text unless a facet
// marks it, and facet offsets are UTF-8 BYTE positions, not string indexes.
export function bskyLinkFacets(text) {
  const enc = new TextEncoder();
  const facets = [];
  const re = /https?:\/\/\S+/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const byteStart = enc.encode(text.slice(0, m.index)).length;
    facets.push({
      index: { byteStart, byteEnd: byteStart + enc.encode(m[0]).length },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: m[0] }],
    });
  }
  return facets;
}

// Build the post record, or return { error } for a bad request doc. Like
// LinkedIn, nothing is scraped: the website card (external embed) shows exactly
// what the request carries. Pass an uploaded `thumb` blob (from bskyUploadBlob)
// to give the card an image — Bluesky renders the external embed imageless
// without one.
export function bskyPostRecord(req, createdAt, thumb) {
  const text = req.caption || '';
  const chars = [...text].length;
  if (chars > BSKY_MAX_TEXT) return { error: `bsky text is ${chars} chars (max ${BSKY_MAX_TEXT})` };
  const link = req.link || (text.match(/https?:\/\/\S+/) || [])[0];
  if (!link) return { error: 'bsky post needs a link (a `link` field or a URL in the caption)' };
  return {
    record: {
      $type: 'app.bsky.feed.post',
      text,
      createdAt,
      facets: bskyLinkFacets(text),
      embed: {
        $type: 'app.bsky.embed.external',
        external: {
          uri: link,
          title: req.title || req.slug || link,
          description: req.description || '',
          ...(thumb ? { thumb } : {}),
        },
      },
    },
  };
}

export function bskyPermalink(uri, handle) {
  // at://did:plc:xyz/app.bsky.feed.post/<rkey> → the public app URL.
  const rkey = (uri || '').split('/').pop();
  return rkey && handle ? `https://bsky.app/profile/${handle}/post/${rkey}` : null;
}

// Access JWTs last ~2h; treat a session minted within this window as usable
// without another network round-trip.
const BSKY_SESSION_FRESH_MS = 30 * 60000;

// Mint a usable access JWT and persist rotated session state on the vault doc.
// Returns { accessJwt, t } on success or { r } carrying the failing result.
async function bskySession(ctx, t) {
  // Both session endpoints answer with the account's CURRENT did + handle —
  // persist them every time (a handle rename would otherwise leave permalinks
  // pointing at the dead old handle until the next re-paste).
  const persist = async (data) => {
    const next = {
      ...t,
      igUserId: data.did || t.igUserId,
      username: data.handle || t.username,
      accessJwt: data.accessJwt,
      refreshJwt: data.refreshJwt,
      refreshedAt: new Date().toISOString(),
      needsReauth: false,
      lastError: null,
    };
    await ctx.db.put(next, { db: 'vault' });
    // Also mutate the caller's snapshot in place: several requests in one
    // scheduled batch share this vault-doc snapshot, and the next one must
    // see the rotated JWTs — atproto refresh tokens are single-use, so
    // re-presenting the stale one would fall back to rate-limited
    // createSession every time.
    Object.assign(t, next);
    return { accessJwt: data.accessJwt, t: next };
  };
  if (t.accessJwt && Date.now() - new Date(t.refreshedAt || 0).getTime() < BSKY_SESSION_FRESH_MS) {
    return { accessJwt: t.accessJwt, t };
  }
  if (t.refreshJwt) {
    const r = await bskyFetch('com.atproto.server.refreshSession', {
      method: 'POST',
      token: t.refreshJwt,
    });
    if (r.ok) return persist(r.data);
    // An expired/revoked refresh JWT is recoverable — fall through to the app password.
  }
  const cred = bskyParseCredential(t.token);
  if (!cred)
    return {
      r: { ok: false, status: 401, message: 'bsky credential must be `identifier:app-password`' },
    };
  const r = await bskyFetch('com.atproto.server.createSession', {
    method: 'POST',
    body: { identifier: cred.identifier, password: cred.password },
  });
  if (!r.ok) return { r };
  return persist(r.data);
}

function daysSince(iso) {
  return iso ? (Date.now() - new Date(iso).getTime()) / 86400000 : Infinity;
}

async function log(ctx, entry) {
  await ctx.db.put({ kind: 'oplog', at: new Date().toISOString(), ...entry }, { db: 'oplog' });
}

async function probeEgress(ctx) {
  // A tokenless call: a Meta-shaped error JSON means the egress proxy passed
  // us through; an egress-denied marker or transport error means it didn't.
  const r = await graph(HOSTS.ig, `${VER.ig}/me`, { params: { access_token: 'probe' } });
  const status = r.egressDenied ? 'denied' : r.transport ? 'error' : 'live';
  await ctx.db.put(
    {
      _id: 'egress-probe',
      kind: 'oplog',
      op: 'egress-probe',
      status,
      detail: r.egressDenied
        ? `gate: ${r.egressDenied}`
        : r.transport || r.message || 'graph reachable',
      at: new Date().toISOString(),
    },
    { db: 'oplog' }
  );
  return status === 'live';
}

async function probeLinkedInLane(ctx) {
  // Tokenless GET straight at api.linkedin.com: a LinkedIn-shaped 401 means
  // the platform-allowlist egress lane passed us through; an egress-denied
  // marker means the allowlist isn't deployed (or was rolled back). This is
  // the safe-before-the-key check — the owner can watch this flip to `live`
  // on the dashboard before pasting a real token.
  const r = await liFetch('v2/userinfo', { token: 'probe' });
  const status = r.egressDenied ? 'denied' : r.transport ? 'error' : 'live';
  await ctx.db.put(
    {
      _id: 'egress-probe-linkedin',
      kind: 'oplog',
      op: 'egress-probe',
      status,
      detail: r.egressDenied
        ? `gate: ${r.egressDenied}`
        : r.transport || r.message || 'linkedin reachable',
      at: new Date().toISOString(),
    },
    { db: 'oplog' }
  );
  return status === 'live';
}

async function enrichToken(ctx, t) {
  if (t.platform === 'bsky') {
    // Verifying the paste IS minting a session: createSession answers with the
    // account's did + handle, which bskySession stores on the vault doc.
    const s = await bskySession(ctx, t);
    if (s.accessJwt) {
      // App passwords have no expiry — clear the paste-time countdown.
      await ctx.db.put(
        { ...s.t, expiresAt: null, needsReauth: false, lastError: null },
        { db: 'vault' }
      );
      await log(ctx, { op: 'token-verified', platform: t.platform, username: s.t.username });
    } else {
      await ctx.db.put(
        { ...t, needsReauth: s.r.status === 401, lastError: s.r.message || JSON.stringify(s.r) },
        { db: 'vault' }
      );
      await log(ctx, {
        op: 'token-verify-failed',
        platform: t.platform,
        error: s.r.message || s.r.egressDenied,
      });
    }
    return;
  }
  if (t.platform === 'linkedin') {
    // OpenID userinfo resolves the author URN; `sub` is the member id. Needs
    // the token minted with `openid profile w_member_social` scopes.
    const r = await liFetch('v2/userinfo', { token: t.token });
    if (r.ok && r.data.sub) {
      await ctx.db.put(
        {
          ...t,
          igUserId: `urn:li:person:${r.data.sub}`,
          username: r.data.name || null,
          needsReauth: false,
          lastError: null,
        },
        { db: 'vault' }
      );
      await log(ctx, {
        op: 'token-verified',
        platform: t.platform,
        username: r.data.name || r.data.sub,
      });
    } else {
      await ctx.db.put(
        { ...t, needsReauth: liTokenDead(r), lastError: r.message || JSON.stringify(r) },
        { db: 'vault' }
      );
      await log(ctx, {
        op: 'token-verify-failed',
        platform: t.platform,
        error: r.message || r.egressDenied,
      });
    }
    return;
  }
  const host = HOSTS[t.platform] || HOSTS.ig;
  const V = VER[t.platform] || VER.ig;
  const fields = t.platform === 'fbpage' ? 'id,name' : 'id,username';
  const r = await graph(host, `${V}/me`, { params: { fields }, token: t.token });
  if (r.ok) {
    let resolved = {
      igUserId: r.data.id,
      username: r.data.username || r.data.name,
      token: t.token,
    };
    if (t.platform === 'fbpage') {
      // Whatever page-capable credential got pasted (long-lived user token,
      // system-user token), resolve THROUGH it to the Page: /me/accounts
      // lists the Pages it manages, each with the Page's own derived token.
      // Posting must target the PAGE id — posting to the /me id (a user or
      // system user) fails with the #200 publish_actions error.
      const acc = await graph(host, `${V}/me/accounts`, { token: t.token });
      if (acc.ok && acc.data.data && acc.data.data.length > 0) {
        const page = acc.data.data[0];
        resolved = { igUserId: page.id, username: page.name, token: page.access_token || t.token };
      }
      // else: either a real Page token was pasted (/me/accounts is empty or
      // errors on a Page token, and /me already answered with the Page) —
      // keep resolved as-is — or the credential sees no Pages, in which case
      // the first publish will fail loudly with a clear Meta error.
    }
    await ctx.db.put(
      {
        ...t,
        ...resolved,
        pageResolved: t.platform === 'fbpage' ? true : undefined,
        // Long-lived Page tokens don't expire; clear the pasted-in countdown.
        expiresAt: t.platform === 'fbpage' ? null : t.expiresAt,
        needsReauth: false,
        lastError: null,
      },
      { db: 'vault' }
    );
    await log(ctx, { op: 'token-verified', platform: t.platform, username: resolved.username });
  } else {
    await ctx.db.put(
      { ...t, needsReauth: r.code === 190, lastError: r.message || JSON.stringify(r) },
      { db: 'vault' }
    );
    await log(ctx, {
      op: 'token-verify-failed',
      platform: t.platform,
      error: r.message || r.egressDenied,
    });
  }
}

async function rotateToken(ctx, t) {
  const host = HOSTS[t.platform] || HOSTS.ig;
  const r = await graph(host, 'refresh_access_token', {
    params: { grant_type: REFRESH_GRANT[t.platform] || REFRESH_GRANT.ig },
    token: t.token,
  });
  if (r.ok && r.data.access_token) {
    const now = new Date();
    await ctx.db.put(
      {
        ...t,
        token: r.data.access_token,
        refreshedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + (r.data.expires_in || 5184000) * 1000).toISOString(),
        needsReauth: false,
        lastError: null,
      },
      { db: 'vault' }
    );
    await log(ctx, { op: 'token-rotated', platform: t.platform, expiresIn: r.data.expires_in });
  } else {
    await ctx.db.put(
      { ...t, needsReauth: r.code === 190, lastError: r.message || JSON.stringify(r) },
      { db: 'vault' }
    );
    await log(ctx, {
      op: 'token-rotate-failed',
      platform: t.platform,
      error: r.message || r.egressDenied,
    });
  }
}

// Platform dialects: same container -> publish shape, different vocabulary.
// Threads: /threads + /threads_publish, `text` not `caption`, status polled
// via `status` + `error_message` (IG uses status_code + status), and it
// supports text-only posts (media_type=TEXT) whose links are clickable.
const DIALECT = {
  ig: {
    media: (uid) => `${uid}/media`,
    publish: (uid) => `${uid}/media_publish`,
    textParam: 'caption',
    statusFields: 'status_code,status',
    stat: (d) => d.status_code,
    detail: (d) => d.status,
    single: (url, text) => ({ image_url: url, caption: text }),
    child: (url) => ({ image_url: url, is_carousel_item: 'true' }),
    textOnly: null,
    maxText: 2200,
  },
  threads: {
    media: (uid) => `${uid}/threads`,
    publish: (uid) => `${uid}/threads_publish`,
    textParam: 'text',
    statusFields: 'status,error_message',
    stat: (d) => d.status,
    detail: (d) => d.error_message,
    single: (url, text) => ({ media_type: 'IMAGE', image_url: url, text }),
    child: (url) => ({ media_type: 'IMAGE', image_url: url, is_carousel_item: 'true' }),
    textOnly: (text) => ({ media_type: 'TEXT', text }),
    maxText: 500,
  },
};

async function advanceRequest(ctx, req, t) {
  const platform = HOSTS[t.platform] ? t.platform : 'ig';
  const host = HOSTS[platform];
  const V = VER[platform];
  const D = DIALECT[platform];
  const images = req.images || [];
  const text = req.caption || '';
  const save = (patch) =>
    ctx.db.put(
      { ...req, ...patch, attempts: (req.attempts || 0) + 1, updatedAt: new Date().toISOString() },
      { db: 'requests' }
    );
  // A platform failure is only terminal for THIS request when it isn't the
  // token's fault. A dead/expired credential (Meta code 190, LinkedIn/bsky
  // HTTP 401) flags the vault doc and holds the request at its current
  // status — the scheduled loop skips needsReauth tokens, so it resumes
  // untouched once the owner pastes a fresh one.
  const fail = async (r, label) => {
    if (platform === 'linkedin' || platform === 'bsky' ? r.status === 401 : r.code === 190) {
      await ctx.db.put({ ...t, needsReauth: true, lastError: r.message }, { db: 'vault' });
      await log(ctx, {
        op: 'publish-held',
        slug: req.slug,
        error: `token needs re-auth (${label})`,
      });
      return save({ status: req.status });
    }
    return save({
      status: 'error',
      error: `${label}: ${r.message || r.egressDenied || r.transport}`,
    });
  };
  if ((req.attempts || 0) >= MAX_ATTEMPTS) {
    return save({
      status: 'error',
      error: `gave up after ${MAX_ATTEMPTS} ticks (last: ${req.status})`,
    });
  }
  try {
    // Bluesky: synchronous — refresh-or-mint a session JWT, then one createRecord.
    // Text + link facet + website-card embed; `images[0]`, if present, becomes
    // the card's thumbnail (uploaded as a blob). Extra images are ignored (the
    // external embed carries a single thumb).
    if (platform === 'bsky') {
      const body = bskyPostRecord(req, new Date().toISOString());
      if (body.error) return save({ status: 'error', error: body.error });
      const s = await bskySession(ctx, t);
      if (!s.accessJwt) return fail(s.r, 'bsky session');
      // Best-effort card thumbnail: NOTHING here may block the post. The whole
      // block is wrapped so an unexpected throw (a body-read rejection, an
      // oplog write that fails) degrades to the imageless text+link card
      // instead of bubbling to the outer catch and terminal-erroring the post.
      // Bytes come from thumbBase64 (or an images[0] URL fallback).
      if (req.thumbBase64 || images[0]) {
        try {
          const src = await cardThumbBytes(req, images);
          if (src.bytes) {
            const up = await bskyUploadBlobBytes(src.bytes, src.mimeType, s.accessJwt);
            if (up.blob) body.record.embed.external.thumb = up.blob;
            else await log(ctx, { op: 'bsky-thumb-skipped', slug: req.slug, error: up.error });
          } else {
            await log(ctx, { op: 'bsky-thumb-skipped', slug: req.slug, error: src.error });
          }
        } catch (e) {
          // Even the skip-logging is best-effort — swallow so the post proceeds.
          try {
            await log(ctx, {
              op: 'bsky-thumb-skipped',
              slug: req.slug,
              error: `thumb path threw: ${String((e && e.message) || e)}`,
            });
          } catch {
            /* give up on logging; the post must still go out */
          }
        }
      }
      const r = await bskyFetch('com.atproto.repo.createRecord', {
        method: 'POST',
        body: { repo: s.t.igUserId, collection: 'app.bsky.feed.post', record: body.record },
        token: s.accessJwt,
      });
      if (!r.ok) return fail(r, 'bsky post');
      const permalink = bskyPermalink(r.data.uri, s.t.username);
      await save({ status: 'done', mediaId: r.data.uri || null, permalink });
      await log(ctx, {
        op: 'published',
        slug: req.slug,
        platform,
        mediaId: r.data.uri || null,
        permalink,
      });
      return;
    }
    // LinkedIn: synchronous like fbpage — one POST /rest/posts, no containers.
    // An article-link share, optionally with a card thumbnail uploaded via the
    // Images API (best-effort — see below). Extra images beyond the thumb are
    // ignored (the article embed carries a single thumbnail).
    if (platform === 'linkedin') {
      // Best-effort card thumbnail: NOTHING here may block the post (same
      // philosophy as bsky). Bytes come from thumbBase64 (or an images[0] URL
      // fallback); upload via the Images API and reference the returned URN.
      // Any failure → log `linkedin-thumb-skipped` and post the text+link card.
      let thumbUrn = null;
      if (req.thumbBase64 || images[0]) {
        try {
          const up = await liUploadThumb(req, images, t.igUserId, t.token);
          if (up.image) thumbUrn = up.image;
          else await log(ctx, { op: 'linkedin-thumb-skipped', slug: req.slug, error: up.error });
        } catch (e) {
          try {
            await log(ctx, {
              op: 'linkedin-thumb-skipped',
              slug: req.slug,
              error: `thumb path threw: ${String((e && e.message) || e)}`,
            });
          } catch {
            /* give up on logging; the post must still go out */
          }
        }
      }
      const body = liPostBody(t.igUserId, req, thumbUrn);
      if (body.error) return save({ status: 'error', error: body.error });
      const r = await liFetch('rest/posts', { method: 'POST', body: body.post, token: t.token });
      if (!r.ok) return fail(r, 'linkedin post');
      // No permalink GET needed: the feed URL is constructible from the URN.
      const permalink = r.id ? `https://www.linkedin.com/feed/update/${r.id}` : null;
      await save({ status: 'done', mediaId: r.id || null, permalink });
      await log(ctx, {
        op: 'published',
        slug: req.slug,
        platform,
        mediaId: r.id || null,
        permalink,
      });
      return;
    }
    // Facebook Pages: synchronous — no containers, no polling, done in one tick.
    if (platform === 'fbpage') {
      if (images.length > 1)
        return save({ status: 'error', error: 'multi-image not wired for fbpage yet' });
      let r;
      if (images.length === 1) {
        r = await graph(host, `${V}/${t.igUserId}/photos`, {
          method: 'POST',
          params: { url: images[0], message: text },
          token: t.token,
        });
      } else {
        const link = (text.match(/https?:\/\/\S+/) || [])[0];
        r = await graph(host, `${V}/${t.igUserId}/feed`, {
          method: 'POST',
          params: link ? { message: text, link } : { message: text },
          token: t.token,
        });
      }
      if (!r.ok) return fail(r, 'page post');
      const postId = r.data.post_id || r.data.id;
      const perma = await graph(host, `${V}/${postId}`, {
        params: { fields: 'permalink_url' },
        token: t.token,
      });
      await save({
        status: 'done',
        mediaId: postId,
        permalink: perma.ok ? perma.data.permalink_url : null,
      });
      await log(ctx, {
        op: 'published',
        slug: req.slug,
        platform,
        mediaId: postId,
        permalink: perma.ok ? perma.data.permalink_url : null,
      });
      return;
    }
    if (text.length > D.maxText) {
      return save({
        status: 'error',
        error: `${platform} text is ${text.length} chars (max ${D.maxText})`,
      });
    }
    // Text-only post (Threads only) or single image: one container, then publish.
    if (req.status === 'pending' && images.length <= 1) {
      let params;
      if (images.length === 0) {
        if (!D.textOnly)
          return save({ status: 'error', error: 'text-only posts are Threads-only' });
        params = D.textOnly(text);
      } else {
        params = D.single(images[0], text);
      }
      const r = await graph(host, `${V}/${D.media(t.igUserId)}`, {
        method: 'POST',
        params,
        token: t.token,
      });
      if (!r.ok) return fail(r, 'container');
      req = { ...req, carouselId: r.data.id };
      return save({ status: 'carousel-created', carouselId: req.carouselId });
    }
    if (req.status === 'pending') {
      const children = [];
      for (const url of images) {
        const r = await graph(host, `${V}/${D.media(t.igUserId)}`, {
          method: 'POST',
          params: D.child(url),
          token: t.token,
        });
        if (!r.ok) return fail(r, 'item container');
        children.push(r.data.id);
      }
      req = { ...req, children };
      // No same-tick fall-through: assembling the parent ~1s after the
      // children finish races Meta's backend (FINISHED != referenceable).
      // Let children settle a full tick.
      return save({ status: 'items-created', children });
    }
    if (req.status === 'items-created') {
      // Threads: authenticated GET /{id} status reads lack CORS headers and
      // get proxy-blocked, so don't poll children — they've settled a full
      // tick; a not-ready child fails the parent creation, which retries
      // next tick (bounded by MAX_ATTEMPTS).
      if (platform !== 'threads') {
        for (const id of req.children) {
          const r = await graph(host, `${V}/${id}`, {
            params: { fields: D.statusFields },
            token: t.token,
          });
          if (!r.ok) return fail(r, 'item status');
          if (D.stat(r.data) === 'ERROR')
            return save({
              status: 'error',
              error: `item ${id} failed: ${D.detail(r.data) || 'no detail'}`,
            });
          if (D.stat(r.data) !== 'FINISHED') return save({ status: 'items-created' }); // retry next tick
        }
      }
      const r = await graph(host, `${V}/${D.media(t.igUserId)}`, {
        method: 'POST',
        params: { media_type: 'CAROUSEL', children: req.children.join(','), [D.textParam]: text },
        token: t.token,
      });
      if (!r.ok) {
        if (platform === 'threads' && r.code !== 190) {
          await log(ctx, {
            op: 'threads-carousel-retry',
            slug: req.slug,
            error: r.message || r.egressDenied,
          });
          return save({ status: 'items-created' });
        }
        return fail(r, 'carousel container');
      }
      req = { ...req, carouselId: r.data.id, status: 'carousel-created' };
      await save({ status: 'carousel-created', carouselId: req.carouselId });
    }
    if (req.status === 'carousel-created') {
      // Threads object-reads (GET /{id}) come back without CORS headers when
      // authenticated, so the egress proxy rightly blocks them — and Threads
      // doesn't need the poll anyway: docs recommend ~30s settle and our tick
      // cadence guarantees 60s. Go straight to publish; a not-ready container
      // fails the publish, which we retry next tick (bounded by MAX_ATTEMPTS).
      if (platform !== 'threads') {
        const s = await graph(host, `${V}/${req.carouselId}`, {
          params: { fields: D.statusFields },
          token: t.token,
        });
        if (!s.ok) return fail(s, 'container status');
        if (D.stat(s.data) === 'ERROR')
          return save({
            status: 'error',
            error: `container failed: ${D.detail(s.data) || 'no detail'}`,
          });
        if (D.stat(s.data) !== 'FINISHED') return save({ status: 'carousel-created' }); // retry next tick
      }
      const p = await graph(host, `${V}/${D.publish(t.igUserId)}`, {
        method: 'POST',
        params: { creation_id: req.carouselId },
        token: t.token,
      });
      if (!p.ok) {
        if (platform === 'threads' && p.code !== 190) {
          // Container likely still processing — retry next tick instead of
          // terminal-erroring; MAX_ATTEMPTS bounds the loop.
          await log(ctx, {
            op: 'threads-publish-retry',
            slug: req.slug,
            error: p.message || p.egressDenied,
          });
          return save({ status: 'carousel-created' });
        }
        return fail(p, 'publish');
      }
      // Permalink read is best-effort: on Threads this GET can be
      // CORS-blocked by the proxy; done-with-null-permalink is still done.
      const perma = await graph(host, `${V}/${p.data.id}`, {
        params: { fields: 'permalink' },
        token: t.token,
      });
      await save({
        status: 'done',
        mediaId: p.data.id,
        permalink: perma.ok ? perma.data.permalink : null,
      });
      await log(ctx, {
        op: 'published',
        slug: req.slug,
        platform,
        mediaId: p.data.id,
        permalink: perma.ok ? perma.data.permalink : null,
      });
    }
  } catch (e) {
    await save({ status: 'error', error: String((e && e.message) || e) });
  }
}

export async function scheduled(event, ctx) {
  const egressLive = await probeEgress(ctx);
  // LinkedIn rides a different egress lane (platform allowlist, not CORS), so
  // it gets its own probe — Meta being reachable says nothing about it.
  const liLive = await probeLinkedInLane(ctx);
  const laneLive = (platform) => (platform === 'linkedin' ? liLive : egressLive);

  const vault = (await ctx.db.query({ db: 'vault' })).filter((d) => d.kind === 'token');
  for (const t of vault) {
    if (!t.token || !laneLive(t.platform)) continue;
    if (!t.igUserId || (t.platform === 'fbpage' && !t.pageResolved)) await enrichToken(ctx, t);
    else if (!NO_ROTATE.has(t.platform) && daysSince(t.refreshedAt) > ROTATE_AFTER_DAYS)
      await rotateToken(ctx, t);
  }

  const fresh = (await ctx.db.query({ db: 'vault' })).filter((d) => d.kind === 'token');

  // Mirror a REDACTED status projection into the owner-readable oplog db so the
  // dashboard can show token health without the raw token ever leaving the
  // vault channel (which is granted to no one). Written only when a field the
  // UI shows actually changed, so a steady state costs no writes.
  const statuses = (await ctx.db.query({ db: 'oplog' })).filter((d) => d.kind === 'token-status');
  for (const t of fresh) {
    const next = {
      _id: `status-${t.platform}`,
      kind: 'token-status',
      platform: t.platform,
      username: t.username || null,
      expiresAt: t.expiresAt || null,
      refreshedAt: t.refreshedAt || null,
      needsReauth: !!t.needsReauth,
      lastError: t.lastError || null,
      hasToken: !!t.token,
    };
    const prev = statuses.find((s) => s._id === next._id);
    const changed =
      !prev ||
      ['username', 'expiresAt', 'refreshedAt', 'needsReauth', 'lastError', 'hasToken'].some(
        (k) => prev[k] !== next[k]
      );
    if (changed) await ctx.db.put({ ...next, at: new Date().toISOString() }, { db: 'oplog' });
  }

  const reqs = (await ctx.db.query({ db: 'requests' })).filter(
    (d) => d.kind === 'publish-request' && d.status !== 'done' && d.status !== 'error'
  );
  // Triage every non-terminal request BEFORE taking the per-tick batch, so a
  // held request (dead token, egress down) can't starve actionable ones behind
  // it. Holds are deliberate and indefinite — a request waiting on re-auth
  // must survive until the owner pastes a fresh token — but they're made
  // observable via heldReason on the doc (written only on change, so a
  // steady-state hold costs no writes).
  const actionable = [];
  for (const req of reqs) {
    // Scheduled posts: a request may carry a `postAt` ISO timestamp. Hold it
    // — before any token/egress check, so a scheduled post can't terminal-
    // error on a transient token gap before its time — until that moment
    // arrives, so a backlog can be spaced out instead of draining 3-per-tick
    // all at once. An unparseable postAt (NaN) is treated as "due now" so a
    // typo can't wedge a post forever. heldReason is cleared when the request
    // becomes actionable (see the actionable.push below).
    const postAtMs = req.postAt ? new Date(req.postAt).getTime() : NaN;
    if (Number.isFinite(postAtMs) && postAtMs > Date.now()) {
      const held = `scheduled for ${req.postAt}`;
      if (req.heldReason !== held) {
        await ctx.db.put(
          { ...req, heldReason: held, updatedAt: new Date().toISOString() },
          { db: 'requests' }
        );
      }
      continue;
    }
    const t = fresh.find((x) => x.platform === (req.platform || 'ig'));
    if (!t || !t.token) {
      await ctx.db.put(
        {
          ...req,
          status: 'error',
          error: `no ${req.platform || 'ig'} token in vault`,
          updatedAt: new Date().toISOString(),
        },
        { db: 'requests' }
      );
      continue;
    }
    const held = !t.igUserId
      ? 'token not verified yet'
      : t.needsReauth
        ? 'token needs re-auth'
        : !laneLive(t.platform)
          ? 'egress down'
          : null;
    if (held) {
      if (req.heldReason !== held) {
        await ctx.db.put(
          { ...req, heldReason: held, updatedAt: new Date().toISOString() },
          { db: 'requests' }
        );
      }
      continue;
    }
    actionable.push({ req: req.heldReason ? { ...req, heldReason: null } : req, t });
  }
  for (const { req, t } of actionable.slice(0, 3)) {
    await advanceRequest(ctx, req, t);
  }
}
