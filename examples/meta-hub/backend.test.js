import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  liEscape,
  liPostBody,
  liFetch,
  liTokenDead,
  scheduled,
  bskyParseCredential,
  bskyLinkFacets,
  bskyPostRecord,
  bskyPermalink,
  LI_VERSION,
  LI_MAX_TEXT,
  BSKY_MAX_TEXT,
} from './backend.js';

describe('liEscape — LinkedIn little-text-format escaping', () => {
  it('escapes every reserved control character (parens in prose are the classic 400)', () => {
    expect(liEscape('a (b) [c] {d} <e> f|g @h *i* _j_ ~k~ l\\m')).toBe(
      'a \\(b\\) \\[c\\] \\{d\\} \\<e\\> f\\|g \\@h \\*i\\* \\_j\\_ \\~k\\~ l\\\\m'
    );
  });
  it('escapes backslash in the same single pass — no double-escaping', () => {
    expect(liEscape('\\(')).toBe('\\\\\\(');
  });
  it('leaves # alone so hashtags stay live, and plain text untouched', () => {
    expect(liEscape('ship it #vibecoding — https://good.vibes.diy/blog/x?src=linkedin')).toBe(
      'ship it #vibecoding — https://good.vibes.diy/blog/x?src=linkedin'
    );
  });
  it('stringifies non-strings defensively', () => {
    expect(liEscape(undefined)).toBe('undefined');
  });
});

describe('liPostBody — article-share request body', () => {
  const author = 'urn:li:person:abc123';
  it('builds a PUBLIC main-feed article post from caption + link', () => {
    const { post, error } = liPostBody(author, {
      slug: 'my-post',
      caption: 'Read this https://good.vibes.diy/blog/my-post?src=linkedin',
      title: 'My Post',
      description: 'A post.',
    });
    expect(error).toBeUndefined();
    expect(post).toEqual({
      author,
      commentary: 'Read this https://good.vibes.diy/blog/my-post?src=linkedin',
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      content: {
        article: {
          source: 'https://good.vibes.diy/blog/my-post?src=linkedin',
          title: 'My Post',
          description: 'A post.',
        },
      },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    });
  });
  it('prefers an explicit `link` field over a URL scraped from the caption', () => {
    const { post } = liPostBody(author, {
      slug: 's',
      caption: 'see https://other.example/x',
      link: 'https://good.vibes.diy/blog/s',
    });
    expect(post.content.article.source).toBe('https://good.vibes.diy/blog/s');
  });
  it('falls back to slug for the title (LinkedIn does not scrape the URL)', () => {
    const { post } = liPostBody(author, {
      slug: 'my-slug',
      caption: 'https://good.vibes.diy/blog/my-slug',
    });
    expect(post.content.article.title).toBe('my-slug');
    expect(post.content.article.description).toBeUndefined();
  });
  it('escapes commentary but leaves the article source URL raw', () => {
    const { post } = liPostBody(author, { slug: 's', caption: 'hi (all) https://x.example/p' });
    expect(post.commentary).toBe('hi \\(all\\) https://x.example/p');
    expect(post.content.article.source).toBe('https://x.example/p');
  });
  it('errors without a link anywhere', () => {
    expect(liPostBody(author, { slug: 's', caption: 'no link here' }).error).toMatch(
      /needs a link/
    );
  });
  it('errors when escaped commentary exceeds the cap', () => {
    const { error } = liPostBody(author, {
      slug: 's',
      caption: `https://x.example ${'('.repeat(LI_MAX_TEXT / 2)}`,
    });
    expect(error).toMatch(/max 3000/);
  });
});

