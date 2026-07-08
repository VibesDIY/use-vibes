import React, { useState } from "react";
import { useFireproof } from "use-fireproof";
import { useVibe } from "use-vibes";

// meta-hub: the Vibes DIY social-publishing console. Owner-only end to end —
// tokens live in the vault db, the scheduled backend rotates them and runs
// publish requests, and this dashboard is the paste-a-token / request-a-post
// surface plus live status.

const PLATFORMS = ["ig", "threads", "fbpage", "linkedin", "bsky"];
// Platforms that publish without images: Threads does text-only posts;
// LinkedIn and Bluesky v1 are text + link-card ONLY (neither API takes image
// URLs — images would need their upload APIs, which aren't wired yet).
const TEXT_ONLY_OK = ["threads", "linkedin", "bsky"];
// Platforms whose posts carry a client-supplied link card (nothing scraped),
// so the publish form offers a card title field.
const CARD_TITLE = ["linkedin", "bsky"];

function daysUntil(iso) {
  return iso ? Math.floor((new Date(iso).getTime() - Date.now()) / 86400000) : null;
}

function StatusChip({ status }) {
  const tone =
    status === "done"
      ? "bg-emerald-900/60 text-emerald-300 border-emerald-700"
      : status === "error"
        ? "bg-red-900/60 text-red-300 border-red-700"
        : "bg-yellow-900/50 text-yellow-300 border-yellow-700";
  return <span className={`text-[11px] px-[8px] py-[2px] rounded-full border ${tone}`}>{status}</span>;
}

