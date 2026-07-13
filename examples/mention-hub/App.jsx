import React, { useState } from 'react';
import { useFireproof } from 'use-fireproof';
import { useVibe } from 'use-vibes';

// mention-hub: the Bluesky mention-builds console (#3323). Owner-only end to
// end — the app-password lives in the write-only vault db, the scheduled
// backend listens for mentions AND searches for open "drop your app link"
// solicitations, replying to verified-live builds; the CI builder lane turns
// accepted requests into published vibes.
//
// Two tabs:
//   • Content Planner — the friendly view: turn the solicitation lane on/off,
//     set what topics it watches + a daily limit, and watch the content queue
//     move from "in the works" to "posted".
//   • Technical — the raw console: paste credentials, tune every guardrail,
//     read the mention ledger and the op log.

const STATUS_TONE = {
  replied: 'bg-emerald-900/60 text-emerald-300 border-emerald-700',
  built: 'bg-sky-900/60 text-sky-300 border-sky-700',
  building: 'bg-indigo-900/60 text-indigo-300 border-indigo-700',
  'pending-build': 'bg-yellow-900/50 text-yellow-300 border-yellow-700',
  skipped: 'bg-stone-800 text-stone-400 border-stone-600',
  'build-failed': 'bg-red-900/60 text-red-300 border-red-700',
  error: 'bg-red-900/60 text-red-300 border-red-700',
};

// Friendly labels for the planner view (the technical view keeps raw statuses).
const STATUS_LABEL = {
  replied: 'Posted',
  built: 'Ready to post',
  building: 'Building…',
  'pending-build': 'Queued',
  skipped: 'Skipped',
  'build-failed': 'Failed',
  error: 'Failed',
};

function StatusChip({ status, label }) {
  return (
    <span
      className={`text-[11px] px-[8px] py-[2px] rounded-full border whitespace-nowrap ${STATUS_TONE[status] || STATUS_TONE.skipped}`}
    >
      {label || status}
    </span>
  );
}

// One post in the planner feed — a mention we answered or a solicitation we
// found. The app we built for them is the content; the reply is where it landed.
function PostCard({ p }) {
  const isSol = p.kind === 'solicitation';
  return (
    <div className="border border-stone-800 rounded-[10px] p-[12px] bg-stone-900/40">
      <div className="flex items-center justify-between gap-[8px]">
        <div className="flex items-center gap-[8px] min-w-0">
          <span className="text-[13px]" title={isSol ? 'found in search' : 'replied to a mention'}>
            {isSol ? '🔎' : '💬'}
          </span>
          <span className="text-[13px] text-stone-200 truncate">
            @{p.authorHandle || 'someone'}
          </span>
        </div>
        <StatusChip status={p.status} label={STATUS_LABEL[p.status]} />
      </div>
      {p.prompt || p.text ? (
        <div className="text-[12px] text-stone-400 mt-[6px] break-words">
          <span className="text-stone-500">{isSol ? 'app built: ' : 'their ask: '}</span>
          {p.prompt || p.text}
        </div>
      ) : null}
      <div className="flex items-center gap-[14px] mt-[8px] text-[11px]">
        {p.vibeUrl ? (
          <a href={p.vibeUrl} target="_blank" rel="noreferrer" className="text-sky-400 underline">
            preview the app
          </a>
        ) : null}
        {p.replyPermalink ? (
          <a
            href={p.replyPermalink}
            target="_blank"
            rel="noreferrer"
            className="text-sky-400 underline"
          >
            see the reply
          </a>
        ) : null}
        <span className="text-stone-600 ml-auto">
          {(p.repliedAt || p.builtAt || p.createdAt || '').slice(0, 16).replace('T', ' ')}
        </span>
      </div>
    </div>
  );
}

const CONFIG_FIELDS = [
  ['maxPerAuthorPerDay', 'per-author builds / day'],
  ['maxGlobalPerDay', 'global builds / day (spend ceiling)'],
  ['maxNewPerTick', 'new builds / tick'],
  ['maxRepliesPerTick', 'replies / tick'],
  ['maxDmsPerTick', 'claim DMs / tick'],
  ['minPromptChars', 'min prompt chars'],
  ['dedupeWindowDays', 'dedupe window (days)'],
  ['maxMentionAgeDays', 'max mention age (days)'],
];