describe('liFetch — LinkedIn REST client', () => {
  afterEach(() => vi.unstubAllGlobals());
  const stub = (impl) => {
    const f = vi.fn(impl);
    vi.stubGlobal('fetch', f);
    return f;
  };

  it('sends Bearer + version headers and returns the x-restli-id of an empty 201', async () => {
    const f = stub(
      async () => new Response(null, { status: 201, headers: { 'x-restli-id': 'urn:li:share:42' } })
    );
    const r = await liFetch('rest/posts', { method: 'POST', body: { a: 1 }, token: 'tok' });
    expect(r).toEqual({ ok: true, data: {}, id: 'urn:li:share:42' });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://api.linkedin.com/rest/posts');
    expect(init.headers.authorization).toBe('Bearer tok');
    expect(init.headers['linkedin-version']).toBe(LI_VERSION);
    expect(init.headers['x-restli-protocol-version']).toBe('2.0.0');
    expect(init.headers['content-type']).toBe('application/json');
    expect(init.body).toBe('{"a":1}');
  });
  it('omits content-type on body-less GETs', async () => {
    const f = stub(async () => new Response(JSON.stringify({ sub: 'x' }), { status: 200 }));
    await liFetch('v2/userinfo', { token: 'tok' });
    expect(f.mock.calls[0][1].headers['content-type']).toBeUndefined();
  });
  it("surfaces LinkedIn's error shape with the status a dead token needs", async () => {
    stub(
      async () =>
        new Response(
          JSON.stringify({ serviceErrorCode: 65600, message: 'Invalid access token', status: 401 }),
          { status: 401 }
        )
    );
    const r = await liFetch('v2/userinfo', { token: 'expired' });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(401);
    expect(r.message).toBe('Invalid access token');
    expect(liTokenDead(r)).toBe(true);
  });
  it("recognizes the egress proxy's denial marker", async () => {
    stub(
      async () =>
        new Response(
          JSON.stringify({ vibesEgressDenied: true, gate: 'cors', host: 'api.linkedin.com' }),
          { status: 403 }
        )
    );
    const r = await liFetch('v2/userinfo', { token: 'probe' });
    expect(r).toEqual({ ok: false, egressDenied: 'cors' });
    expect(liTokenDead(r)).toBe(false); // an undeployed allowlist must not flag re-auth
  });
  it('reports transport failures without throwing', async () => {
    stub(async () => {
      throw new Error('boom');
    });
    const r = await liFetch('rest/posts', { method: 'POST', body: {}, token: 'tok' });
    expect(r).toEqual({ ok: false, transport: 'boom' });
  });
});

describe('bskyParseCredential — identifier:app-password paste', () => {
  it('splits on the LAST colon (app passwords are xxxx-xxxx-xxxx-xxxx, no colons)', () => {
    expect(bskyParseCredential('vibes.diy:abcd-efgh-ijkl-mnop')).toEqual({
      identifier: 'vibes.diy',
      password: 'abcd-efgh-ijkl-mnop',
    });
    expect(bskyParseCredential('me@example.com: pw ')).toEqual({
      identifier: 'me@example.com',
      password: 'pw',
    });
  });
  it('keeps DID identifiers intact (they contain colons)', () => {
    expect(bskyParseCredential('did:plc:abc123:abcd-efgh-ijkl-mnop')).toEqual({
      identifier: 'did:plc:abc123',
      password: 'abcd-efgh-ijkl-mnop',
    });
  });
  it('rejects pastes without both halves', () => {
    expect(bskyParseCredential('no-colon-here')).toBeNull();
    expect(bskyParseCredential(':starts-with-colon')).toBeNull();
    expect(bskyParseCredential('ends-with-colon:')).toBeNull();
    expect(bskyParseCredential(undefined)).toBeNull();
  });
});

describe('bskyLinkFacets — UTF-8 byte-offset link facets', () => {
  it('marks a URL with byte offsets (links are NOT auto-detected by Bluesky)', () => {
    const text = 'read https://x.example/p now';
    expect(bskyLinkFacets(text)).toEqual([
      {
        index: { byteStart: 5, byteEnd: 24 },
        features: [{ $type: 'app.bsky.richtext.facet#link', uri: 'https://x.example/p' }],
      },
    ]);
  });
  it('uses BYTE positions, not string indexes, when multibyte chars precede the URL', () => {
    // "é" is 1 string index but 2 UTF-8 bytes.
    const [facet] = bskyLinkFacets('é https://x.example');
    expect(facet.index.byteStart).toBe(3);
    expect(facet.index.byteEnd).toBe(3 + 'https://x.example'.length);
  });
  it('handles multiple URLs and none', () => {
    expect(bskyLinkFacets('https://a.example and https://b.example')).toHaveLength(2);
    expect(bskyLinkFacets('no links')).toEqual([]);
  });
});

