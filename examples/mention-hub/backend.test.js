import { describe, it, expect, vi, afterEach } from "vitest";
import {
  DEFAULTS,
  BSKY_MAX_TEXT,
  bskyParseCredential,
  bskyLinkFacets,
  bskyPermalink,
  dayKey,
  mentionDocId,
  extractPrompt,
  promptKey,
  moderatePrompt,
  planMentions,
  buildReplyRecord,
  scheduled,
} from "./backend.js";

const NOW = "2026-07-06T12:00:00.000Z";

function notif(overrides = {}) {
  const rkey = overrides.rkey || "3lcaaa";
  const did = overrides.did || "did:plc:alice";
  return {
    uri: `at://${did}/app.bsky.feed.post/${rkey}`,
    cid: `cid-${rkey}`,
    reason: "mention",
    author: { did, handle: overrides.handle || "alice.bsky.social" },
    record: {
      text: overrides.text ?? "@vibesdiy.bsky.social make me a pomodoro timer",
      ...(overrides.reply ? { reply: overrides.reply } : {}),
    },
    indexedAt: overrides.indexedAt || "2026-07-06T11:59:00.000Z",
    ...overrides.extra,
  };
}

function plan(notifications, existing = [], cfgPatch = {}) {
  return planMentions({
    notifications,
    selfDid: "did:plc:self",
    selfHandle: "vibesdiy.bsky.social",
    existing,
    cfg: { ...DEFAULTS, ...cfgPatch },
    nowIso: NOW,
  });
}

describe("mentionDocId — deterministic idempotency key", () => {
  it("derives a stable id from the at-uri", () => {
    expect(mentionDocId("at://did:plc:xyz/app.bsky.feed.post/3lc2abc")).toBe("mention-did:plc:xyz-3lc2abc");
  });
  it("rejects malformed uris", () => {
    expect(mentionDocId("https://bsky.app/whatever")).toBeNull();
    expect(mentionDocId(undefined)).toBeNull();
  });
});

describe("extractPrompt — strip our trigger handle, keep the rest", () => {
  it("removes every occurrence of the self-handle mention, case-insensitively", () => {
    expect(extractPrompt("@VibesDIY.bsky.social build a todo app @vibesdiy.bsky.social", "vibesdiy.bsky.social")).toBe(
      "build a todo app"
    );
  });
  it("keeps other @-mentions (they may be part of the prompt)", () => {
    expect(extractPrompt("@vibesdiy.bsky.social an app for @alice.bsky.social", "vibesdiy.bsky.social")).toBe(
      "an app for @alice.bsky.social"
    );
  });
  it("collapses whitespace and trims", () => {
    expect(extractPrompt("  @vibesdiy.bsky.social \n a   drum machine ", "vibesdiy.bsky.social")).toBe("a drum machine");
  });
  it("does not shear a longer handle that merely starts with ours", () => {
    expect(extractPrompt("@vibesdiy.bsky.socialx says build it", "vibesdiy.bsky.social")).toBe(
      "@vibesdiy.bsky.socialx says build it"
    );
  });
});

describe("promptKey — dedupe normalization", () => {
  it("is case- and punctuation-insensitive", () => {
    expect(promptKey("Make me a TODO app!")).toBe(promptKey("make me a todo app"));
  });
  it("differs for genuinely different prompts", () => {
    expect(promptKey("a drum machine")).not.toBe(promptKey("a todo app"));
  });
});

describe("moderatePrompt — conservative gate, silent-skip semantics", () => {
  it("accepts a normal build prompt", () => {
    expect(moderatePrompt("make me a pomodoro timer with cats", DEFAULTS)).toEqual({ ok: true });
  });
  it("rejects too-short and too-long prompts", () => {
    expect(moderatePrompt("hi", DEFAULTS).ok).toBe(false);
    expect(moderatePrompt("x".repeat(2001), DEFAULTS).ok).toBe(false);
  });
  it("rejects prompts carrying links (top abuse vector)", () => {
    const r = moderatePrompt("build this https://evil.example/payload", DEFAULTS);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/link/);
  });
  it("rejects adult / scam / abuse-tooling patterns", () => {
    expect(moderatePrompt("make a porn site", DEFAULTS).ok).toBe(false);
    expect(moderatePrompt("crypto presale landing page", DEFAULTS).ok).toBe(false);
    expect(moderatePrompt("build me a keylogger dashboard", DEFAULTS).ok).toBe(false);
  });
  it("honors config overrides for length", () => {
    expect(moderatePrompt("tiny", { ...DEFAULTS, minPromptChars: 3 }).ok).toBe(true);
  });
});

