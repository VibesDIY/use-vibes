import React, { useState } from "react";
import { useFireproof } from "use-fireproof";
import { useVibe } from "use-vibes";

// mention-hub: the Bluesky mention-builds console (#3323). Owner-only end to
// end — the app-password lives in the write-only vault db, the scheduled
// backend listens for mentions and replies to verified-live builds, the CI
// builder lane turns accepted mentions into published vibes. This dashboard
// is the paste-a-credential surface plus the live mention ledger and the
// guardrail-config form.

const STATUS_TONE = {
  replied: "bg-emerald-900/60 text-emerald-300 border-emerald-700",
  built: "bg-sky-900/60 text-sky-300 border-sky-700",
  building: "bg-indigo-900/60 text-indigo-300 border-indigo-700",
  "pending-build": "bg-yellow-900/50 text-yellow-300 border-yellow-700",
  skipped: "bg-stone-800 text-stone-400 border-stone-600",
  "build-failed": "bg-red-900/60 text-red-300 border-red-700",
  error: "bg-red-900/60 text-red-300 border-red-700",
};

function StatusChip({ status }) {
  return (
    <span className={`text-[11px] px-[8px] py-[2px] rounded-full border ${STATUS_TONE[status] || STATUS_TONE.skipped}`}>{status}</span>
  );
}

const CONFIG_FIELDS = [
  ["maxPerAuthorPerDay", "per-author builds / day"],
  ["maxGlobalPerDay", "global builds / day (spend ceiling)"],
  ["maxNewPerTick", "new builds / tick"],
  ["maxRepliesPerTick", "replies / tick"],
  ["minPromptChars", "min prompt chars"],
  ["dedupeWindowDays", "dedupe window (days)"],
];

