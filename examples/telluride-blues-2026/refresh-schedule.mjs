// Refresh the schedule snapshot this app's tick reads.
//
// Telluride's site serves a browser (and this script) fine, but the PLATFORM's
// egress gate refuses it — the gate admits an outbound host only if that host
// answers with an `Access-Control-Allow-Origin` of `*` or the vibe's own origin,
// and Squarespace sends neither. (Measured: a deployed probe got
// `{"vibesEgressDenied":true,"gate":"cors","host":"tellurideblues.com"}`. It is
// the gate refusing, not Telluride — worth knowing, because "they block us" and
// "we require a header they don't send" have different fixes.) So the
// fetch+parse happens HERE and the result is written into the vibe as
// `schedule-snapshot-<seq>` docs.
//
// Requires the account's DEFAULT handle to be the vibe's owner handle — the
// owner-only gate reads that, not the account, and not --handle. See README
// § Running the refresh. The deployed tick reads those
// by id and mirrors them into `scheduleitem` docs — the same docs the fetch lane
// would have produced, so nothing downstream knows the difference.
//
//   node refresh-schedule.mjs            # write the snapshot
//   node refresh-schedule.mjs --dry-run  # parse and report, write nothing
//
// Run it again whenever the festival moves set times — and keep running it
// through the festival, since that is when they move.
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { ingestScheduleFeed, SCHEDULE_URL } from './backend.js';
import { FESTIVAL } from './festival-config.js';

// Derived, so cloning this app to another handle is ONE edit (festival-config.js)
// rather than two files that can disagree about which app they're writing to.
const VIBE = FESTIVAL.vibeUrl.split('/vibe/')[1];
const CHUNK_BYTES = 90_000; // the platform's doc ceiling is 100 KB; leave headroom
const DRY = process.argv.includes('--dry-run');

const res = await fetch(SCHEDULE_URL, { headers: { accept: 'application/json' } });
if (!res.ok) throw new Error(`schedule page ${res.status} — the site changed or is down`);
const items = ingestScheduleFeed(await res.json());

// Sanity gate. A parser that silently returns nothing (the site was redesigned,
// a WAF served us a challenge page) must NOT overwrite a good snapshot with an
// empty one — an empty snapshot mirrors as "every event was cancelled".
if (items.length < 40) {
  throw new Error(`only ${items.length} sets parsed — refusing to publish a suspicious snapshot`);
}
const days = new Set(items.map((i) => i.start.slice(0, 10)));
for (const d of days) {
  if (!Object.values(FESTIVAL.dates).includes(d)) throw new Error(`set outside the festival: ${d}`);
}
if (new Set(items.map((i) => i.eventId)).size !== items.length)
  throw new Error('duplicate eventId');

const body = JSON.stringify(items);
const chunks = [];
for (let i = 0; i < body.length; i += CHUNK_BYTES) chunks.push(body.slice(i, i + CHUNK_BYTES));
const fetchedAt = new Date().toISOString();

console.log(
  `${items.length} sets · ${days.size} days · ${new Set(items.map((i) => i.venueTitle)).size} stages · ` +
    `${(body.length / 1024).toFixed(1)} KB in ${chunks.length} chunk(s)`
);

// Keep the raw page next to the parsed output so a future parse bug is
// diagnosable against what the site actually served that day.
mkdirSync(new URL('./fixtures/', import.meta.url), { recursive: true });
writeFileSync(new URL(`./fixtures/parsed-${fetchedAt.slice(0, 10)}.json`, import.meta.url), body);

if (DRY) {
  console.log('dry run — nothing written');
  process.exit(0);
}

chunks.forEach((chunk, seq) => {
  const doc = {
    _id: `schedule-snapshot-${seq}`,
    type: 'schedulesnapshot',
    seq,
    total: chunks.length,
    fetchedAt,
    body: chunk,
  };
  execFileSync(
    'npx',
    ['vibes-diy', 'db', 'put', JSON.stringify(doc), '--db', FESTIVAL.dbName, '--vibe', VIBE],
    { stdio: 'inherit' }
  );
});
console.log(`wrote ${chunks.length} snapshot doc(s) at ${fetchedAt}`);