describe('bskyPostRecord — post record with link facet + website card', () => {
  it('builds the record: text, facets, external embed with title/description', () => {
    const { record, error } = bskyPostRecord(
      {
        slug: 's',
        caption: 'hook https://good.vibes.diy/blog/s?src=bsky',
        title: 'My Post',
        description: 'd',
      },
      '2026-07-06T00:00:00.000Z'
    );
    expect(error).toBeUndefined();
    expect(record.$type).toBe('app.bsky.feed.post');
    expect(record.createdAt).toBe('2026-07-06T00:00:00.000Z');
    expect(record.facets).toHaveLength(1);
    expect(record.embed).toEqual({
      $type: 'app.bsky.embed.external',
      external: {
        uri: 'https://good.vibes.diy/blog/s?src=bsky',
        title: 'My Post',
        description: 'd',
      },
    });
  });
  it('prefers an explicit link, falls back to slug for the title and empty description', () => {
    const { record } = bskyPostRecord(
      {
        slug: 'my-slug',
        caption: 'see https://other.example',
        link: 'https://good.vibes.diy/blog/my-slug',
      },
      't'
    );
    expect(record.embed.external.uri).toBe('https://good.vibes.diy/blog/my-slug');
    expect(record.embed.external.title).toBe('my-slug');
    expect(record.embed.external.description).toBe('');
  });
  it('errors past 300 chars (code points) and without a link', () => {
    expect(
      bskyPostRecord({ slug: 's', caption: `https://x.example ${'a'.repeat(BSKY_MAX_TEXT)}` }, 't')
        .error
    ).toMatch(/max 300/);
    expect(bskyPostRecord({ slug: 's', caption: 'no link' }, 't').error).toMatch(/needs a link/);
  });
});

