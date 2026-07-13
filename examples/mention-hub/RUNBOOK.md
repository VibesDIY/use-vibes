# mention-hub — social mention builds (Bluesky)

Deployed as a vibe (suggested: `jchris/mention-hub`). Implements the Bluesky
half of VibesDIY/vibes.diy#3323: @-mention the platform account with a prompt →
the platform builds the vibe, publishes it public under the mentions handle,
and replies in-thread with a screenshot and the live link.

## Architecture: social I/O in the vibe, compute in CI

```
Bluesky mention ──▶ backend.js scheduled tick (1m, admin mode)
                       │  guardrails: dedupe, per-author cap, global cap,
                       │  moderation, quiet failure
                       ▼
                    mention doc  status: pending-build        (requests db)
                       │
                       ▼
       .github/workflows/mention-builds.yaml (cron */10)
       scripts/mention-builds.mjs — the builder lane
                       │  vibes-diy generate --handle <mentions> --app-slug m-<rkey>
                       │  (build + publish public, production)
                       │  verified-live gate: entry-point host answers 200
                       │  waits for /screenshot.png (best-effort)
                       ▼
                    mention doc  status: built
                       │
                       ▼
                backend.js tick: uploadBlob(screenshot) → in-thread reply
                       ▼
                    mention doc  status: replied (replyPermalink)
```

The split follows the credential decision from meta-hub (#3101): **social
tokens live in a write-only vibe vault, never in GitHub env** — so listening
and replying happen in the vibe's scheduled backend (the only lane that can
read the vault, in admin mode). The one thing a vibe backend cannot do is run
codegen, so that goes to a thin CI runner holding only the _builder_ identity
(a device cert), which reads/writes the hub's `requests` db through the
`vibes-diy` CLI as the owner account.

## Databases (all owner-only, see access.js)

- `vault` — the pasted `identifier:app-password` credential doc
  (`_id: token-bsky`). Channel granted to NO ONE; the dashboard reads the
  redacted `token-status` projection in `oplog`.
- `requests` — the `mention` ledger. Statuses:
  `pending-build → building → built → replied`, with `skipped` (guardrails),
  `build-failed` (builder lane), `error` (reply retries exhausted) as
  terminals. The builder lane writes `building/built/build-failed`; the vibe
  writes everything else.
- `oplog` — activity log, `token-status`, `listener-state`, and the optional
  `config` doc (guardrail overrides, editable from the dashboard).

## Setup

1. **Deploy the vibe** under the owner account:
   `cd vibes/mention-hub && vibes-diy push --handle <owner-handle>` (the
   `push` IS the ship — agents/vibe-cli-pr-policy.md).
2. **Create the mentions handle** (e.g. `mentions`) on the SAME account —
   `publishApp`/`generate` are owner-only, and the builder cert must own both
   the handle and the hub vibe's dbs.