describe("planMentions — triage + guardrails", () => {
  it("accepts a fresh valid mention as pending-build with prompt extracted", () => {
    const out = plan([notif({})]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      kind: "mention",
      status: "pending-build",
      prompt: "make me a pomodoro timer",
      authorDid: "did:plc:alice",
      day: "2026-07-06",
    });
    expect(out[0]._id).toBe("mention-did:plc:alice-3lcaaa");
  });

  it("is idempotent: an already-recorded mention produces nothing", () => {
    const first = plan([notif({})]);
    const out = plan([notif({})], first);
    expect(out).toHaveLength(0);
  });

  it("ignores non-mention notification reasons", () => {
    const out = plan([{ ...notif({}), reason: "like" }]);
    expect(out).toHaveLength(0);
  });

  it("skips our own posts", () => {
    const out = plan([notif({ did: "did:plc:self" })]);
    expect(out[0]).toMatchObject({ status: "skipped", reason: "own post" });
  });

  it("skips moderation failures with the reason recorded", () => {
    const out = plan([notif({ text: "@vibesdiy.bsky.social hi" })]);
    expect(out[0]).toMatchObject({ status: "skipped", reason: "prompt too short" });
  });

  it("dedupes an identical prompt inside the window", () => {
    const existing = [
      {
        _id: "mention-did:plc:bob-3old",
        kind: "mention",
        status: "replied",
        promptKey: promptKey("make me a pomodoro timer"),
        authorDid: "did:plc:bob",
        day: "2026-07-01",
        createdAt: "2026-07-01T00:00:00.000Z",
      },
    ];
    const out = plan([notif({})], existing);
    expect(out[0]).toMatchObject({ status: "skipped", reason: "duplicate prompt" });
  });

  it("allows the same prompt again once outside the dedupe window", () => {
    const existing = [
      {
        _id: "mention-did:plc:bob-3old",
        kind: "mention",
        status: "replied",
        promptKey: promptKey("make me a pomodoro timer"),
        authorDid: "did:plc:bob",
        day: "2026-06-01",
        createdAt: "2026-06-01T00:00:00.000Z",
      },
    ];
    const out = plan([notif({})], existing);
    expect(out[0].status).toBe("pending-build");
  });

  it("enforces the per-author daily cap", () => {
    const existing = [1, 2].map((i) => ({
      _id: `mention-did:plc:alice-3prev${i}`,
      kind: "mention",
      status: "replied",
      promptKey: `prev-${i}`,
      authorDid: "did:plc:alice",
      day: "2026-07-06",
      createdAt: NOW,
    }));
    const out = plan([notif({})], existing);
    expect(out[0]).toMatchObject({ status: "skipped", reason: "author daily cap" });
  });

  it("enforces the global daily cap (the spend ceiling)", () => {
    const existing = Array.from({ length: DEFAULTS.maxGlobalPerDay }, (_, i) => ({
      _id: `mention-did:plc:u${i}-3prev`,
      kind: "mention",
      status: "pending-build",
      promptKey: `prev-${i}`,
      authorDid: `did:plc:u${i}`,
      day: "2026-07-06",
      createdAt: NOW,
    }));
    const out = plan([notif({})], existing);
    expect(out[0]).toMatchObject({ status: "skipped", reason: "global daily cap" });
  });

  it("skipped docs do not consume the caps", () => {
    const existing = Array.from({ length: DEFAULTS.maxGlobalPerDay }, (_, i) => ({
      _id: `mention-did:plc:u${i}-3prev`,
      kind: "mention",
      status: "skipped",
      reason: "prompt too short",
      promptKey: `prev-${i}`,
      authorDid: `did:plc:u${i}`,
      day: "2026-07-06",
      createdAt: NOW,
    }));
    const out = plan([notif({})], existing);
    expect(out[0].status).toBe("pending-build");
  });

  it("brakes a burst at maxNewPerTick without recording verdicts for the rest", () => {
    const burst = Array.from({ length: DEFAULTS.maxNewPerTick + 3 }, (_, i) =>
      notif({ rkey: `3lc${i}`, did: `did:plc:u${i}`, text: `@vibesdiy.bsky.social build unique app number ${i} please` })
    );
    const out = plan(burst);
    expect(out.filter((d) => d.status === "pending-build")).toHaveLength(DEFAULTS.maxNewPerTick);
    // The overflow is left unwritten so a later tick re-triages it fresh.
    expect(out).toHaveLength(DEFAULTS.maxNewPerTick);
  });

  it("counts accepted docs within one tick toward the author cap", () => {
    const two = [
      notif({ rkey: "3lc1", text: "@vibesdiy.bsky.social build me a first unique app" }),
      notif({ rkey: "3lc2", text: "@vibesdiy.bsky.social build me a second unique app" }),
      notif({ rkey: "3lc3", text: "@vibesdiy.bsky.social build me a third unique app" }),
    ];
    const out = plan(two);
    expect(out.map((d) => d.status)).toEqual(["pending-build", "pending-build", "skipped"]);
    expect(out[2].reason).toBe("author daily cap");
  });

  it("threads reply refs through from the mention's own thread", () => {
    const reply = { root: { uri: "at://did:plc:root/app.bsky.feed.post/3root", cid: "cid-root" } };
    const out = plan([notif({ reply })]);
    expect(out[0].rootUri).toBe("at://did:plc:root/app.bsky.feed.post/3root");
    expect(out[0].rootCid).toBe("cid-root");
  });

  it("uses the mention itself as root for a top-level post", () => {
    const out = plan([notif({})]);
    expect(out[0].rootUri).toBe(out[0].uri);
    expect(out[0].rootCid).toBe(out[0].cid);
  });
});