describe('bskyPermalink', () => {
  it('builds the public app URL from the at:// uri rkey and the handle', () => {
    expect(bskyPermalink('at://did:plc:abc/app.bsky.feed.post/3k2xyz', 'vibes.diy')).toBe(
      'https://bsky.app/profile/vibes.diy/post/3k2xyz'
    );
  });
  it('returns null when either half is missing', () => {
    expect(bskyPermalink(undefined, 'vibes.diy')).toBeNull();
    expect(bskyPermalink('at://did:plc:abc/app.bsky.feed.post/3k2xyz', undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Shared-path regression tests: drive the REAL `scheduled` handler through an
// in-memory ctx.db + a URL-routed fetch stub, and pin the invariants the
// LinkedIn change must not move for the existing ig/threads/fbpage pipeline
// (Charlie's review on #3290): Meta 190 dead-token parity, the rotate/no-rotate
// split, and per-platform egress-lane gating.
// ---------------------------------------------------------------------------

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

function mockCtx({ vault = [], requests = [] } = {}) {
  const dbs = { vault: [...vault], requests: [...requests], oplog: [] };
  let auto = 0;
  return {
    dbs,
    db: {
      query: async ({ db }) => dbs[db].map((d) => ({ ...d })),
      put: async (doc, { db }) => {
        const next = { ...doc, _id: doc._id ?? `auto-${++auto}` };
        const i = dbs[db].findIndex((d) => d._id === next._id);
        if (i >= 0) dbs[db][i] = next;
        else dbs[db].push(next);
      },
    },
  };
}

const json = (obj, status = 200, headers = {}) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

// Route table: first predicate that matches the URL wins. Records every call.
function routedFetch(routes) {
  const calls = [];
  const f = vi.fn(async (url, init = {}) => {
    calls.push({ url: String(url), method: (init.method || 'GET').toUpperCase() });
    for (const [test, respond] of routes) {
      if (String(url).includes(test)) return respond(String(url), init);
    }
    throw new Error(`unrouted fetch in test: ${url}`);
  });
  vi.stubGlobal('fetch', f);
  return calls;
}

// Baseline probes: Meta answers a tokenless /me with a Graph-shaped error
// (egress live), LinkedIn answers userinfo with its 401 shape (lane live).
const META_PROBE_LIVE = [
  'graph.instagram.com/v23.0/me',
  () => json({ error: { message: 'Invalid OAuth access token.', code: 190 } }, 400),
];
const LI_LANE_LIVE = [
  'api.linkedin.com/v2/userinfo',
  () => json({ serviceErrorCode: 65600, message: 'Invalid access token' }, 401),
];
const LI_LANE_DENIED = [
  'api.linkedin.com/',
  () => json({ vibesEgressDenied: true, gate: 'cors', host: 'api.linkedin.com' }, 403),
];

const igToken = (over = {}) => ({
  _id: 'token-ig',
  kind: 'token',
  platform: 'ig',
  token: 'IGTOK',
  igUserId: '123',
  username: 'viber',
  refreshedAt: daysAgo(0),
  ...over,
});

describe('scheduled — shared-path invariants (ig/threads/fbpage parity)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('rotates a stale ig token but never fbpage or linkedin', async () => {
    const calls = routedFetch([
      META_PROBE_LIVE,
      LI_LANE_LIVE,
      [
        'graph.instagram.com/refresh_access_token',
        () => json({ access_token: 'IGTOK2', expires_in: 5184000 }),
      ],
    ]);
    const ctx = mockCtx({
      vault: [
        igToken({ refreshedAt: daysAgo(10) }),
        {
          _id: 'token-fbpage',
          kind: 'token',
          platform: 'fbpage',
          token: 'PGTOK',
          igUserId: '456',
          pageResolved: true,
          refreshedAt: daysAgo(10),
        },
        {
          _id: 'token-linkedin',
          kind: 'token',
          platform: 'linkedin',
          token: 'LITOK',
          igUserId: 'urn:li:person:abc',
          refreshedAt: daysAgo(10),
        },
      ],
    });
    await scheduled({}, ctx);
    const refreshes = calls.filter((c) => c.url.includes('refresh_access_token'));
    expect(refreshes).toHaveLength(1);
    expect(refreshes[0].url).toContain('grant_type=ig_refresh_token');
    const tok = (id) => ctx.dbs.vault.find((d) => d._id === id).token;
    expect(tok('token-ig')).toBe('IGTOK2');
    expect(tok('token-fbpage')).toBe('PGTOK');
    expect(tok('token-linkedin')).toBe('LITOK');
  });

  it('Meta code 190 during publish flags the vault and HOLDS the request (no terminal error)', async () => {
    routedFetch([
      META_PROBE_LIVE,
      LI_LANE_LIVE,
      [
        'graph.instagram.com/v23.0/123/media',
        () => json({ error: { message: 'Session has expired', code: 190 } }, 400),
      ],
    ]);
    const ctx = mockCtx({
      vault: [igToken()],
      requests: [
        {
          _id: 'r1',
          kind: 'publish-request',
          platform: 'ig',
          slug: 's',
          images: ['https://x.example/i.jpg'],
          caption: 'c',
          status: 'pending',
          attempts: 0,
        },
      ],
    });
    await scheduled({}, ctx);
    expect(ctx.dbs.vault.find((d) => d._id === 'token-ig').needsReauth).toBe(true);
    const r1 = ctx.dbs.requests.find((d) => d._id === 'r1');
    expect(r1.status).toBe('pending'); // held at current status, not "error"
    expect(r1.attempts).toBe(1);
    expect(ctx.dbs.oplog.some((d) => d.op === 'publish-held')).toBe(true);
  });

  it('lane gating is per-platform: LinkedIn lane down holds only linkedin requests', async () => {
    routedFetch([
      META_PROBE_LIVE,
      LI_LANE_DENIED,
      ['graph.instagram.com/v23.0/123/media', () => json({ id: 'container-1' })],
    ]);
    const ctx = mockCtx({
      vault: [
        igToken(),
        {
          _id: 'token-linkedin',
          kind: 'token',
          platform: 'linkedin',
          token: 'LITOK',
          igUserId: 'urn:li:person:abc',
          refreshedAt: daysAgo(0),
        },
      ],
      requests: [
        {
          _id: 'r-ig',
          kind: 'publish-request',
          platform: 'ig',
          slug: 's',
          images: ['https://x.example/i.jpg'],
          caption: 'c',
          status: 'pending',
          attempts: 0,
        },
        {
          _id: 'r-li',
          kind: 'publish-request',
          platform: 'linkedin',
          slug: 's',
          images: [],
          caption: 'hook https://x.example/blog/s',
          status: 'pending',
          attempts: 0,
        },
      ],
    });
    await scheduled({}, ctx);
    expect(ctx.dbs.requests.find((d) => d._id === 'r-ig').status).toBe('carousel-created'); // advanced normally
    const rLi = ctx.dbs.requests.find((d) => d._id === 'r-li');
    expect(rLi.status).toBe('pending');
    expect(rLi.heldReason).toBe('egress down');
  });

  it('lane gating parity the other way: Meta egress down holds ig while linkedin publishes', async () => {
    routedFetch([
      ['graph.instagram.com/v23.0/me', () => Promise.reject(new Error('connect timeout'))],
      LI_LANE_LIVE,
      [
        'api.linkedin.com/rest/posts',
        () => new Response(null, { status: 201, headers: { 'x-restli-id': 'urn:li:share:9' } }),
      ],
    ]);
    const ctx = mockCtx({
      vault: [
        igToken(),
        {
          _id: 'token-linkedin',
          kind: 'token',
          platform: 'linkedin',
          token: 'LITOK',
          igUserId: 'urn:li:person:abc',
          refreshedAt: daysAgo(0),
        },
      ],
      requests: [
        {
          _id: 'r-ig',
          kind: 'publish-request',
          platform: 'ig',
          slug: 's',
          images: ['https://x.example/i.jpg'],
          caption: 'c',
          status: 'pending',
          attempts: 0,
        },
        {
          _id: 'r-li',
          kind: 'publish-request',
          platform: 'linkedin',
          slug: 's',
          images: [],
          caption: 'hook https://x.example/blog/s',
          status: 'pending',
          attempts: 0,
        },
      ],
    });
    await scheduled({}, ctx);
    const rIg = ctx.dbs.requests.find((d) => d._id === 'r-ig');
    expect(rIg.status).toBe('pending');
    expect(rIg.heldReason).toBe('egress down');
    const rLi = ctx.dbs.requests.find((d) => d._id === 'r-li');
    expect(rLi.status).toBe('done');
    expect(rLi.permalink).toBe('https://www.linkedin.com/feed/update/urn:li:share:9');
  });

  it('bsky publishes via refreshSession, persists rotated JWTs AND the current handle — no createSession on a live session', async () => {
    const calls = routedFetch([
      META_PROBE_LIVE,
      LI_LANE_LIVE,
      // The account renamed itself since the last session — the session
      // endpoints answer with the CURRENT handle and the permalink must use it.
      [
        'com.atproto.server.refreshSession',
        () =>
          json({
            accessJwt: 'A2',
            refreshJwt: 'R2',
            did: 'did:plc:abc',
            handle: 'renamed.example',
          }),
      ],
      [
        'com.atproto.repo.createRecord',
        () => json({ uri: 'at://did:plc:abc/app.bsky.feed.post/3k2xyz', cid: 'bafy...' }),
      ],
    ]);
    const ctx = mockCtx({
      vault: [
        {
          _id: 'token-bsky',
          kind: 'token',
          platform: 'bsky',
          token: 'vibes.diy:abcd-efgh-ijkl-mnop',
          igUserId: 'did:plc:abc',
          username: 'vibes.diy',
          refreshJwt: 'R1',
          accessJwt: 'A1',
          refreshedAt: daysAgo(1), // aged past the freshness window, so the refresh path runs
        },
      ],
      requests: [
        {
          _id: 'r-bsky',
          kind: 'publish-request',
          platform: 'bsky',
          slug: 's',
          images: [],
          caption: 'hook https://x.example/blog/s?src=bsky',
          title: 'T',
          status: 'pending',
          attempts: 0,
        },
      ],
    });
    await scheduled({}, ctx);
    const r = ctx.dbs.requests.find((d) => d._id === 'r-bsky');
    expect(r.status).toBe('done');
    expect(r.permalink).toBe('https://bsky.app/profile/renamed.example/post/3k2xyz');
    const vaultDoc = ctx.dbs.vault.find((d) => d._id === 'token-bsky');
    expect(vaultDoc.refreshJwt).toBe('R2');
    expect(vaultDoc.accessJwt).toBe('A2');
    expect(vaultDoc.username).toBe('renamed.example');
    expect(calls.some((c) => c.url.includes('createSession'))).toBe(false); // rate-limited call stays cold
    const record = calls.find((c) => c.url.includes('createRecord'));
    expect(record.method).toBe('POST');
  });

  it('a batch of bsky requests in one tick shares ONE session mint — no stale refresh JWT replay', async () => {
    let refreshes = 0;
    const calls = routedFetch([
      META_PROBE_LIVE,
      LI_LANE_LIVE,
      [
        'com.atproto.server.refreshSession',
        (url, init) => {
          refreshes += 1;
          // atproto refresh tokens are single-use: replaying R1 after it was
          // rotated must fail the test loudly.
          if ((init.headers || {}).authorization !== 'Bearer R1')
            return json({ error: 'ExpiredToken' }, 400);
          return json({
            accessJwt: 'A2',
            refreshJwt: 'R2',
            did: 'did:plc:abc',
            handle: 'vibes.diy',
          });
        },
      ],
      [
        'com.atproto.repo.createRecord',
        () => json({ uri: 'at://did:plc:abc/app.bsky.feed.post/3kbatch', cid: 'bafy...' }),
      ],
    ]);
    const ctx = mockCtx({
      vault: [
        {
          _id: 'token-bsky',
          kind: 'token',
          platform: 'bsky',
          token: 'vibes.diy:abcd-efgh-ijkl-mnop',
          igUserId: 'did:plc:abc',
          username: 'vibes.diy',
          refreshJwt: 'R1',
          accessJwt: 'A1',
          refreshedAt: daysAgo(1),
        },
      ],
      requests: [
        {
          _id: 'r-b1',
          kind: 'publish-request',
          platform: 'bsky',
          slug: 's1',
          images: [],
          caption: 'one https://x.example/1',
          status: 'pending',
          attempts: 0,
        },
        {
          _id: 'r-b2',
          kind: 'publish-request',
          platform: 'bsky',
          slug: 's2',
          images: [],
          caption: 'two https://x.example/2',
          status: 'pending',
          attempts: 0,
        },
      ],
    });
    await scheduled({}, ctx);
    expect(ctx.dbs.requests.find((d) => d._id === 'r-b1').status).toBe('done');
    expect(ctx.dbs.requests.find((d) => d._id === 'r-b2').status).toBe('done');
    expect(refreshes).toBe(1); // second request rode the freshly-minted session
    expect(calls.some((c) => c.url.includes('createSession'))).toBe(false);
  });

  it('bsky falls back to createSession from the app password when the refresh JWT is dead', async () => {
    routedFetch([
      META_PROBE_LIVE,
      LI_LANE_LIVE,
      [
        'com.atproto.server.refreshSession',
        () => json({ error: 'ExpiredToken', message: 'Token has expired' }, 400),
      ],
      [
        'com.atproto.server.createSession',
        () => json({ accessJwt: 'A9', refreshJwt: 'R9', did: 'did:plc:abc', handle: 'vibes.diy' }),
      ],
      [
        'com.atproto.repo.createRecord',
        () => json({ uri: 'at://did:plc:abc/app.bsky.feed.post/3k9', cid: 'bafy...' }),
      ],
    ]);
    const ctx = mockCtx({
      vault: [
        {
          _id: 'token-bsky',
          kind: 'token',
          platform: 'bsky',
          token: 'vibes.diy:abcd-efgh-ijkl-mnop',
          igUserId: 'did:plc:abc',
          username: 'vibes.diy',
          refreshJwt: 'DEAD',
          refreshedAt: daysAgo(90),
        },
      ],
      requests: [
        {
          _id: 'r-bsky',
          kind: 'publish-request',
          platform: 'bsky',
          slug: 's',
          images: [],
          caption: 'hook https://x.example/blog/s',
          status: 'pending',
          attempts: 0,
        },
      ],
    });
    await scheduled({}, ctx);
    expect(ctx.dbs.requests.find((d) => d._id === 'r-bsky').status).toBe('done');
    expect(ctx.dbs.vault.find((d) => d._id === 'token-bsky').refreshJwt).toBe('R9');
  });

  it('holds a request whose postAt is in the future — no publish, heldReason names the time', async () => {
    const calls = routedFetch([
      META_PROBE_LIVE,
      LI_LANE_LIVE,
      // must NOT be reached
      [
        'com.atproto.repo.createRecord',
        () => json({ uri: 'at://did:plc:abc/app.bsky.feed.post/3kNOPE', cid: 'x' }),
      ],
    ]);
    const postAt = new Date(Date.now() + 3600_000).toISOString();
    const ctx = mockCtx({
      vault: [
        {
          _id: 'token-bsky',
          kind: 'token',
          platform: 'bsky',
          token: 'vibes.diy:abcd-efgh-ijkl-mnop',
          igUserId: 'did:plc:abc',
          username: 'vibes.diy',
          refreshJwt: 'R1',
          accessJwt: 'A1',
          refreshedAt: daysAgo(0),
        },
      ],
      requests: [
        {
          _id: 'r-bsky',
          kind: 'publish-request',
          platform: 'bsky',
          slug: 's',
          images: [],
          caption: 'hook https://x.example/blog/s?src=bsky',
          status: 'pending',
          attempts: 0,
          postAt,
        },
      ],
    });
    await scheduled({}, ctx);
    const r = ctx.dbs.requests.find((d) => d._id === 'r-bsky');
    expect(r.status).toBe('pending');
    expect(r.heldReason).toBe(`scheduled for ${postAt}`);
    expect(r.attempts).toBe(0); // never advanced
    expect(calls.some((c) => c.url.includes('createRecord'))).toBe(false);
  });

  it('publishes a request once its postAt has passed', async () => {
    routedFetch([
      META_PROBE_LIVE,
      LI_LANE_LIVE,
      [
        'com.atproto.server.refreshSession',
        () => json({ accessJwt: 'A2', refreshJwt: 'R2', did: 'did:plc:abc', handle: 'vibes.diy' }),
      ],
      [
        'com.atproto.repo.createRecord',
        () => json({ uri: 'at://did:plc:abc/app.bsky.feed.post/3kYES', cid: 'x' }),
      ],
    ]);
    const ctx = mockCtx({
      vault: [
        {
          _id: 'token-bsky',
          kind: 'token',
          platform: 'bsky',
          token: 'vibes.diy:abcd-efgh-ijkl-mnop',
          igUserId: 'did:plc:abc',
          username: 'vibes.diy',
          refreshJwt: 'R1',
          accessJwt: 'A1',
          refreshedAt: daysAgo(1),
        },
      ],
      requests: [
        {
          _id: 'r-bsky',
          kind: 'publish-request',
          platform: 'bsky',
          slug: 's',
          images: [],
          caption: 'hook https://x.example/blog/s?src=bsky',
          title: 'T',
          status: 'pending',
          attempts: 0,
          postAt: new Date(Date.now() - 60_000).toISOString(),
        },
      ],
    });
    await scheduled({}, ctx);
    const r = ctx.dbs.requests.find((d) => d._id === 'r-bsky');
    expect(r.status).toBe('done');
    expect(r.permalink).toBe('https://bsky.app/profile/vibes.diy/post/3kYES');
  });

  it('treats an unparseable postAt as due now (a typo cannot wedge a post forever)', async () => {
    routedFetch([
      META_PROBE_LIVE,
      LI_LANE_LIVE,
      [
        'com.atproto.server.refreshSession',
        () => json({ accessJwt: 'A2', refreshJwt: 'R2', did: 'did:plc:abc', handle: 'vibes.diy' }),
      ],
      [
        'com.atproto.repo.createRecord',
        () => json({ uri: 'at://did:plc:abc/app.bsky.feed.post/3kTYPO', cid: 'x' }),
      ],
    ]);
    const ctx = mockCtx({
      vault: [
        {
          _id: 'token-bsky',
          kind: 'token',
          platform: 'bsky',
          token: 'vibes.diy:abcd-efgh-ijkl-mnop',
          igUserId: 'did:plc:abc',
          username: 'vibes.diy',
          refreshJwt: 'R1',
          accessJwt: 'A1',
          refreshedAt: daysAgo(1),
        },
      ],
      requests: [
        {
          _id: 'r-bsky',
          kind: 'publish-request',
          platform: 'bsky',
          slug: 's',
          images: [],
          caption: 'hook https://x.example/blog/s?src=bsky',
          status: 'pending',
          attempts: 0,
          postAt: 'not-a-real-date',
        },
      ],
    });
    await scheduled({}, ctx);
    expect(ctx.dbs.requests.find((d) => d._id === 'r-bsky').status).toBe('done');
  });

  it('holds a future-postAt request even with NO token in the vault (schedule gate precedes the token error)', async () => {
    // The whole point of ordering the postAt check first: a scheduled post must
    // not get terminal-errored ("no token in vault") before its time — the
    // token only has to exist when it actually becomes due.
    const calls = routedFetch([META_PROBE_LIVE, LI_LANE_LIVE]);
    const postAt = new Date(Date.now() + 3600_000).toISOString();
    const ctx = mockCtx({
      vault: [], // deliberately empty — no bsky token
      requests: [
        {
          _id: 'r-bsky',
          kind: 'publish-request',
          platform: 'bsky',
          slug: 's',
          images: [],
          caption: 'hook https://x.example/blog/s?src=bsky',
          status: 'pending',
          attempts: 0,
          postAt,
        },
      ],
    });
    await scheduled({}, ctx);
    const r = ctx.dbs.requests.find((d) => d._id === 'r-bsky');
    expect(r.status).toBe('pending'); // held, NOT errored
    expect(r.heldReason).toBe(`scheduled for ${postAt}`);
    expect(r.error).toBeUndefined();
    expect(calls.some((c) => c.url.includes('createRecord'))).toBe(false);
  });

  it('releases a held request on a later tick and clears heldReason (held → due transition)', async () => {
    vi.useFakeTimers();
    try {
      const base = new Date('2026-07-09T00:00:00.000Z').getTime();
      vi.setSystemTime(base);
      const postAt = new Date(base + 6 * 3600_000).toISOString(); // +6h
      routedFetch([
        META_PROBE_LIVE,
        LI_LANE_LIVE,
        [
          'com.atproto.server.refreshSession',
          () =>
            json({ accessJwt: 'A2', refreshJwt: 'R2', did: 'did:plc:abc', handle: 'vibes.diy' }),
        ],
        [
          'com.atproto.repo.createRecord',
          () => json({ uri: 'at://did:plc:abc/app.bsky.feed.post/3kREL', cid: 'x' }),
        ],
      ]);
      const ctx = mockCtx({
        vault: [
          {
            _id: 'token-bsky',
            kind: 'token',
            platform: 'bsky',
            token: 'vibes.diy:abcd-efgh-ijkl-mnop',
            igUserId: 'did:plc:abc',
            username: 'vibes.diy',
            refreshJwt: 'R1',
            accessJwt: 'A1',
            refreshedAt: new Date(base - 86400000).toISOString(), // aged, so the refresh path runs when due
          },
        ],
        requests: [
          {
            _id: 'r-bsky',
            kind: 'publish-request',
            platform: 'bsky',
            slug: 's',
            images: [],
            caption: 'hook https://x.example/blog/s?src=bsky',
            title: 'T',
            status: 'pending',
            attempts: 0,
            postAt,
          },
        ],
      });
      // Tick 1 — before postAt: held, not published.
      await scheduled({}, ctx);
      let r = ctx.dbs.requests.find((d) => d._id === 'r-bsky');
      expect(r.status).toBe('pending');
      expect(r.heldReason).toBe(`scheduled for ${postAt}`);
      // Advance past postAt and tick again — now due: publishes and clears the hold.
      vi.setSystemTime(base + 7 * 3600_000);
      await scheduled({}, ctx);
      r = ctx.dbs.requests.find((d) => d._id === 'r-bsky');
      expect(r.status).toBe('done');
      expect(r.heldReason).toBeNull();
      expect(r.permalink).toBe('https://bsky.app/profile/vibes.diy/post/3kREL');
    } finally {
      vi.useRealTimers();
    }
  });

  it('bsky 401 on createSession (revoked app password) flags re-auth and holds the request', async () => {
    routedFetch([
      META_PROBE_LIVE,
      LI_LANE_LIVE,
      [
        'com.atproto.server.refreshSession',
        () => json({ error: 'ExpiredToken', message: 'Token has expired' }, 400),
      ],
      [
        'com.atproto.server.createSession',
        () =>
          json({ error: 'AuthenticationRequired', message: 'Invalid identifier or password' }, 401),
      ],
    ]);
    const ctx = mockCtx({
      vault: [
        {
          _id: 'token-bsky',
          kind: 'token',
          platform: 'bsky',
          token: 'vibes.diy:revoked-pass',
          igUserId: 'did:plc:abc',
          username: 'vibes.diy',
          refreshJwt: 'DEAD',
          refreshedAt: daysAgo(0),
        },
      ],
      requests: [
        {
          _id: 'r-bsky',
          kind: 'publish-request',
          platform: 'bsky',
          slug: 's',
          images: [],
          caption: 'hook https://x.example/blog/s',
          status: 'pending',
          attempts: 0,
        },
      ],
    });
    await scheduled({}, ctx);
    expect(ctx.dbs.vault.find((d) => d._id === 'token-bsky').needsReauth).toBe(true);
    const r = ctx.dbs.requests.find((d) => d._id === 'r-bsky');
    expect(r.status).toBe('pending'); // held, not terminal
    expect(ctx.dbs.oplog.some((d) => d.op === 'publish-held')).toBe(true);
  });
});
