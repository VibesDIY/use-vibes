import React, { useState } from "react";
import { useFireproof } from "use-fireproof";
import { useViewer, useVibe } from "use-vibes";

// ── Kanban Board ──────────────────────────────────────────────────────────────
// The classic three-column board (TO DO / IN PROGRESS / DONE), modernized from
// the original jchris/kanban-board while keeping its neo-brutalist look and its
// existing data (same db name, same doc shape — old boards keep working):
//
// - Write surfaces are gated on a `useVibe(DB).can` verdict AND a signed-in
//   viewer — on a plain-ACL db the verdict alone is optimistic for anonymous
//   visitors, whose writes never sync. Read-only visitors see the board plus a
//   reason instead of dead buttons and failed writes.
// - Cards are draggable between AND within columns. Ordering uses a fractional
//   float `position` (drop-between averages the neighbours) so a reorder writes
//   ONLY the moved card. Legacy cards without `position` order by createdAt via
//   the same effective-position scale.
// - Writes go through `database.put` with fields stamped at write time
//   (createdAt, authorHandle) — not merge-then-submit, which can race.

const DB = "kanban-board-db"; // unchanged — existing boards keep their tasks

const COLUMNS = [
  { id: "todo", label: "TO DO", color: "bg-[#d94f3d]", textColor: "text-white" },
  { id: "inprogress", label: "IN PROGRESS", color: "bg-[#c9a227]", textColor: "text-[#0f172a]" },
  { id: "done", label: "DONE", color: "bg-[#4a9e6b]", textColor: "text-[#0f172a]" },
];

const PRIORITIES = ["LOW", "MED", "HIGH"];

const PriorityColors = {
  LOW: "bg-[#3b6fd4] text-white",
  MED: "bg-[#c9a227] text-[#0f172a]",
  HIGH: "bg-[#d94f3d] text-white",
};

const STEP = 1000;

// Effective position: explicit float wins; legacy cards (no `position`) fall back
// to their createdAt on the same ascending scale, so mixed boards sort sanely.
function effPos(t) {
  return typeof t.position === "number" ? t.position : (t.createdAt || 0) / 1000;
}

function positionForAppend(sorted) {
  return sorted.length ? effPos(sorted[sorted.length - 1]) + STEP : STEP;
}

function positionForDropBefore(sorted, targetIndex) {
  const before = sorted[targetIndex - 1];
  const after = sorted[targetIndex];
  if (!after) return positionForAppend(sorted);
  if (!before) return effPos(after) - STEP; // top
  return (effPos(before) + effPos(after)) / 2; // between → average
}

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
    </svg>
  );
}

function ArrowIcon({ dir }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      {dir === "left"
        ? <><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 5 5 12 12 19" /></>
        : <><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></>}
    </svg>
  );
}