describe("buildReplyRecord — fixed template, threaded, faceted", () => {
  const mention = {
    uri: "at://did:plc:alice/app.bsky.feed.post/3lcaaa",
    cid: "cid-3lcaaa",
    rootUri: "at://did:plc:root/app.bsky.feed.post/3root",
    rootCid: "cid-root",
  };
  it("builds a reply with both links faceted and the thread refs set", () => {
    const { record, error } = buildReplyRecord({
      mention,
      vibeUrl: "https://vibes.diy/vibe/mentions/m-3lcaaa",
      createdAt: NOW,
      embed: undefined,
    });
    expect(error).toBeUndefined();
    expect(record.reply).toEqual({
      root: { uri: mention.rootUri, cid: mention.rootCid },
      parent: { uri: mention.uri, cid: mention.cid },
    });
    expect(record.facets).toHaveLength(2);
    expect(record.facets[0].features[0].uri).toBe("https://vibes.diy/vibe/mentions/m-3lcaaa");
    expect(record.text).not.toMatch(/error/i);
    expect([...record.text].length).toBeLessThanOrEqual(BSKY_MAX_TEXT);
    expect(record.embed).toBeUndefined();
  });
  it("attaches the embed when provided", () => {
    const embed = { $type: "app.bsky.embed.images", images: [] };
    const { record } = buildReplyRecord({ mention, vibeUrl: "https://vibes.diy/vibe/m/x", createdAt: NOW, embed });
    expect(record.embed).toBe(embed);
  });
});

describe("ported bsky helpers", () => {
  it("bskyParseCredential splits on the last colon (DIDs survive)", () => {
    expect(bskyParseCredential("did:plc:abc123:xxxx-yyyy-zzzz-wwww")).toEqual({
      identifier: "did:plc:abc123",
      password: "xxxx-yyyy-zzzz-wwww",
    });
    expect(bskyParseCredential("no-colon")).toBeNull();
  });
  it("bskyLinkFacets uses byte offsets", () => {
    const facets = bskyLinkFacets("é https://x.co");
    // 'é' is 2 bytes in UTF-8, plus the space → byteStart 3.
    expect(facets[0].index).toEqual({ byteStart: 3, byteEnd: 3 + "https://x.co".length });
  });
  it("bskyPermalink converts an at-uri to the public app URL", () => {
    expect(bskyPermalink("at://did:plc:x/app.bsky.feed.post/3abc", "vibesdiy.bsky.social")).toBe(
      "https://bsky.app/profile/vibesdiy.bsky.social/post/3abc"
    );
  });
  it("dayKey slices the UTC day", () => {
    expect(dayKey(NOW)).toBe("2026-07-06");
  });
});

// --- scheduled(): wiring-level behaviors with a fake db + stubbed fetch -------

function fakeDb() {
  const dbs = { vault: new Map(), requests: new Map(), oplog: new Map() };
  let auto = 0;
  return {
    dbs,
    seed(db, doc) {
      dbs[db].set(doc._id || `auto-${++auto}`, doc);
    },
    ctx: {
      db: {
        async query({ db }) {
          return [...dbs[db].values()];
        },
        async put(doc, { db }) {
          dbs[db].set(doc._id || `auto-${++auto}`, doc);
        },
      },
    },
  };
}