export default function App() {
  const { database: vaultDb } = useFireproof("vault");
  const { useLiveQuery: reqQ } = useFireproof("requests");
  const { useLiveQuery: logQ, database: logDb } = useFireproof("oplog");
  const { can, ready } = useVibe("vault");

  // The raw credential never syncs here (write-only vault); the dashboard
  // reads the redacted `token-status` projection the backend mirrors.
  const tokenStatus = logQ("kind", { key: "token-status" }).docs[0];
  const listener = logQ("kind", { key: "listener-state" }).docs[0];
  const configDoc = logQ("kind", { key: "config" }).docs[0];
  const mentions = reqQ("kind", { key: "mention" }).docs.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  const oplog = logQ("kind", { key: "oplog" })
    .docs.sort((a, b) => (b.at || "").localeCompare(a.at || ""))
    .slice(0, 20);

  const [credential, setCredential] = useState("");
  const [justSaved, setJustSaved] = useState(null);
  const [cfgDraft, setCfgDraft] = useState(null);

  if (!ready) return <div className="min-h-screen bg-[#141a1e]" />;
  const gate = can.create({ kind: "token", platform: "bsky" });
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
      _id: "token-bsky",
      kind: "token",
      platform: "bsky",
      token: credential.trim(),
      pastedAt: new Date().toISOString(),
      did: null,
      handle: null,
      needsReauth: false,
      lastError: null,
    });
    setCredential("");
    setJustSaved("bsky");
    setTimeout(() => setJustSaved(null), 2500);
  };

  const saveConfig = async () => {
    await logDb.put({ ...(configDoc || {}), _id: "config", kind: "config", ...cfgDraft, updatedAt: new Date().toISOString() });
    setCfgDraft(null);
  };

  const today = new Date().toISOString().slice(0, 10);
  const acceptedToday = mentions.filter((m) => m.day === today && m.status !== "skipped").length;

  return (
    <div className="min-h-screen bg-[#141a1e] text-stone-200 font-mono p-[16px]">
      <div className="max-w-[880px] mx-auto space-y-[16px]">
        <header className="flex items-baseline gap-[12px]">
          <h1 className="text-[22px] font-bold text-[#FEDD00]">mention·hub</h1>
          <span className="text-[12px] text-stone-500">@-mention → built vibe → in-thread reply (issue #3323)</span>
        </header>

        <section className="border border-stone-700 rounded-[8px] p-[12px] space-y-[8px]">
          <h2 className="text-[14px] font-bold">Bluesky credential</h2>
          {tokenStatus ? (
            <div className="text-[12px] text-stone-400">
              {tokenStatus.hasToken ? (
                <>
                  <span className={tokenStatus.needsReauth ? "text-red-400" : "text-emerald-400"}>
                    {tokenStatus.needsReauth ? "needs re-auth" : "active"}
                  </span>
                  {tokenStatus.handle ? ` as @${tokenStatus.handle}` : " (verifying…)"}
                  {tokenStatus.lastError ? <span className="text-red-400"> — {tokenStatus.lastError}</span> : null}
                </>
              ) : (
                "no credential pasted yet"
              )}
            </div>
          ) : (
            <div className="text-[12px] text-stone-500">waiting for the first scheduled tick…</div>
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
              {justSaved ? "saved ✓" : "save"}
            </button>
          </div>
          <p className="text-[11px] text-stone-500">
            Write-only vault: the paste never syncs back to any browser. The next tick verifies it and shows the handle above.
          </p>
        </section>

        <section className="border border-stone-700 rounded-[8px] p-[12px] space-y-[8px]">
          <h2 className="text-[14px] font-bold">Listener</h2>
          <div className="text-[12px] text-stone-400">
            last poll: {listener?.lastPollAt || "never"}
            {listener?.lastError ? <span className="text-red-400"> — {listener.lastError}</span> : null}
            <span className="ml-[12px]">
              today: {acceptedToday}/{(cfgDraft ?? configDoc)?.maxGlobalPerDay ?? 20} builds
            </span>
          </div>
          <div className="grid grid-cols-2 gap-[8px]">
            {CONFIG_FIELDS.map(([key, label]) => (
              <label key={key} className="text-[11px] text-stone-400 flex items-center justify-between gap-[8px]">
                {label}
                <input
                  type="number"
                  value={(cfgDraft ?? configDoc ?? {})[key] ?? ""}
                  placeholder="default"
                  onChange={(e) =>
                    setCfgDraft({ ...(cfgDraft ?? configDoc ?? {}), [key]: e.target.value === "" ? undefined : Number(e.target.value) })
                  }
                  className="w-[80px] bg-stone-900 border border-stone-700 rounded-[6px] px-[8px] py-[4px] text-[12px] text-stone-200"
                />
              </label>
            ))}
          </div>
          {cfgDraft ? (
            <button onClick={saveConfig} className="bg-[#FEDD00] text-stone-900 font-bold text-[12px] px-[14px] py-[6px] rounded-[6px]">
              save guardrails
            </button>
          ) : null}
        </section>

        <section className="border border-stone-700 rounded-[8px] p-[12px] space-y-[8px]">
          <h2 className="text-[14px] font-bold">Mentions ({mentions.length})</h2>
          {mentions.length === 0 ? <div className="text-[12px] text-stone-500">none yet</div> : null}
          <div className="space-y-[8px]">
            {mentions.slice(0, 50).map((m) => (
              <div key={m._id} className="border border-stone-800 rounded-[6px] p-[8px] text-[12px]">
                <div className="flex items-center gap-[8px] flex-wrap">
                  <StatusChip status={m.status} />
                  <span className="text-stone-400">@{m.authorHandle}</span>
                  <span className="text-stone-600">{(m.createdAt || "").slice(0, 16).replace("T", " ")}</span>
                  {m.reason ? <span className="text-stone-500">({m.reason})</span> : null}
                </div>
                <div className="text-stone-300 mt-[4px] break-words">{m.prompt || m.text}</div>
                <div className="mt-[4px] flex gap-[12px] flex-wrap text-[11px]">
                  {m.vibeUrl ? (
                    <a href={m.vibeUrl} target="_blank" rel="noreferrer" className="text-sky-400 underline">
                      vibe
                    </a>
                  ) : null}
                  {m.replyPermalink ? (
                    <a href={m.replyPermalink} target="_blank" rel="noreferrer" className="text-sky-400 underline">
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
                <span className="text-stone-600">{(e.at || "").slice(11, 19)}</span> {e.op}
                {e.prompt ? ` — ${String(e.prompt).slice(0, 60)}` : ""}
                {e.error ? <span className="text-red-400"> {String(e.error).slice(0, 80)}</span> : ""}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