3. **Paste the Bluesky credential** on the dashboard:
   `identifier:app-password` (an [app password](https://bsky.app/settings/app-passwords),
   NOT the main password). The next tick verifies it and shows the handle.
   The same paste format as meta-hub; the same account can be pasted into both.
4. **Provision the builder lane** in GitHub:
   - secret `MENTION_BUILDER_DEVICE_ID` — a device-id cert for the owner
     account (same format the cloud sessions' `$VIBES_DEVICE_ID` uses; enroll
     a dedicated device via `vibes-diy login` and copy the resulting device id
     env form). This is a _builder_ credential, not a social token — the
     tokens-out-of-GitHub rule (#3101) applies to platform tokens, which stay
     in the vault.
   - repo variables `MENTION_HUB_VIBE` (e.g. `jchris/mention-hub`) and
     `MENTIONS_HANDLE` (e.g. `mentions`).
     The workflow self-skips until all three exist (dark by default).
5. **Smoke it**: mention the account from a test Bluesky account with a
   prompt, watch the dashboard doc walk `pending-build → building → built →
replied`, or fire the workflow manually (`workflow_dispatch`).

## Guardrails (issue #3323: required — this is unauthenticated compute)

Defaults in `backend.js DEFAULTS`, overridable via the dashboard's config form:

| knob               | default | meaning                                            |
| ------------------ | ------- | -------------------------------------------------- |
| maxGlobalPerDay    | 20      | accepted builds per UTC day — the spend ceiling    |
| maxPerAuthorPerDay | 2       | accepted builds per requester per UTC day          |
| maxNewPerTick      | 5       | burst brake per 1-minute tick                      |
| maxRepliesPerTick  | 2       | replies posted per tick                            |
| dedupeWindowDays   | 7       | identical prompts (case/punct-insensitive) skipped |
| minPromptChars     | 8       | shorter mentions aren't prompts                    |

Moderation is a conservative heuristic gate (`moderatePrompt`): prompts with
links (top spam vector), adult/scam/abuse-tooling/violence patterns, or bad
lengths are skipped silently. The built app faces the codegen pipeline's own
safety behavior on top. **Reply text is a fixed template** — model output and
error text are never echoed into our replies (that's the
prompt-injection-into-our-own-reply defense), and failures of any kind never
post (quiet failure).

Caps count _accepted_ mentions (skips are free). A mention skipped for a cap
stays skipped — capacity is at mention time, it doesn't queue for tomorrow.

## Failure modes

- **Credential dies** (revoked app password): vault doc flips `needsReauth`,
  dashboard shows it, everything holds until a fresh paste. Replies held this
  way resume untouched.
- **Runner crashes mid-build**: the doc sits in `building`; after 45 min the
  next run retries it (`MAX_BUILD_ATTEMPTS = 2` total), then `build-failed`.
- **Publish succeeded but vibe never serves**: verified-live gate times out
  (~4 min of polling) → `build-failed`, no reply. The gate probes the runtime
  entry-point host (`https://<slug>--<handle>.<base>/`), not the platform
  `/vibe/` route — the shell route answers 200 even for missing/private apps.
  First paint of a fresh vibe can take 10–30s+
  (agents/vibe-iframe-inspection.md) — the gate polls the served document, not
  the app render.
- **Screenshot missing/blocked**: reply degrades to a link card
  (`app.bsky.embed.external`) instead of an image embed. The screenshot fetch
  from the vibe backend rides the CORS-parity egress lane; if the entry-point
  asset route is ever egress-blocked, the link-card fallback carries the loop.
- **Notification burst deeper than one page (50)**: the listener reads one
  page per tick with idempotent doc ids and no cursor; a >50/min sustained
  burst would age the overflow out of page one — at that point the caps are
  saturated anyway.

## Solicitation lane — proactively answer "drop your app link" calls

The mention lane is reactive. The **solicitation lane** is proactive: instead of
waiting for an `@`-mention, the same scheduled tick _searches_ Bluesky for open
posts inviting people to share their startup/app links ("drop your startup/app
link — let's drive some traffic") and, for each genuine one, builds a small app
tailored to the poster and drops that live link in-thread.

It reuses everything: the `requests` db, the `pending-build → building → built →
replied` pipeline, and the CI builder lane. Only the source and the reply
template differ. Solicitation docs carry `kind: 'solicitation'` (mentions are
`kind: 'mention'`); the builder lane (`scripts/mention-builds.ts`) builds either.

```
Bluesky search (12h window, freshest first)
      │  planSolicitations: own-post / stale / per-author + global caps
      ▼
   classifySolicitation (ctx.callAI): genuine open call? SHARE / SKIP
      ▼
   deriveSolicitationIdea: read the poster's OWN recent posts →
      one FUN or USEFUL app idea they'd chuckle at (kind, never mean/weird)
      → moderatePrompt → build prompt
      ▼
   solicitation doc  status: pending-build  →  (builder lane)  →  built
      ▼
   backend.js tick: buildSolicitationReply → in-thread reply  →  replied
```

**Individualization = the app, not the words.** The derived idea becomes the
build _prompt_ (same untrusted-prompt → sandboxed-app threat model as a mention
prompt); the reply text stays a fixed template, so the no-echo /
prompt-injection defense holds. Solicitation replies get **no** claim DM (the
public reply carries the link; DMing strangers who didn't mention us is not).

### Enabling it (dark by default)

The lane runs nothing until an owner writes a `config-solicitation` doc into the
`oplog` db (admin mode / dashboard):

```json
{
  "_id": "config-solicitation",
  "kind": "config-solicitation",
  "enabled": true,
  "queries": ["drop your startup link", "drop your app link", "share what you're building"]
}
```

`enabled:false` or an empty `queries` array ⇒ inert. All the caps below are
optional overrides on the same doc; defaults live in `SOLICITATION_DEFAULTS`.

| knob               | default | meaning                                                                         |
| ------------------ | ------- | ------------------------------------------------------------------------------- |
| enabled            | false   | master switch — inert until an owner turns it on                                |
| queries            | []      | Bluesky search queries run each tick (max 6 used)                               |
| maxGlobalPerDay    | 8       | accepted solicitation replies per UTC day                                       |
| maxPerAuthorPerDay | 1       | one reply per poster per UTC day — never pile on                                |
| authorCooldownDays | 30      | and never reply to the same poster twice inside ~a month (mentions bypass this) |
| maxNewPerTick      | 2       | burst brake per 1-minute tick                                                   |
| maxRepliesPerTick  | 1       | replies posted per tick — slow, human-paced                                     |
| maxPostAgeHours    | 12      | only answer fresh calls; older threads read as spam                             |
| searchLimit        | 25      | posts fetched per query per tick                                                |
| authorFeedLimit    | 20      | of the poster's recent posts fed to the idea model                              |

**Never replies to bots.** The proactive lane skips automated accounts
(`isLikelyBotAccount`): a bot-suffixed / feed / RSS / aggregator handle or
display name, and known news mirrors (Hacker News, Lobsters, …). News bots
syndicate exactly the "what are you building" phrasing this lane searches for,
so replying to them is bot-to-bot spam under a post no human is watching (the
reply-bot-hn incident — we replied to `hackernewsbot.bsky.social`'s "Ask HN:
What Are You Working On?" repost). It's a deterministic, high-precision handle
signal; a false positive only costs the proactive lane one poster, who can
still `@`-mention us (the reactive lane never consults this gate). The
`authorCooldownDays` window likewise applies to the proactive lane only — an
`@`-mention is always answered, "unless they mention us" notwithstanding.

Search uses `sort=latest` + a 12h `since` cutoff (fresh-first, windowed
server-side); `planSolicitations` re-checks the age as a belt-and-suspenders.
Idempotency is the same cursorless trick as mentions — a deterministic
`sol-<did>-<rkey>` doc id means re-finding a post in a later tick is a no-op.

## Threads (Meta) proactive lane

The solicitation lane also runs on **Threads**, gated by its own switch and its
own token — same `requests` db, same guardrails (`planSolicitations` with
`platform: 'threads'`, so the bot-account skip and the monthly per-author
cooldown apply identically), same CI builder lane. Only the network I/O differs:
Threads search is `keyword_search`, and a reply is a two-call publish (create a
TEXT container with `reply_to_id`, then `threads_publish`). Individualization uses
just the matched post's text — the Threads API can't read an arbitrary poster's
feed. Threads solicitation docs carry `platform: 'threads'`; Bluesky docs are
`platform: 'bsky'` (a legacy doc with no field is treated as bsky), and caps are
counted per platform.

Threads has **two** sub-lanes, gated differently:

- **Reactive @-mention lane** (`me/mentions`): answers anyone who `@`-mentions the
  account. Runs as soon as a healthy token is pasted — **no `threadsEnabled`
  toggle, no keyword_search review**. Needs the mentions/replies permission on the
  token (`threads_manage_replies`), plus `threads_content_publish` to reply. Same
  guardrails + intent classifier as the Bluesky mention lane; docs are
  `kind:'mention', platform:'threads'`.
- **Proactive search lane** (`keyword_search`): the toggle below. Additionally
  needs `threadsEnabled:true` AND Meta's app-reviewed **`threads_keyword_search`**
  — until that's approved, search returns only your own posts (fails safe).

### Activating (dark by default, independent of the Bluesky switch)

1. **Meta developer app** with `threads_basic` + `threads_content_publish` +
   `threads_manage_replies` (mentions) — enough for the reactive lane — and, for
   the proactive lane, **`threads_keyword_search`** (app review).
2. **Long-lived Threads user token** → paste it in the dashboard's **Technical →
   Threads credential** box (write-only vault, `_id: token-threads`,
   `platform: 'threads'`). The next tick resolves the account id/username, shows
   it active, and the **@-mention lane starts immediately**.
3. **Turn on proactive search** (optional, after the keyword_search review): the
   **Solicitation replies · Threads** toggle (writes `threadsEnabled: true` +
   `threadsQueries` onto the `config-solicitation` doc). `threadsEnabled:false`
   freezes only the search lane's find/dispatch/reply; the @-mention lane keeps
   running on the token alone (parity with Bluesky mentions, which have no switch).

Config fields on the same `config-solicitation` doc: `threadsEnabled` (bool) and
`threadsQueries` (string[]); the shared caps (`maxGlobalPerDay`, cooldown, etc.)
apply per platform.

> Not yet exercised against the live Threads API — the exact `keyword_search`
> params and create/publish field names follow Meta's docs and want one smoke
> test the first time a real token is pasted. Everything the unit tests cover
> (triage, ids, reply text, config validation) is platform-pure.

## Known limits / follow-ons (tracked in #3323)

- X (Twitter) listener is still a follow-on (same doc protocol, new listener lane
  in this backend).
- Mention→reply latency is minutes (1m tick + 10m cron + build time), fine
  for a marketing bot; a queue-worker builder would shave it if it matters.
- Claimable ownership (pin the vibe to the requester, attach on first login)
  and mention-driven credit rewards are explicitly out of scope here.