function xrpcStub(routes) {
  return vi.fn(async (url, init) => {
    for (const [needle, responder] of routes) {
      if (String(url).includes(needle)) return responder(url, init);
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

describe("scheduled — tick wiring", () => {
  afterEach(() => vi.unstubAllGlobals());

  const freshToken = {
    _id: "token-bsky",
    kind: "token",
    platform: "bsky",
    token: "vibesdiy.bsky.social:aaaa-bbbb-cccc-dddd",
    did: "did:plc:self",
    handle: "vibesdiy.bsky.social",
    accessJwt: "jwt-access",
    refreshJwt: "jwt-refresh",
    refreshedAt: new Date().toISOString(),
  };

  it("does nothing but project status when no credential is pasted", async () => {
    const f = fakeDb();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await scheduled({}, f.ctx);
    expect(fetchSpy).not.toHaveBeenCalled();
    const statuses = [...f.dbs.oplog.values()].filter((d) => d.kind === "token-status");
    expect(statuses).toHaveLength(1);
    expect(statuses[0].hasToken).toBe(false);
  });

  it("records an accepted mention from the notification poll", async () => {
    const f = fakeDb();
    f.seed("vault", freshToken);
    vi.stubGlobal("fetch", xrpcStub([["listNotifications", () => json({ notifications: [notif({})] })]]));
    await scheduled({}, f.ctx);
    const mentions = [...f.dbs.requests.values()];
    expect(mentions).toHaveLength(1);
    expect(mentions[0]).toMatchObject({ status: "pending-build", prompt: "make me a pomodoro timer" });
    const state = f.dbs.oplog.get("listener-state");
    expect(state.lastError).toBeNull();
  });

  it("replies to a built mention with the link card fallback and marks it replied", async () => {
    const f = fakeDb();
    f.seed("vault", freshToken);
    f.seed("requests", {
      _id: "mention-did:plc:alice-3lcaaa",
      kind: "mention",
      status: "built",
      uri: "at://did:plc:alice/app.bsky.feed.post/3lcaaa",
      cid: "cid-3lcaaa",
      rootUri: "at://did:plc:alice/app.bsky.feed.post/3lcaaa",
      rootCid: "cid-3lcaaa",
      prompt: "make me a pomodoro timer",
      vibeUrl: "https://vibes.diy/vibe/mentions/m-3lcaaa",
      screenshotUrl: "https://m-3lcaaa--mentions.vibesdiy.app/screenshot.png",
      attempts: 0,
      day: "2026-07-06",
      createdAt: NOW,
    });
    let created;
    vi.stubGlobal(
      "fetch",
      xrpcStub([
        ["listNotifications", () => json({ notifications: [] })],
        // Screenshot fetch fails → the reply must degrade to the external card.
        ["screenshot.png", () => new Response("nope", { status: 404 })],
        [
          "createRecord",
          async (url, init) => {
            created = JSON.parse(init.body);
            return json({ uri: "at://did:plc:self/app.bsky.feed.post/3reply", cid: "cid-reply" });
          },
        ],
      ])
    );
    await scheduled({}, f.ctx);
    const m = f.dbs.requests.get("mention-did:plc:alice-3lcaaa");
    expect(m.status).toBe("replied");
    expect(m.replyPermalink).toBe("https://bsky.app/profile/vibesdiy.bsky.social/post/3reply");
    expect(created.record.embed.$type).toBe("app.bsky.embed.external");
    expect(created.record.reply.parent.cid).toBe("cid-3lcaaa");
    expect(created.record.text).toContain("https://vibes.diy/vibe/mentions/m-3lcaaa");
    // No-echo invariant covers embed metadata too: the card must be constant
    // text, never the requester's prompt (Charlie review, #3329).
    expect(JSON.stringify(created.record.embed)).not.toContain("pomodoro");
  });

  it("uploads the screenshot and embeds it as an image when the fetch succeeds", async () => {
    const f = fakeDb();
    f.seed("vault", freshToken);
    f.seed("requests", {
      _id: "mention-did:plc:alice-3lcbbb",
      kind: "mention",
      status: "built",
      uri: "at://did:plc:alice/app.bsky.feed.post/3lcbbb",
      cid: "cid-3lcbbb",
      rootUri: "at://did:plc:alice/app.bsky.feed.post/3lcbbb",
      rootCid: "cid-3lcbbb",
      prompt: "a drum machine",
      vibeUrl: "https://vibes.diy/vibe/mentions/m-3lcbbb",
      screenshotUrl: "https://m-3lcbbb--mentions.vibesdiy.app/screenshot.png",
      attempts: 0,
      day: "2026-07-06",
      createdAt: NOW,
    });
    let created;
    vi.stubGlobal(
      "fetch",
      xrpcStub([
        ["listNotifications", () => json({ notifications: [] })],
        [
          "screenshot.png",
          () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/jpeg" } }),
        ],
        ["uploadBlob", () => json({ blob: { $type: "blob", ref: { $link: "bafk" }, mimeType: "image/jpeg", size: 3 } })],
        [
          "createRecord",
          async (url, init) => {
            created = JSON.parse(init.body);
            return json({ uri: "at://did:plc:self/app.bsky.feed.post/3reply2", cid: "cid-reply2" });
          },
        ],
      ])
    );
    await scheduled({}, f.ctx);
    expect(created.record.embed.$type).toBe("app.bsky.embed.images");
    expect(created.record.embed.images[0].image.ref.$link).toBe("bafk");
    expect(f.dbs.requests.get("mention-did:plc:alice-3lcbbb").status).toBe("replied");
  });

  it("gives up quietly after MAX_REPLY_ATTEMPTS — no post, status error", async () => {
    const f = fakeDb();
    f.seed("vault", freshToken);
    f.seed("requests", {
      _id: "mention-did:plc:alice-3lcccc",
      kind: "mention",
      status: "built",
      uri: "at://did:plc:alice/app.bsky.feed.post/3lcccc",
      cid: "c",
      rootUri: "r",
      rootCid: "rc",
      vibeUrl: "https://vibes.diy/vibe/mentions/m-3lcccc",
      attempts: 5,
      day: "2026-07-06",
      createdAt: NOW,
    });
    const fetchSpy = xrpcStub([["listNotifications", () => json({ notifications: [] })]]);
    vi.stubGlobal("fetch", fetchSpy);
    await scheduled({}, f.ctx);
    const m = f.dbs.requests.get("mention-did:plc:alice-3lcccc");
    expect(m.status).toBe("error");
    // Only the notification poll hit the network — no createRecord.
    expect(fetchSpy.mock.calls.every(([url]) => !String(url).includes("createRecord"))).toBe(true);
  });

  it("holds replies and flags re-auth on a 401 instead of erroring the doc", async () => {
    const f = fakeDb();
    f.seed("vault", { ...freshToken });
    f.seed("requests", {
      _id: "mention-did:plc:alice-3lcddd",
      kind: "mention",
      status: "built",
      uri: "at://did:plc:alice/app.bsky.feed.post/3lcddd",
      cid: "c",
      rootUri: "r",
      rootCid: "rc",
      vibeUrl: "https://vibes.diy/vibe/mentions/m-3lcddd",
      attempts: 0,
      day: "2026-07-06",
      createdAt: NOW,
    });
    vi.stubGlobal(
      "fetch",
      xrpcStub([
        ["listNotifications", () => json({ notifications: [] })],
        ["createRecord", () => json({ error: "AuthRequired", message: "expired" }, 401)],
      ])
    );
    await scheduled({}, f.ctx);
    expect(f.dbs.requests.get("mention-did:plc:alice-3lcddd").status).toBe("built");
    expect(f.dbs.vault.get("token-bsky").needsReauth).toBe(true);
  });

  it("never touches build-failed docs (quiet failure path)", async () => {
    const f = fakeDb();
    f.seed("vault", freshToken);
    f.seed("requests", {
      _id: "mention-did:plc:alice-3lceee",
      kind: "mention",
      status: "build-failed",
      uri: "at://did:plc:alice/app.bsky.feed.post/3lceee",
      cid: "c",
      rootUri: "r",
      rootCid: "rc",
      error: "generate exited 1",
      attempts: 1,
      day: "2026-07-06",
      createdAt: NOW,
    });
    const fetchSpy = xrpcStub([["listNotifications", () => json({ notifications: [] })]]);
    vi.stubGlobal("fetch", fetchSpy);
    await scheduled({}, f.ctx);
    expect(f.dbs.requests.get("mention-did:plc:alice-3lceee").status).toBe("build-failed");
    expect(fetchSpy.mock.calls.every(([url]) => !String(url).includes("createRecord"))).toBe(true);
  });

  it("honors config-doc overrides for the caps", async () => {
    const f = fakeDb();
    f.seed("vault", freshToken);
    f.seed("oplog", { _id: "config", kind: "config", maxGlobalPerDay: 0 });
    vi.stubGlobal("fetch", xrpcStub([["listNotifications", () => json({ notifications: [notif({})] })]]));
    await scheduled({}, f.ctx);
    const mentions = [...f.dbs.requests.values()];
    expect(mentions).toHaveLength(1);
    expect(mentions[0]).toMatchObject({ status: "skipped", reason: "global daily cap" });
  });
});
