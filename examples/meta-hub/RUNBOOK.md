# meta-hub — social-publishing console (token vault + rotator + publisher)

Deployed as `jchris/meta-hub` (https://vibes.diy/vibe/jchris/meta-hub).
Design record: [#3101](https://github.com/VibesDIY/vibes.diy/issues/3101).

One vibe holds the whole Instagram/Threads/Facebook-Page/LinkedIn/Bluesky
publishing pipeline so GitHub never carries social credentials:

- **vault db** (owner-only): one `token` doc per platform (`ig`, `threads`,
  `fbpage`, `linkedin`, `bsky`) —
  `{token, refreshedAt, expiresAt, igUserId, username, needsReauth, lastError}`.
  (`igUserId` holds the platform's user/page id regardless of platform — an
  IG-first naming leftover.)
- **requests db** (owner-only): `publish-request` docs walk a state machine
  `pending → items-created → carousel-created → done|error`, carrying
  `images[]` (public JPEG URLs, 4:5), `caption`, and eventually `permalink`.
  An optional `postAt` ISO timestamp **schedules** the post: the triage loop
  holds any request whose `postAt` is in the future (`heldReason: scheduled
for <postAt>`) before it touches tokens or egress, so a backlog can be
  spaced out instead of draining 3-per-tick all at once. Omit it to post ASAP;
  an unparseable `postAt` is treated as "due now" so a typo can't wedge a post.
- **oplog db** (owner-only): rotation/publish log + the `egress-probe` doc.

All token-touching work runs in the `scheduled` handler (1m tick) **on
purpose**: it's the only lane that can query access-fn-bound databases (admin
mode, as the owner), so the vault is structurally unreadable from
`fetch`/`onChange`. Each tick probes egress with a tokenless Graph call,
rotates tokens older than 7 days (`ig_refresh_token` / `th_refresh_token`),
and advances pending publish requests — container polling that isn't FINISHED
just retries next tick (bounded by `MAX_ATTEMPTS`).

## Operating it

- **Bootstrap / re-auth**: open the vibe as owner, paste the long-lived token
  from the Meta app dashboard into the Tokens form. First tick verifies it via
  `/me` (stores `igUserId` + `@username`); `NEEDS RE-AUTH` in red means paste a
  fresh one.
- **Publish a carousel**: fill the Publish form (slug, image URLs one per
  line, caption) — or put the request doc via CLI:

  ```sh
  npx vibes-diy db put --vibe jchris/meta-hub --db requests '{
    "kind": "publish-request", "platform": "ig", "slug": "<post-slug>",
    "images": ["https://good.vibes.diy/images/instagram/<slug>/slide-1.jpg", "..."],
    "caption": "...", "status": "pending", "attempts": 0,
    "createdAt": "<iso-now>"
  }'
  ```

  To **schedule** it for later, add `"postAt": "<iso-future>"` — the request
  holds until then, then posts on the next tick. Stagger several `postAt`
  values (e.g. 6h apart) to drip a backlog into a feed instead of flooding it.

  Status lands on the same doc within ~1–3 ticks; `done` carries the
  Instagram `permalink`.

- **Carousel assets** come from `landing-pages/scripts/ig-carousel.js` +
  per-post specs in `landing-pages/instagram/<slug>.json`; merged slides are
  publicly hosted under `https://good.vibes.diy/images/instagram/<slug>/`.

Images must be JPEG at a public URL, aspect within 4:5–1.91:1 (Meta rejects
otherwise; LinkedIn and Bluesky take no image URLs at all — see their
bullets). Five platforms publish:

- **`platform: "ig"`** — carousel or single image, `caption` ≤2200 chars,
  links not clickable (use `link in bio`).
- **`platform: "threads"`** — carousel, single image, or text-only (empty
  `images`); `caption` ≤500 chars and links ARE clickable — end the text with
  the `?src=threads` blog URL.
- **`platform: "fbpage"`** — single image (`/photos`) or text+link post
  (`/feed`); synchronous, done in one tick, links clickable. The **long-lived
  Page token has no scheduled expiration**, so it's exempt from rotation —
  paste once (it remains a revocable credential). Get
  it by exchanging a long-lived _user_ token, then reading the Page's
  `access_token` off `/me/accounts` (or, for a Business-Manager-owned Page,
  `business_management` scope → `/{business}/owned_pages`); `/me` returns the
  Page **name** so a verified doc shows the Page, not the person.
- **`platform: "linkedin"`** — article-link share only (no images yet):
  commentary (≤3000 chars, links clickable, hashtags work) plus an article
  card built from the request's `link` (falls back to the first URL in the
  caption), `title` (falls back to `slug`), and optional `description`.
  LinkedIn's Posts API does **not** scrape the URL — the card is text-only
  until an Images-API thumbnail upload lands (v2) — and its commentary is
  "little text format", so the backend escapes `\|{}@[]()<>*_~` (parens in
  prose otherwise 400 the post; `#` is left live, `@`-mention templates can't
  be authored from a caption). Synchronous, done in one tick; the permalink is
  constructed from the returned URN. Not a Meta dialect at all: Bearer-header
  auth, JSON bodies, `LinkedIn-Version` (a YYYYMM constant in backend.js —
  LinkedIn sunsets versions after ~1 year; a version error in `lastError`
  means bump it), and the post id arrives in the `x-restli-id` response
  header of an empty 201.

  **Egress**: api.linkedin.com sends no CORS headers, so LinkedIn rides the
  egress **platform allowlist**
  (`vibes.diy/api/svc/intern/egress-platform-list.ts`), not the CORS lane.
  The dashboard's `linkedin lane` probe must show `live` — `denied` means the
  api worker running that allowlist hasn't deployed (or was rolled back).

  **Token**: a 60-day **member** token — LinkedIn app associated with a
  LinkedIn Page, products "Share on LinkedIn" + "Sign In with LinkedIn using
  OpenID Connect" (both self-serve), token minted in the developer portal's
  OAuth token generator with scopes `openid profile w_member_social`. It
  **cannot self-rotate** (the `refresh_token` grant is partner-only), so it's
  rotation-exempt like `fbpage` but with a real expiry: re-paste when the
  dashboard countdown / `NEEDS RE-AUTH` says so (~every 60 days). Posting as
  an organization Page instead of the member needs `w_organization_social`
  via the Community Management API (app review) — deliberately out of scope.