export default function App() {
  const { useLiveQuery, useDocument, database } = useFireproof(DB);
  const { viewer, ViewerTag } = useViewer();
  const { can, ready, me } = useVibe(DB);

  const [composerCol, setComposerCol] = useState(null); // colId | null
  const [expandedId, setExpandedId] = useState(null);
  const [dragId, setDragId] = useState(null);

  const { doc, merge } = useDocument({ title: "", description: "", priority: "MED" });

  const { docs: tasks } = useLiveQuery("type", { key: "task" });

  const createVerdict = ready ? can.create({ type: "task" }) : null;
  // Verdict AND a signed-in viewer: on a plain-ACL db the verdict is optimistic
  // for anonymous visitors, whose writes only land locally and never sync — the
  // spectator trap. Verified live: an anonymous put shows in-tab but the server
  // never sees it. Anonymous = read-only, with the notice below saying why.
  const canWrite = !!viewer && !!createVerdict?.ok;

  const colTasks = (colId) => tasks.filter((t) => t.status === colId).sort((a, b) => effPos(a) - effPos(b));

  async function handleSubmit(e) {
    e.preventDefault();
    const title = doc.title.trim();
    if (!title || !composerCol) return;
    const col = composerCol;
    merge({ title: "", description: "", priority: "MED" }); // clear input immediately
    setComposerCol(null);
    await database.put({
      type: "task",
      title,
      description: doc.description.trim(),
      priority: doc.priority,
      status: col,
      position: positionForAppend(colTasks(col)),
      createdAt: Date.now(),
      authorHandle: me?.userHandle || viewer?.userHandle,
    });
  }

  // Move a card to a column (arrows or drop-on-column) — appends to the bottom.
  // Same-column drops append too (drag to the blank area = send to bottom);
  // only skip the write when the card is already last (Codex #3067).
  function moveToColumn(task, colId) {
    const dest = colTasks(colId).filter((t) => t._id !== task._id);
    const alreadyLast = task.status === colId && (!dest.length || effPos(dest[dest.length - 1]) < effPos(task));
    if (alreadyLast) return;
    database.put({ ...task, status: colId, position: positionForAppend(dest) });
  }

  function moveByArrow(task, dir) {
    const idx = COLUMNS.findIndex((c) => c.id === task.status);
    const next = COLUMNS[idx + dir];
    if (next) moveToColumn(task, next.id);
  }

  // Drop ON a card: insert the dragged card just above it (same or other column).
  // The moved id comes from the DataTransfer payload, not React state — the
  // handler closure can predate the dragstart's setState, so state would race.
  function dropBeforeCard(target, movedId) {
    const moved = tasks.find((t) => t._id === movedId);
    if (!moved || moved._id === target._id) return;
    const dest = colTasks(target.status).filter((t) => t._id !== moved._id);
    const idx = dest.findIndex((t) => t._id === target._id);
    database.put({ ...moved, status: target.status, position: positionForDropBefore(dest, idx) });
  }

  function deleteTask(task) {
    database.del(task._id);
  }

  const c = {
    bg: "bg-[#f5f3ee]",
    card: "bg-white",
    border: "border-[#0f172a]",
    ink: "text-[#0f172a]",
    muted: "text-[#6b7280]",
    shadow: "shadow-[4px_4px_0px_#0f172a]",
    shadowSm: "shadow-[3px_3px_0px_#0f172a]",
    btn: "bg-[#d94f3d] text-white border-[#0f172a] border-[3px] shadow-[4px_4px_0px_#0f172a] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0px_#0f172a] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all duration-150",
    btnYellow: "bg-[#e8c52a] text-[#0f172a] border-[#0f172a] border-[3px] shadow-[3px_3px_0px_#0f172a] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[5px_5px_0px_#0f172a] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all duration-150",
    btnGhost: "bg-white text-[#0f172a] border-[#0f172a] border-[3px] hover:shadow-[3px_3px_0px_#0f172a] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all duration-150",
    input: "bg-white border-[3px] border-[#0f172a] rounded-[4px] px-3 py-2 text-[#0f172a] text-sm font-medium w-full focus:outline-none focus:translate-x-[-2px] focus:translate-y-[-2px] focus:shadow-[4px_4px_0px_#0f172a] transition-all duration-150",
  };

  return (
    <div className={`min-h-screen ${c.bg} font-['Space_Grotesk',sans-serif]`}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=optional');
        @keyframes drift-bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-18px)} }
        @keyframes drift-spin { from{transform:rotate(45deg)} to{transform:rotate(405deg)} }
      `}</style>

      {/* Ambient bg */}
      <div className="fixed inset-0 pointer-events-none" style={{ backgroundImage: "linear-gradient(rgba(15,23,42,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(15,23,42,0.04) 1px,transparent 1px)", backgroundSize: "60px 60px" }} />
      <div className="fixed top-10 left-4 w-12 h-12 rounded-full opacity-20 bg-[#d94f3d] pointer-events-none" style={{ animation: "drift-bounce 7s ease-in-out infinite" }} />
      <div className="fixed bottom-20 right-8 w-8 h-8 opacity-20 bg-[#e8c52a] pointer-events-none" style={{ transform: "rotate(45deg)", animation: "drift-spin 10s linear infinite" }} />
      <div className="fixed top-1/2 right-4 w-6 h-6 rounded-full opacity-15 bg-[#4a9e6b] pointer-events-none" />

      {/* Nav */}
      <nav id="app-header" className={`max-w-[1200px] mx-4 xl:mx-auto mt-6 px-5 py-3 ${c.card} border-[3px] ${c.border} ${c.shadow} rounded-[4px] flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <div className="w-3 h-3 bg-[#d94f3d] border-[2px] border-[#0f172a] rounded-[2px]" />
            <div className="w-3 h-3 bg-[#e8c52a] border-[2px] border-[#0f172a] rounded-[2px]" />
            <div className="w-3 h-3 bg-[#4a9e6b] border-[2px] border-[#0f172a] rounded-[2px]" />
          </div>
          <span className={`font-bold uppercase tracking-tight text-sm ${c.ink}`}>Kanban Board</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs uppercase tracking-widest ${c.muted} font-['JetBrains_Mono',monospace]`}>{tasks.length} TASKS</span>
          {viewer && <img src={viewer.avatarUrl} alt={viewer.userHandle} className="w-8 h-8 border-[2px] border-[#0f172a] rounded-[4px]" />}
        </div>
      </nav>

      {/* Read-only notice: the verdict's reason, not a dead form */}
      {ready && !canWrite && (
        <div className={`max-w-[1200px] mx-4 xl:mx-auto mt-4 px-4 py-2 ${c.card} border-[3px] ${c.border} rounded-[4px]`}>
          <p className={`text-xs uppercase tracking-widest font-bold ${c.muted}`}>
            {viewer ? createVerdict?.reason || "Read-only — ask the owner for edit access." : "Viewing the board — log in to add and move tasks."}
          </p>
        </div>
      )}

      {/* Board */}
      <main id="app" className="max-w-[1200px] mx-auto px-4 py-6 relative z-10 grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
        {COLUMNS.map((col, colIdx) => {
          const list = colTasks(col.id);
          return (
            <section
              key={col.id}
              id={`col-${col.id}`}
              className={`${c.card} border-[3px] ${c.border} ${c.shadow} rounded-[4px] overflow-hidden`}
              onDragOver={(e) => canWrite && e.preventDefault()}
              onDrop={(e) => {
                if (!canWrite) return;
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain") || dragId;
                const moved = tasks.find((t) => t._id === id);
                if (moved) moveToColumn(moved, col.id);
                setDragId(null);
              }}
            >
              <header className={`${col.color} px-3 py-2 flex items-center justify-between`}>
                <h2 className={`text-xs uppercase tracking-widest font-bold ${col.textColor}`}>{col.label}</h2>
                <span className={`text-xs font-['JetBrains_Mono',monospace] ${col.textColor} px-1.5 py-0.5 border-[2px] ${c.border} rounded-[3px] bg-white/30`}>{list.length}</span>
              </header>
              <div className="p-3 space-y-3 min-h-[120px]">
                {canWrite && (composerCol === col.id ? (
                  <form onSubmit={handleSubmit} className={`border-[3px] ${c.border} rounded-[4px] p-3 space-y-2`}>
                    <input className={c.input} value={doc.title} onChange={(e) => merge({ title: e.target.value })} placeholder="Task title..." autoFocus />
                    <textarea className={`${c.input} resize-none h-16`} value={doc.description} onChange={(e) => merge({ description: e.target.value })} placeholder="Optional details..." />
                    <div className="flex gap-2">
                      {PRIORITIES.map((p) => (
                        <button type="button" key={p}
                          onClick={() => merge({ priority: p })}
                          className={`px-3 py-1.5 border-[3px] ${c.border} rounded-[4px] text-xs font-bold uppercase tracking-wide transition-all duration-150
                            ${doc.priority === p ? `${PriorityColors[p]} shadow-[3px_3px_0px_#0f172a]` : `${c.card} ${c.ink}`}`}
                        >{p}</button>
                      ))}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button type="submit" className={`${c.btn} px-4 py-2 rounded-[4px] font-bold uppercase text-xs tracking-wide`}>Save</button>
                      <button type="button" onClick={() => setComposerCol(null)} className={`${c.btnGhost} px-4 py-2 rounded-[4px] font-bold uppercase text-xs tracking-wide`}>Cancel</button>
                    </div>
                  </form>
                ) : (
                  <button
                    onClick={() => setComposerCol(col.id)}
                    className={`${c.btnGhost} w-full flex items-center justify-center gap-2 px-3 py-2 rounded-[4px] font-bold uppercase text-xs tracking-wide min-h-[44px]`}
                  >
                    <PlusIcon /> ADD
                  </button>
                ))}
                {list.length === 0 && !canWrite && (
                  <p className={`text-xs uppercase tracking-widest ${c.muted} font-bold text-center py-6`}>No tasks</p>
                )}
                {list.map((task) => {
                  const expanded = expandedId === task._id;
                  return (
                    <div
                      key={task._id}
                      draggable={canWrite}
                      onDragStart={(e) => {
                        setDragId(task._id);
                        e.dataTransfer.setData("text/plain", task._id);
                      }}
                      onDragEnd={() => setDragId(null)}
                      onDragOver={(e) => {
                        if (!canWrite) return;
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onDrop={(e) => {
                        if (!canWrite) return;
                        e.preventDefault();
                        e.stopPropagation();
                        dropBeforeCard(task, e.dataTransfer.getData("text/plain") || dragId);
                        setDragId(null);
                      }}
                      onClick={() => setExpandedId(expanded ? null : task._id)}
                      className={`${c.card} border-[3px] ${c.border} rounded-[4px] ${c.shadowSm} hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[5px_5px_0px_#0f172a] transition-all duration-150 cursor-pointer ${canWrite ? "cursor-grab active:cursor-grabbing" : ""} ${dragId === task._id ? "opacity-50" : ""}`}
                    >
                      <div className="px-3 py-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className={`font-bold text-sm uppercase tracking-tight ${c.ink} leading-snug`}>{task.title}</p>
                            {expanded && task.description && (
                              <p className={`mt-1 text-xs ${c.muted} leading-relaxed`}>{task.description}</p>
                            )}
                            {expanded && (
                              <div className={`mt-1 text-[0.6rem] ${c.muted} font-['JetBrains_Mono',monospace] flex items-center gap-1`}>
                                {task.authorHandle && <ViewerTag userHandle={task.authorHandle} />}
                                <span>{new Date(task.createdAt).toLocaleDateString()}</span>
                              </div>
                            )}
                          </div>
                          <span className={`shrink-0 text-[0.6rem] px-2 py-0.5 border-[2px] ${c.border} rounded-[3px] font-bold uppercase tracking-wide ${PriorityColors[task.priority] || "bg-gray-100"}`}>
                            {task.priority || "MED"}
                          </span>
                        </div>
                        {canWrite && (
                          <div className="flex items-center gap-2 mt-2.5" onClick={(e) => e.stopPropagation()}>
                            {colIdx > 0 && (
                              <button onClick={() => moveByArrow(task, -1)} aria-label="Move left"
                                className={`flex items-center gap-1 px-2 py-1 border-[2px] ${c.border} rounded-[4px] text-[0.6rem] uppercase font-bold tracking-wide ${c.card} ${c.ink} hover:shadow-[2px_2px_0px_#0f172a] active:translate-x-[1px] active:translate-y-[1px] transition-all duration-150`}>
                                <ArrowIcon dir="left" />
                              </button>
                            )}
                            {colIdx < COLUMNS.length - 1 && (
                              <button onClick={() => moveByArrow(task, 1)} aria-label="Move right"
                                className={`flex items-center gap-1 px-2 py-1 border-[2px] ${c.border} rounded-[4px] text-[0.6rem] uppercase font-bold tracking-wide ${c.btnYellow} hover:shadow-[3px_3px_0px_#0f172a] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all duration-150`}>
                                <ArrowIcon dir="right" />
                              </button>
                            )}
                            <button onClick={() => deleteTask(task)} aria-label="Delete task"
                              className={`ml-auto flex items-center gap-1 px-2 py-1 border-[2px] border-[#d94f3d] text-[#d94f3d] rounded-[4px] text-[0.6rem] uppercase font-bold tracking-wide bg-white hover:bg-[#d94f3d] hover:text-white transition-all duration-150`}>
                              <TrashIcon />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </main>
    </div>
  );
}
