#!/usr/bin/env node
// Refresh the DEF CON 34 schedule snapshot in the vibe's db.
//
// info.defcon.org 403s the vibe backend's egress (IP/ASN-level block of the
// worker platform; browser headers don't help), so the backend can't fetch its
// own schedule. This script runs where the upstream IS reachable (a laptop, an
// agent container, CI), slims the feed to the fields the app actually reads,
// and writes it into the "defcon34" db as `schedule-snapshot` chunk docs. The
// backend's 1-minute scheduled tick assembles a COMPLETE chunk set into module
// state and serves it from GET /_api/schedule.json when the upstream fails.
//
// access.js routes unknown doc types to an unreadable channel, so the chunks
// are writable by the signed-in owner and invisible to clients — backend-only.
//
// Usage: node examples/defcon-picker/scripts/refresh-schedule.mjs
// (needs a vibes-diy CLI login that owns calendar/defcon-picker)

import { execFileSync } from 'node:child_process';

const UPSTREAM = 'https://info.defcon.org/ht/defcon34/views/scheduleDays.json';
const VIBE = 'calendar/defcon-picker';
const DB = 'defcon34';
// Linux caps a single argv string at 128 KiB (MAX_ARG_STRLEN) and the chunk
// rides `db put`'s positional JSON arg, so stay comfortably under it — also
// well below any doc-size ceiling. A full-con feed (DC33 was ~3.8 MB raw, far
// less slimmed) stays a handful of chunks.
const CHUNK_CHARS = 100_000;
// After writing seq 0..total-1, blind-delete this many trailing seqs so a
// shrinking snapshot can't leave stale chunks that fail the backend's
// completeness check. Deleting a missing doc is a harmless error.
const DELETE_TAIL = 40;

const slimSession = (s) => ({
  id: s.id,
  title: s.title,
  begin: s.begin,
  beginIso: s.beginIso,
  end: s.end,
  endIso: s.endIso,
  locationName: s.locationName,
  color: s.color,
  tags: Array.isArray(s.tags)
    ? s.tags.map((t) => ({
        label: t.label,
        colorBackground: t.colorBackground,
        colorForeground: t.colorForeground,
      }))
    : [],
  contentEntity:
    s.contentEntity && Array.isArray(s.contentEntity.links)
      ? { links: s.contentEntity.links }
      : undefined,
});

const cli = (args, input) =>
  execFileSync('npx', ['vibes-diy', ...args], {
    encoding: 'utf8',
    input,
    stdio: ['pipe', 'pipe', 'inherit'],
  });

// curl, not fetch: Node's undici ignores HTTPS_PROXY, and agent containers
// route outbound HTTPS through a proxy — a direct connection gets blocked.
// curl honors the proxy env everywhere this script runs.
const raw = execFileSync('curl', ['-sS', '--fail', '-H', 'accept: application/json', UPSTREAM], {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
const days = JSON.parse(raw);
if (!Array.isArray(days)) throw new Error('upstream shape changed: expected an array of days');

const slim = days.map((d) => ({ day: d.day, sessions: (d.sessions || []).map(slimSession) }));
const body = JSON.stringify(slim);
const sessionCount = slim.reduce((a, d) => a + d.sessions.length, 0);

const chunks = [];
for (let i = 0; i < body.length; i += CHUNK_CHARS) chunks.push(body.slice(i, i + CHUNK_CHARS));
const fetchedAt = new Date().toISOString();
const docs = chunks.map((chunk, seq) => ({
  _id: `schedule-snapshot-${seq}`,
  type: 'schedule-snapshot',
  seq,
  total: chunks.length,
  fetchedAt,
  body: chunk,
}));

console.log(
  `fetched ${days.length} days / ${sessionCount} sessions; ${body.length} chars → ${docs.length} chunk(s)`
);

// access.js owner-gates `schedule-snapshot` (the served schedule must not be
// poisonable by ordinary signed-in users), and owner enforcement is HANDLE-based:
// a write counts as the owner's only when the account's ACTIVE handle is the
// vibe's owning handle. Neither `--vibe calendar/...` nor `--admin` changes the
// acting handle (verified — both get "owner only"), so flip the account's
// default handle to `calendar` for the writes and restore it after. The flip is
// account-global state: keep the window short and ALWAYS restore (finally), or
// the owner's next push would land under `calendar`.
// The doc JSON rides stdin ('-'), so no argv byte limit applies regardless of
// chunk size or non-ASCII content.
const RESTORE_HANDLE = 'jchris'; // the account's primary handle
cli(['user-settings', '--set-default-handle', 'calendar']);
try {
  for (const doc of docs) {
    cli(['db', 'put', '--vibe', VIBE, '--db', DB, '-'], JSON.stringify(doc));
    console.log(`put ${doc._id} (${doc.body.length} chars)`);
  }

  // Sweep the WHOLE bounded tail — deleting a missing doc is a no-op today, but
  // if a CLI version ever errors on not-found, stopping early would strand
  // sparse stale chunks that keep the backend's completeness check false forever.
  for (let seq = docs.length; seq < docs.length + DELETE_TAIL; seq++) {
    try {
      cli(['db', 'del', '--vibe', VIBE, '--db', DB, `schedule-snapshot-${seq}`]);
    } catch {
      // not-found (or transient) — keep sweeping the rest of the range
    }
  }
} finally {
  cli(['user-settings', '--set-default-handle', RESTORE_HANDLE]);
}

console.log(`snapshot refreshed at ${docs[0].fetchedAt}`);
