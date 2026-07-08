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

## Known limits / follow-ons (tracked in #3323)

- Bluesky only; Threads/X listeners are follow-on (same doc protocol, new
  listener lanes in this backend).
- Mention→reply latency is minutes (1m tick + 10m cron + build time), fine
  for a marketing bot; a queue-worker builder would shave it if it matters.
- Claimable ownership (pin the vibe to the requester, attach on first login)
  and mention-driven credit rewards are explicitly out of scope here.