- **`platform: "bsky"`** — text + link-card post: caption ≤300 chars with the
  post URL in it (the backend adds the byte-offset link facet — Bluesky does
  NOT auto-detect links), plus a website-card embed built from `link`/first
  URL, `title` (falls back to slug), optional `description`. Nothing is
  scraped, so Bluesky renders the card **imageless unless you supply a
  thumbnail**. Supply it by embedding the image bytes in the request as
  **`thumbBase64`** (base64 of the JPEG/PNG, ≤1,000,000 decoded bytes (Bluesky's blob cap)) plus
  optional `thumbMime` (default `image/jpeg`); the backend decodes it and
  uploads it as a blob (`com.atproto.repo.uploadBlob`), attaching it as the
  card thumb. **Why bytes and not a URL:** the backend **cannot fetch our card
  images** — `*.vibes.diy` (incl. `good.vibes.diy`) is on the egress floor
  denylist (#3048, SSRF prevention, beats every policy), so whoever queues the
  request (which _can_ read good.vibes.diy) inlines the bytes. A raw
  `images[0]` URL is accepted as a fallback but only works for non-floor,
  CORS-open hosts. Thumbnailing is **best-effort**: if decode/fetch/upload
  fails the post still goes out with the imageless text+link card (a
  `bsky-thumb-skipped` oplog entry records why), never blocked. To generate
  `thumbBase64` from a card at build time:
  `base64 -w0 card.jpg` (`-w0` is GNU/Linux; on macOS/BSD drop it) or
  `Buffer.from(await (await fetch(url)).arrayBuffer()).toString('base64')`.
  Synchronous, done in one tick; permalink constructed from the returned
  `at://` URI. **No egress change was needed**: the AT Protocol XRPC API is
  fully CORS-open (Bluesky's own client is a browser SPA), so it rides the
  same CORS-parity lane as Meta.

  **Credential**: paste `identifier:app-password` (e.g.
  `vibes.diy:xxxx-xxxx-xxxx-xxxx`) — create the app password in Bluesky
  Settings → Privacy and Security → App Passwords (no developer account, no
  OAuth paperwork). It never expires; the backend mints short-lived session
  JWTs from it at publish time (`refreshSession` off the cached session,
  `createSession` from the password only as fallback — `createSession` is
  rate-limited to ~300/day, so it must never run on the 1-minute timer).
  Revoking the app password in settings is the kill switch; the dashboard
  shows `NEEDS RE-AUTH` and held requests resume on a fresh paste.

Three hard-won quirks encoded in backend.js: (1) Meta containers report
FINISHED before they're referenceable, so carousel parents are only assembled
from children ≥1 tick old (never same-tick); (2) Threads' authenticated
GET /{id} status reads lack CORS headers so the egress proxy blocks them —
Threads skips all status polling and uses publish-with-retry (bounded by
MAX*ATTEMPTS); (3) posting to a user timeline fails `(#200) publish_actions
deprecated` — that error means a \_user* token landed in the `fbpage` slot
instead of a Page token.

## Remix this into your own posting system

Nothing in meta-hub is hardcoded to its original owner — access rules key off
`user.isOwner`, the scheduled handler runs as the vibe's owner, and every
account id and token is resolved from the vault at runtime. So third parties
don't share this instance (they can't; everything is owner-only): they
**remix it**, and the whole security model transfers to them automatically.

1. Remix [jchris/meta-hub](https://vibes.diy/vibe/jchris/meta-hub). Remix
   copies code, never data — the new vault starts empty and the original
   tokens stay home.
2. Meta paperwork (one-time, ~30–60 min): a Business-type Meta app with the
   Instagram + Threads use cases, professional accounts, a long-lived token
   per platform from each use case's dashboard token generator. For a
   Facebook Page prefer a Business Manager **system-user token** (configurable with no
   scheduled expiration, and independent of personal-account events); any
   page-capable credential
   works, though — enrich resolves it through `/me/accounts` to the Page.
   First-party use (own app + own accounts) runs on Standard Access;
   serving accounts you don't own is what triggers Advanced Access / App
   Review. LinkedIn is separate paperwork (see its bullet above): a LinkedIn
   developer app with the two self-serve products and a token from the
   portal's generator. Bluesky is the lightest of all: one app password from
   account settings, no developer registration at all.
3. Paste tokens into the remixed dashboard (write-only intake — no normal
   client read path returns token values; the dashboard shows a redacted
   status projection). The next tick verifies each and shows the
   account name. IG/Threads rotate themselves thereafter.
4. Post via the dashboard form or a `publish-request` doc (shape above).

Trust boundary, stated plainly: tokens are protected from all other users,
no normal client read path returns them, and they live server-side in the
vault — a remixer is trusting the
Vibes DIY platform the way they'd trust any SaaS that holds API keys.