export default function App() {
  const { database: vaultDb } = useFireproof('vault');
  const { useLiveQuery: reqQ } = useFireproof('requests');
  const { useLiveQuery: logQ, database: logDb } = useFireproof('oplog');
  const { can, ready } = useVibe('vault');

  // The raw credential never syncs here (write-only vault); the dashboard
  // reads the redacted `token-status` projections the backend mirrors (one per
  // platform).
  const tokenStatuses = logQ('kind', { key: 'token-status' }).docs;
  const tokenStatus = tokenStatuses.find((d) => d.platform === 'bsky') || tokenStatuses[0];
  const threadsTokenStatus = tokenStatuses.find((d) => d.platform === 'threads');
  const listener = logQ('kind', { key: 'listener-state' }).docs[0];
  const configDoc = logQ('kind', { key: 'config' }).docs[0];
  const solConfigDoc = logQ('kind', { key: 'config-solicitation' }).docs[0];
  const mentions = reqQ('kind', { key: 'mention' }).docs.sort((a, b) =>
    (b.createdAt || '').localeCompare(a.createdAt || '')
  );
  const solicitations = reqQ('kind', { key: 'solicitation' }).docs.sort((a, b) =>
    (b.createdAt || '').localeCompare(a.createdAt || '')
  );
  const oplog = logQ('kind', { key: 'oplog' })
    .docs.sort((a, b) => (b.at || '').localeCompare(a.at || ''))
    .slice(0, 20);

  const [tab, setTab] = useState('planner');
  const [credential, setCredential] = useState('');
  const [threadsCred, setThreadsCred] = useState('');
  const [githubPat, setGithubPat] = useState('');
  const [justSaved, setJustSaved] = useState(null);
  const [cfgDraft, setCfgDraft] = useState(null);
  const [solForm, setSolForm] = useState(null);

  if (!ready) return <div className="min-h-screen bg-[#141a1e]" />;
  const gate = can.create({ kind: 'token', platform: 'bsky' });
  if (!gate.ok) {
    return (
      <div className="min-h-screen bg-[#141a1e] text-stone-200 font-mono flex items-center justify-center p-[24px] text-center">
        <div>
          <div className="text-[20px] font-bold text-[#FEDD00] mb-[8px]">mention·hub</div>
          <p className="text-[13px] text-stone-400 max-w-[420px]">
            The Vibes DIY social mention-builds console. Its contents are visible to the owner only.
          </p>
        </div>
      </div>
    );
  }

  const saveCredential = async () => {
    if (!credential.trim()) return;
    await vaultDb.put({
      _id: 'token-bsky',
      kind: 'token',
      platform: 'bsky',
      token: credential.trim(),
      pastedAt: new Date().toISOString(),
      did: null,
      handle: null,
      needsReauth: false,
      lastError: null,
    });
    setCredential('');
    setJustSaved('bsky');
    setTimeout(() => setJustSaved(null), 2500);
  };

  // The long-lived Threads (Meta) token for the proactive Threads lane. Same
  // write-only vault; the backend resolves the user id from it on the next tick.
  const saveThreadsCred = async () => {
    if (!threadsCred.trim()) return;
    await vaultDb.put({
      _id: 'token-threads',
      kind: 'token',
      platform: 'threads',
      token: threadsCred.trim(),
      pastedAt: new Date().toISOString(),
      userId: null,
      username: null,
      needsReauth: false,
      lastError: null,
    });
    setThreadsCred('');
    setJustSaved('threads');
    setTimeout(() => setJustSaved(null), 2500);
  };

  // The GitHub PAT that lets the backend fire the builder workflow on demand
  // (#3529). Same write-only vault as the Bluesky credential — never syncs back.
  const saveGithubPat = async () => {
    if (!githubPat.trim()) return;
    await vaultDb.put({
      _id: 'token-github',
      kind: 'token',
      platform: 'github',
      token: githubPat.trim(),
      pastedAt: new Date().toISOString(),
      needsReauth: false,
      lastError: null,
    });
    setGithubPat('');
    setJustSaved('github');
    setTimeout(() => setJustSaved(null), 2500);
  };

  const saveConfig = async () => {
    await logDb.put({
      ...(configDoc || {}),
      _id: 'config',
      kind: 'config',
      ...cfgDraft,
      updatedAt: new Date().toISOString(),
    });
    setCfgDraft(null);
  };

  // Solicitation-lane switch/knobs live in their own config-solicitation doc.
  const saveSol = async (patch) => {
    await logDb.put({
      ...(solConfigDoc || {}),
      _id: 'config-solicitation',
      kind: 'config-solicitation',
      ...patch,
      updatedAt: new Date().toISOString(),
    });
  };
  const solEnabled = !!solConfigDoc?.enabled;
  const threadsEnabled = !!solConfigDoc?.threadsEnabled;
  const solCap = solConfigDoc?.maxGlobalPerDay ?? 8;
  const sf = solForm ?? {
    maxGlobalPerDay: solCap,
    queriesText: (solConfigDoc?.queries || []).join('\n'),
    threadsQueriesText: (solConfigDoc?.threadsQueries || []).join('\n'),
  };
  const toggleSol = () => saveSol({ enabled: !solEnabled });
  const toggleThreads = () => saveSol({ threadsEnabled: !threadsEnabled });
  const saveSolForm = async () => {
    const toLines = (txt) =>
      (txt || '')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
    const cap = Number(sf.maxGlobalPerDay);
    await saveSol({
      maxGlobalPerDay: Number.isInteger(cap) && cap >= 0 ? cap : undefined,
      queries: toLines(sf.queriesText),
      threadsQueries: toLines(sf.threadsQueriesText),
    });
    setSolForm(null);
  };

  const today = new Date().toISOString().slice(0, 10);
  const acceptedToday = mentions.filter((m) => m.day === today && m.status !== 'skipped').length;

  // Planner feed: mentions + solicitations, newest first, bucketed by lifecycle.
  const posts = [...mentions, ...solicitations].sort((a, b) =>
    (b.createdAt || '').localeCompare(a.createdAt || '')
  );
  const queue = posts.filter((p) => ['pending-build', 'building', 'built'].includes(p.status));
  const posted = posts.filter((p) => p.status === 'replied');
  const solToday = solicitations.filter((s) => s.day === today && s.status !== 'skipped').length;
  const solLeft = Math.max(0, solCap - solToday);
  const postedToday = posts.filter(
    (p) => p.status === 'replied' && (p.repliedAt || p.createdAt || '').slice(0, 10) === today
  ).length;

  return (
    <div className="min-h-screen bg-[#141a1e] text-stone-200 font-mono p-[16px]">
      <div className="max-w-[880px] mx-auto space-y-[16px]">
        <header className="flex items-center justify-between gap-[12px] flex-wrap">
          <div className="flex items-baseline gap-[12px]">
            <h1 className="text-[22px] font-bold text-[#FEDD00]">mention·hub</h1>
            {tokenStatus?.handle ? (
              <span className="text-[12px] text-stone-500">posts as @{tokenStatus.handle}</span>
            ) : null}
          </div>
          <div className="flex gap-[4px] border border-stone-700 rounded-[8px] p-[4px]">
            {[
              ['planner', 'Content Planner'],
              ['technical', 'Technical'],
            ].map(([t, label]) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`text-[12px] px-[14px] py-[6px] rounded-[6px] ${
                  tab === t ? 'bg-[#FEDD00] text-stone-900 font-bold' : 'text-stone-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </header>

        {tab === 'planner' && (
          <>
            {/* What the bot is doing right now */}
            <section className="border border-stone-700 rounded-[8px] p-[16px] space-y-[12px]">
              <div className="flex items-start justify-between gap-[12px] flex-wrap">
                <div>
                  <div className="text-[15px] font-bold flex items-center gap-[8px]">
                    <span
                      className={`inline-block w-[10px] h-[10px] rounded-full ${
                        solEnabled ? 'bg-emerald-400' : 'bg-stone-500'
                      }`}
                    />
                    Solicitation replies
                    <span className={solEnabled ? 'text-emerald-400' : 'text-stone-500'}>
                      {solEnabled ? 'ON' : 'OFF'}
                    </span>
                  </div>
                  <p className="text-[12px] text-stone-400 mt-[4px] max-w-[520px]">
                    {solEnabled
                      ? 'Watching Bluesky for people asking others to share their apps. For each genuine one, it builds a little app tailored to that person and replies with the live link.'
                      : 'Turn on to proactively find "drop your app link" posts and answer each with a custom-built app. Nothing posts while this is off.'}
                  </p>
                </div>
                {/* On/off toggle */}
                <button
                  onClick={toggleSol}
                  role="switch"
                  aria-checked={solEnabled}
                  className={`shrink-0 w-[52px] h-[28px] rounded-full p-[3px] transition-colors ${
                    solEnabled ? 'bg-emerald-500' : 'bg-stone-600'
                  }`}
                >
                  <span
                    className={`block w-[22px] h-[22px] rounded-full bg-white transition-transform ${
                      solEnabled ? 'translate-x-[24px]' : ''
                    }`}
                  />
                </button>
              </div>

              {/* Today's budget */}
              <div className="flex gap-[16px] text-[12px] flex-wrap">
                <div className="text-stone-300">
                  <span className="text-[18px] font-bold text-[#FEDD00]">{solLeft}</span> of{' '}
                  {solCap} replies left today
                </div>
                <div className="text-stone-500">
                  last search: {listener?.solLastPollAt?.slice(11, 19) || '—'}
                  {listener?.solLastError ? (
                    <span className="text-red-400"> · {listener.solLastError}</span>
                  ) : null}
                </div>
              </div>

              {/* Topics + daily limit */}
              <div className="grid gap-[10px] sm:grid-cols-[1fr_140px]">
                <label className="text-[12px] text-stone-400 space-y-[4px] block">
                  Topics we watch (one search per line)
                  <textarea
                    value={sf.queriesText}
                    onChange={(e) => setSolForm({ ...sf, queriesText: e.target.value })}
                    rows={4}
                    placeholder={
                      'drop your startup link\ndrop your app link\nshare what you are building'
                    }
                    className="w-full bg-stone-900 border border-stone-700 rounded-[6px] px-[10px] py-[6px] text-[12px] text-stone-200"
                  />
                </label>
                <label className="text-[12px] text-stone-400 space-y-[4px] block">
                  Replies / day
                  <input
                    type="number"
                    min="0"
                    value={sf.maxGlobalPerDay}
                    onChange={(e) => setSolForm({ ...sf, maxGlobalPerDay: e.target.value })}
                    className="w-full bg-stone-900 border border-stone-700 rounded-[6px] px-[10px] py-[6px] text-[12px] text-stone-200"
                  />
                  <span className="text-[11px] text-stone-600 leading-tight block">
                    Start small (2–3) to watch the tone, then raise it.
                  </span>
                </label>
              </div>
              {solForm ? (
                <div className="flex gap-[8px]">
                  <button
                    onClick={saveSolForm}
                    className="bg-[#FEDD00] text-stone-900 font-bold text-[12px] px-[14px] py-[6px] rounded-[6px]"
                  >
                    save topics &amp; limit
                  </button>
                  <button
                    onClick={() => setSolForm(null)}
                    className="text-stone-400 text-[12px] px-[10px] py-[6px]"
                  >
                    cancel
                  </button>
                </div>
              ) : null}
            </section>

            {/* Same proactive lane, on Threads (Meta) */}
            <section className="border border-stone-700 rounded-[8px] p-[16px] space-y-[12px]">
              <div className="flex items-start justify-between gap-[12px] flex-wrap">
                <div>
                  <div className="text-[15px] font-bold flex items-center gap-[8px]">
                    <span
                      className={`inline-block w-[10px] h-[10px] rounded-full ${
                        threadsEnabled ? 'bg-emerald-400' : 'bg-stone-500'
                      }`}
                    />
                    Solicitation replies · Threads
                    <span className={threadsEnabled ? 'text-emerald-400' : 'text-stone-500'}>
                      {threadsEnabled ? 'ON' : 'OFF'}
                    </span>
                  </div>
                  <p className="text-[12px] text-stone-400 mt-[4px] max-w-[520px]">
                    The same proactive lane on Threads. Needs a Threads token in the Technical tab
                    and the <code>threads_keyword_search</code> permission approved by Meta; until
                    then search finds nothing. Bots and the monthly per-person limit apply here too.
                  </p>
                  {threadsEnabled && !threadsTokenStatus?.hasToken ? (
                    <p className="text-[12px] text-amber-400 mt-[4px]">
                      On, but no Threads token pasted yet — nothing will post until it is.
                    </p>
                  ) : null}
                </div>
                <button
                  onClick={toggleThreads}
                  role="switch"
                  aria-checked={threadsEnabled}
                  className={`shrink-0 w-[52px] h-[28px] rounded-full p-[3px] transition-colors ${
                    threadsEnabled ? 'bg-emerald-500' : 'bg-stone-600'
                  }`}
                >
                  <span
                    className={`block w-[22px] h-[22px] rounded-full bg-white transition-transform ${
                      threadsEnabled ? 'translate-x-[24px]' : ''
                    }`}
                  />
                </button>
              </div>

              <div className="text-[12px] text-stone-500">
                last search: {listener?.threadsLastPollAt?.slice(11, 19) || '—'}
                {listener?.threadsLastError ? (
                  <span className="text-red-400"> · {listener.threadsLastError}</span>
                ) : null}
              </div>

              <label className="text-[12px] text-stone-400 space-y-[4px] block">
                Topics we watch on Threads (one search per line)
                <textarea
                  value={sf.threadsQueriesText}
                  onChange={(e) => setSolForm({ ...sf, threadsQueriesText: e.target.value })}
                  rows={4}
                  placeholder={'what are you building\ndrop your app link\nshare your startup'}
                  className="w-full bg-stone-900 border border-stone-700 rounded-[6px] px-[10px] py-[6px] text-[12px] text-stone-200"
                />
              </label>
              {solForm ? (
                <div className="flex gap-[8px]">
                  <button
                    onClick={saveSolForm}
                    className="bg-[#FEDD00] text-stone-900 font-bold text-[12px] px-[14px] py-[6px] rounded-[6px]"
                  >
                    save topics &amp; limit
                  </button>
                  <button
                    onClick={() => setSolForm(null)}
                    className="text-stone-400 text-[12px] px-[10px] py-[6px]"
                  >
                    cancel
                  </button>
                </div>
              ) : null}
            </section>

            {/* Little stat row */}
            <div className="grid grid-cols-3 gap-[8px]">
              {[
                ['Posted today', postedToday],
                ['In the queue', queue.length],
                ['Posted all-time', posted.length],
              ].map(([label, n]) => (
                <div
                  key={label}
                  className="border border-stone-800 rounded-[8px] p-[12px] text-center"
                >
                  <div className="text-[22px] font-bold text-stone-100">{n}</div>
                  <div className="text-[11px] text-stone-500">{label}</div>
                </div>
              ))}
            </div>

            {/* In the works */}
            <section className="space-y-[8px]">
              <h2 className="text-[14px] font-bold">
                In the works <span className="text-stone-500">({queue.length})</span>
              </h2>
              {queue.length === 0 ? (
                <div className="text-[12px] text-stone-500 border border-stone-800 rounded-[8px] p-[12px]">
                  Nothing building right now. New replies show up here as the bot finds posts and
                  builds apps.
                </div>
              ) : (
                <div className="space-y-[8px]">
                  {queue.map((p) => (
                    <PostCard key={p._id} p={p} />
                  ))}
                </div>
              )}
            </section>

            {/* Posted */}
            <section className="space-y-[8px]">
              <h2 className="text-[14px] font-bold">
                Posted <span className="text-stone-500">({posted.length})</span>
              </h2>
              {posted.length === 0 ? (
                <div className="text-[12px] text-stone-500 border border-stone-800 rounded-[8px] p-[12px]">
                  No replies posted yet.
                </div>
              ) : (
                <div className="space-y-[8px]">
                  {posted.slice(0, 50).map((p) => (
                    <PostCard key={p._id} p={p} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {tab === 'technical' && (
          <>
            <section className="border border-stone-700 rounded-[8px] p-[12px] space-y-[8px]">
              <h2 className="text-[14px] font-bold">Bluesky credential</h2>
              {tokenStatus ? (
                <div className="text-[12px] text-stone-400">
                  {tokenStatus.hasToken ? (
                    <>
                      <span
                        className={tokenStatus.needsReauth ? 'text-red-400' : 'text-emerald-400'}
                      >
                        {tokenStatus.needsReauth ? 'needs re-auth' : 'active'}
                      </span>
                      {tokenStatus.handle ? ` as @${tokenStatus.handle}` : ' (verifying…)'}
                      {tokenStatus.lastError ? (
                        <span className="text-red-400"> — {tokenStatus.lastError}</span>
                      ) : null}
                    </>
                  ) : (
                    'no credential pasted yet'
                  )}
                </div>
              ) : (
                <div className="text-[12px] text-stone-500">
                  waiting for the first scheduled tick…
                </div>
              )}
              <div className="flex gap-[8px]">
                <input
                  type="password"
                  value={credential}
                  onChange={(e) => setCredential(e.target.value)}
                  placeholder="identifier:app-password (e.g. vibesdiy.bsky.social:xxxx-xxxx-xxxx-xxxx)"
                  className="flex-1 bg-stone-900 border border-stone-700 rounded-[6px] px-[10px] py-[6px] text-[12px]"
                />
                <button
                  onClick={saveCredential}
                  className="bg-[#FEDD00] text-stone-900 font-bold text-[12px] px-[14px] py-[6px] rounded-[6px]"
                >
                  {justSaved === 'bsky' ? 'saved ✓' : 'save'}
                </button>
              </div>
              <p className="text-[11px] text-stone-500">
                Write-only vault: the paste never syncs back to any browser. The next tick verifies
                it and shows the handle above.
              </p>
            </section>

            <section className="border border-stone-700 rounded-[8px] p-[12px] space-y-[8px]">
              <h2 className="text-[14px] font-bold">Threads credential</h2>
              {threadsTokenStatus ? (
                <div className="text-[12px] text-stone-400">
                  {threadsTokenStatus.hasToken ? (
                    <>
                      <span
                        className={
                          threadsTokenStatus.needsReauth ? 'text-red-400' : 'text-emerald-400'
                        }
                      >
                        {threadsTokenStatus.needsReauth ? 'needs re-auth' : 'active'}
                      </span>
                      {threadsTokenStatus.handle
                        ? ` as @${threadsTokenStatus.handle}`
                        : ' (verifying…)'}
                      {threadsTokenStatus.lastError ? (
                        <span className="text-red-400"> — {threadsTokenStatus.lastError}</span>
                      ) : null}
                    </>
                  ) : (
                    'no token pasted yet'
                  )}
                </div>
              ) : (
                <div className="text-[12px] text-stone-500">
                  waiting for the first scheduled tick…
                </div>
              )}
              <div className="flex gap-[8px]">
                <input
                  type="password"
                  value={threadsCred}
                  onChange={(e) => setThreadsCred(e.target.value)}
                  placeholder="long-lived Threads Graph API token"
                  className="flex-1 bg-stone-900 border border-stone-700 rounded-[6px] px-[10px] py-[6px] text-[12px]"
                />
                <button
                  onClick={saveThreadsCred}
                  className="bg-[#FEDD00] text-stone-900 font-bold text-[12px] px-[14px] py-[6px] rounded-[6px]"
                >
                  {justSaved === 'threads' ? 'saved ✓' : 'save'}
                </button>
              </div>
              <p className="text-[11px] text-stone-500">
                Meta developer app with the <code>threads_keyword_search</code> permission
                (app-reviewed), then a long-lived user token. Same write-only vault; the next tick
                resolves the account and shows it above.
              </p>
            </section>

            <section className="border border-stone-700 rounded-[8px] p-[12px] space-y-[8px]">
              <h2 className="text-[14px] font-bold">Builder trigger (GitHub)</h2>
              <div className="text-[12px] text-stone-400">
                {listener?.lastDispatchAt ? (
                  <>
                    <span className="text-emerald-400">dispatched</span> — last{' '}
                    {listener.lastDispatchAt}
                  </>
                ) : (
                  'no builder dispatch yet'
                )}
                {listener?.lastDispatchError ? (
                  <span className="text-red-400"> — {listener.lastDispatchError}</span>
                ) : null}
              </div>
              <div className="flex gap-[8px]">
                <input
                  type="password"
                  value={githubPat}
                  onChange={(e) => setGithubPat(e.target.value)}
                  placeholder="GitHub PAT (fine-grained: VibesDIY/vibes.diy, Actions: read+write)"
                  className="flex-1 bg-stone-900 border border-stone-700 rounded-[6px] px-[10px] py-[6px] text-[12px]"
                />
                <button
                  onClick={saveGithubPat}
                  className="bg-[#FEDD00] text-stone-900 font-bold text-[12px] px-[14px] py-[6px] rounded-[6px]"
                >
                  {justSaved === 'github' ? 'saved ✓' : 'save'}
                </button>
              </div>
              <p className="text-[11px] text-stone-500">
                Lets the 1-minute tick fire the builder workflow on demand (event-driven, no polling
                cron). Same write-only vault; never syncs back. Needed only for the compute lane —
                the Bluesky credential above still handles listening and replies.
              </p>
            </section>

            <section className="border border-stone-700 rounded-[8px] p-[12px] space-y-[8px]">
              <h2 className="text-[14px] font-bold">Listener</h2>
              <div className="text-[12px] text-stone-400">
                last poll: {listener?.lastPollAt || 'never'}
                {listener?.lastError ? (
                  <span className="text-red-400"> — {listener.lastError}</span>
                ) : null}
                <span className="ml-[12px]">
                  today: {acceptedToday}/{(cfgDraft ?? configDoc)?.maxGlobalPerDay ?? 20} builds
                </span>
              </div>
              <div className="grid grid-cols-2 gap-[8px]">
                {CONFIG_FIELDS.map(([key, label]) => (
                  <label
                    key={key}
                    className="text-[11px] text-stone-400 flex items-center justify-between gap-[8px]"
                  >
                    {label}
                    <input
                      type="number"
                      value={(cfgDraft ?? configDoc ?? {})[key] ?? ''}
                      placeholder="default"
                      onChange={(e) =>
                        setCfgDraft({
                          ...(cfgDraft ?? configDoc ?? {}),
                          [key]: e.target.value === '' ? undefined : Number(e.target.value),
                        })
                      }
                      className="w-[80px] bg-stone-900 border border-stone-700 rounded-[6px] px-[8px] py-[4px] text-[12px] text-stone-200"
                    />
                  </label>
                ))}
              </div>
              {cfgDraft ? (
                <button
                  onClick={saveConfig}
                  className="bg-[#FEDD00] text-stone-900 font-bold text-[12px] px-[14px] py-[6px] rounded-[6px]"
                >
                  save guardrails
                </button>
              ) : null}
            </section>

            <section className="border border-stone-700 rounded-[8px] p-[12px] space-y-[8px]">
              <h2 className="text-[14px] font-bold">
                Requests ({mentions.length + solicitations.length})
              </h2>
              {mentions.length + solicitations.length === 0 ? (
                <div className="text-[12px] text-stone-500">none yet</div>
              ) : null}
              <div className="space-y-[8px]">
                {posts.slice(0, 60).map((m) => (
                  <div
                    key={m._id}
                    className="border border-stone-800 rounded-[6px] p-[8px] text-[12px]"
                  >
                    <div className="flex items-center gap-[8px] flex-wrap">
                      <StatusChip status={m.status} />
                      <span className="text-stone-500">
                        {m.kind === 'solicitation' ? '🔎' : '💬'}
                      </span>
                      <span className="text-stone-400">@{m.authorHandle}</span>
                      <span className="text-stone-600">
                        {(m.createdAt || '').slice(0, 16).replace('T', ' ')}
                      </span>
                      {m.reason ? <span className="text-stone-500">({m.reason})</span> : null}
                    </div>
                    <div className="text-stone-300 mt-[4px] break-words">{m.prompt || m.text}</div>
                    <div className="mt-[4px] flex gap-[12px] flex-wrap text-[11px]">
                      {m.vibeUrl ? (
                        <a
                          href={m.vibeUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sky-400 underline"
                        >
                          vibe
                        </a>
                      ) : null}
                      {m.replyPermalink ? (
                        <a
                          href={m.replyPermalink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sky-400 underline"
                        >
                          reply
                        </a>
                      ) : null}
                      {m.error ? <span className="text-red-400">{m.error}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="border border-stone-700 rounded-[8px] p-[12px]">
              <h2 className="text-[14px] font-bold mb-[8px]">Recent activity</h2>
              <div className="space-y-[2px] text-[11px] text-stone-400">
                {oplog.map((e) => (
                  <div key={e._id}>
                    <span className="text-stone-600">{(e.at || '').slice(11, 19)}</span> {e.op}
                    {e.prompt ? ` — ${String(e.prompt).slice(0, 60)}` : ''}
                    {e.error ? (
                      <span className="text-red-400"> {String(e.error).slice(0, 80)}</span>
                    ) : (
                      ''
                    )}
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