export default function App() {
  const { database: vaultDb } = useFireproof("vault");
  const { useLiveQuery: reqQ, database: reqDb } = useFireproof("requests");
  const { useLiveQuery: logQ } = useFireproof("oplog");
  const { can, me, ready } = useVibe("vault");

  // The raw token docs never sync here (write-only vault). The dashboard reads
  // the redacted `token-status` projection the scheduled backend mirrors.
  const tokens = logQ("kind", { key: "token-status" }).docs;
  const requests = reqQ("kind", { key: "publish-request" }).docs.sort(
    (a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""),
  );
  const oplog = logQ("kind", { key: "oplog" }).docs.sort((a, b) => (b.at || "").localeCompare(a.at || ""));
  const probe = oplog.find((d) => d._id === "egress-probe");
  // LinkedIn rides the egress platform allowlist (its API sends no CORS
  // headers), so it has its own lane probe — this one flips to `live` only
  // once the allowlist is deployed in the api worker.
  const probeLi = oplog.find((d) => d._id === "egress-probe-linkedin");

  const [platform, setPlatform] = useState("ig");
  const [justSaved, setJustSaved] = useState(null);
  const [tokenValue, setTokenValue] = useState("");
  const [slug, setSlug] = useState("");
  const [pubPlatform, setPubPlatform] = useState("ig");
  const [caption, setCaption] = useState("");
  const [images, setImages] = useState("");
  const [title, setTitle] = useState("");

  if (!ready) return <div className="min-h-screen bg-[#141a1e]" />;
  const gate = can.create({ kind: "token", platform: "ig" });
  if (!gate.ok) {
    return (
      <div className="min-h-screen bg-[#141a1e] text-stone-200 font-mono flex items-center justify-center p-[24px] text-center">
        <div>
          <div className="text-[20px] font-bold text-[#FEDD00] mb-[8px]">meta·hub</div>
          <p className="text-[13px] text-stone-400 max-w-[420px]">
            The Vibes DIY social-publishing console. Its contents are visible to the owner only.
          </p>
        </div>
      </div>
    );
  }

  const saveToken = async () => {
    if (!tokenValue.trim()) return;
    const now = new Date();
    await vaultDb.put({
      _id: `token-${platform}`,
      kind: "token",
      platform,
      token: tokenValue.trim(),
      pastedAt: now.toISOString(),
      refreshedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 60 * 86400000).toISOString(),
      igUserId: null,
      username: null,
    });
    setTokenValue("");
    setJustSaved(platform);
  };

  const requestPublish = async () => {
    const imgs = images
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!slug.trim()) return;
    if (imgs.length === 0 && !TEXT_ONLY_OK.includes(pubPlatform)) return;
    if (CARD_TITLE.includes(pubPlatform) && imgs.length > 0) return; // text + link-card only for now
    await reqDb.put({
      kind: "publish-request",
      platform: pubPlatform,
      slug: slug.trim(),
      caption,
      images: imgs,
      ...(title.trim() ? { title: title.trim() } : {}),
      status: "pending",
      attempts: 0,
      createdAt: new Date().toISOString(),
    });
    setSlug("");
    setCaption("");
    setImages("");
    setTitle("");
  };

  return (
    <div className="min-h-screen bg-[#141a1e] text-stone-200 font-mono p-[20px]">
      <div className="max-w-[760px] mx-auto">
        <header className="mb-[20px]">
          <h1 className="text-[22px] font-bold text-[#FEDD00]">meta·hub</h1>
          <p className="text-[12px] text-stone-400">
            Token vault · rotation · IG/Threads/FB/LinkedIn/Bluesky publishing — only you can see this.
          </p>
          <p className="text-[11px] mt-[6px] text-stone-500">
            egress:{" "}
            <span className={probe?.status === "live" ? "text-emerald-400" : "text-red-400"}>
              {probe ? `${probe.status} — ${probe.detail}` : "no probe yet (first tick pending)"}
            </span>
          </p>
          <p className="text-[11px] text-stone-500">
            linkedin lane:{" "}
            <span className={probeLi?.status === "live" ? "text-emerald-400" : "text-red-400"}>
              {probeLi ? `${probeLi.status} — ${probeLi.detail}` : "no probe yet (first tick pending)"}
            </span>
          </p>
        </header>

        <section className="mb-[24px] bg-[#1b2329] border border-stone-700 rounded-xl p-[16px]">
          <h2 className="text-[14px] font-bold mb-[10px] text-stone-100">Tokens</h2>
          {tokens.length === 0 && <p className="text-[12px] text-stone-500 mb-[10px]">Vault is empty — paste a token below.</p>}
          {justSaved && (
            <p className="text-[12px] text-emerald-400 mb-[10px]">
              Saved {justSaved} token — the server verifies it on the next tick (~1 min).
            </p>
          )}
          {tokens.map((t) => {
            const d = daysUntil(t.expiresAt);
            return (
              <div key={t._id} className="mb-[10px] text-[12px] border border-stone-700/60 rounded-lg p-[10px]">
                <div className="flex items-center gap-[8px]">
                  <span className="font-bold text-[#FEDD00]">{t.platform}</span>
                  <span className="text-stone-300">{t.username ? `@${t.username}` : "verifying…"}</span>
                  {t.needsReauth && <span className="text-red-400 font-bold">NEEDS RE-AUTH</span>}
                </div>
                <div className="text-stone-400 mt-[4px]">
                  expires in <span className={d !== null && d < 14 ? "text-red-400" : "text-emerald-400"}>{d ?? "?"}d</span>
                  {" · "}last rotated {t.refreshedAt ? t.refreshedAt.slice(0, 10) : "never"}
                  {t.lastError && <span className="text-red-400"> · {t.lastError}</span>}
                </div>
              </div>
            );
          })}
          <div className="flex gap-[8px] mt-[8px]">
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="bg-[#141a1e] border border-stone-600 rounded-lg px-[8px] py-[6px] text-[12px]"
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <input
              type="password"
              value={tokenValue}
              onChange={(e) => setTokenValue(e.target.value)}
              placeholder={platform === "bsky" ? "paste identifier:app-password" : "paste long-lived token"}
              className="flex-1 bg-[#141a1e] border border-stone-600 rounded-lg px-[10px] py-[6px] text-[12px]"
            />
            <button
              onClick={saveToken}
              className="bg-[#FEDD00] text-[#141a1e] font-bold rounded-lg px-[14px] py-[6px] text-[12px]"
            >
              Save
            </button>
          </div>
        </section>

        <section className="mb-[24px] bg-[#1b2329] border border-stone-700 rounded-xl p-[16px]">
          <h2 className="text-[14px] font-bold mb-[10px] text-stone-100">Publish a post</h2>
          <select
            value={pubPlatform}
            onChange={(e) => setPubPlatform(e.target.value)}
            className="bg-[#141a1e] border border-stone-600 rounded-lg px-[8px] py-[6px] text-[12px] mb-[8px]"
          >
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="post slug (for the log)"
            className="w-full bg-[#141a1e] border border-stone-600 rounded-lg px-[10px] py-[6px] text-[12px] mb-[8px]"
          />
          <textarea
            value={images}
            onChange={(e) => setImages(e.target.value)}
            placeholder="image URLs, one per line (public JPEG, 4:5) — leave empty for Threads text / LinkedIn / bsky (no images there yet)"
            rows={3}
            className="w-full bg-[#141a1e] border border-stone-600 rounded-lg px-[10px] py-[6px] text-[12px] mb-[8px]"
          />
          {CARD_TITLE.includes(pubPlatform) && (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="link card title (nothing is scraped from the URL; falls back to slug)"
              className="w-full bg-[#141a1e] border border-stone-600 rounded-lg px-[10px] py-[6px] text-[12px] mb-[8px]"
            />
          )}
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="caption"
            rows={4}
            className="w-full bg-[#141a1e] border border-stone-600 rounded-lg px-[10px] py-[6px] text-[12px] mb-[8px]"
          />
          <button
            onClick={requestPublish}
            className="bg-[#FEDD00] text-[#141a1e] font-bold rounded-lg px-[14px] py-[8px] text-[12px]"
          >
            Queue publish
          </button>
          <p className="text-[11px] text-stone-500 mt-[6px]">
            The server picks this up within a minute and walks it through container → publish.
          </p>
        </section>

        <section className="mb-[24px] bg-[#1b2329] border border-stone-700 rounded-xl p-[16px]">
          <h2 className="text-[14px] font-bold mb-[10px] text-stone-100">Requests</h2>
          {requests.length === 0 && <p className="text-[12px] text-stone-500">None yet.</p>}
          {requests.map((r) => (
            <div key={r._id} className="text-[12px] border-b border-stone-800 py-[8px] last:border-0">
              <div className="flex items-center gap-[8px]">
                <span className="font-bold">{r.slug}</span>
                <StatusChip status={r.status} />
                <span className="text-stone-500">{(r.createdAt || "").slice(0, 16).replace("T", " ")}</span>
              </div>
              {r.permalink && (
                <a href={r.permalink} target="_blank" rel="noreferrer" className="text-[#FEDD00] underline">
                  {r.permalink}
                </a>
              )}
              {r.error && <div className="text-red-400 mt-[2px]">{r.error}</div>}
              {r.heldReason && !r.error && (
                <div className="text-yellow-400 mt-[2px]">held: {r.heldReason}</div>
              )}
            </div>
          ))}
        </section>

        <section className="bg-[#1b2329] border border-stone-700 rounded-xl p-[16px]">
          <h2 className="text-[14px] font-bold mb-[10px] text-stone-100">Log</h2>
          {oplog
            .filter((d) => !(d._id || "").startsWith("egress-probe"))
            .slice(0, 20)
            .map((d) => (
              <div key={d._id} className="text-[11px] text-stone-400 py-[2px]">
                {(d.at || "").slice(5, 16).replace("T", " ")} · {d.op}
                {d.platform ? ` · ${d.platform}` : ""}
                {d.slug ? ` · ${d.slug}` : ""}
                {d.error ? ` · ${d.error}` : ""}
                {d.permalink ? ` · ${d.permalink}` : ""}
              </div>
            ))}
        </section>
      </div>
    </div>
  );
}
