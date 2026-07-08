import React, { useState, useRef, useMemo, useEffect } from "react";
import { useFireproof } from "use-fireproof";
import { useViewer, useVibe } from "use-vibes";

// ── Kanban Live (jchris/kanban-live) ─────────────────────────────────────────
// The hybrid: og/paris-yemaya-2877's pointer-drag feel (pointer capture, rAF
// overlay, tap-vs-drag threshold, live-query freeze while dragging) on
// jchris/kanban-board's data model (priority + fractional float `position`,
// so a drag also REORDERS within a column and writes only the moved doc).
//
// Mobile is first-class: columns are a horizontal snap-scroll strip (85vw per
// column), and while dragging, holding the card near the screen edge
// auto-scrolls the strip so cross-column drags work one-handed. Touch targets
// are 44px+. Desktop gets the classic three columns side by side.
//
// Write surfaces gate on a `useVibe(DB).can` verdict AND a signed-in viewer
// (plain-ACL verdicts are optimistic for anonymous visitors, whose writes
// never sync). Read-only visitors can still tap a card to view details.

const DB = "kanban";

const COLUMNS = [
  { id: "todo", label: "To Do", bg: "bg-[#ff70a6]" },
  { id: "inprogress", label: "In Progress", bg: "bg-[#ffd670]" },
  { id: "done", label: "Done", bg: "bg-[#e9ff70]" },
];

const PRIORITIES = ["LOW", "MED", "HIGH"];
const PriorityColors = {
  LOW: "bg-[#70d6ff]",
  MED: "bg-[#ffd670]",
  HIGH: "bg-[#ff70a6]",
};

const STEP = 1000;

function effPos(t) {
  return typeof t.position === "number" ? t.position : (t.createdAt || 0) / 1000;
}

// Insertion position for dropping at `index` within `sorted` (dragged card excluded).
function positionForIndex(sorted, index) {
  const before = sorted[index - 1];
  const after = sorted[index];
  if (!before && !after) return STEP;
  if (!before) return effPos(after) - STEP; // top
  if (!after) return effPos(before) + STEP; // bottom
  return (effPos(before) + effPos(after)) / 2; // between → average
}

function PriorityChip({ priority }) {
  return (
    <span className={`shrink-0 text-[0.65rem] px-2 py-0.5 border-2 border-[#242424] font-bold ${PriorityColors[priority] || PriorityColors.MED}`}>
      {priority || "MED"}
    </span>
  );
}

// Tight on purpose: title + priority only (date and description live in the
// modal), so a phone shows several tasks per column.
function TaskCard({ task, onPointerDown }) {
  return (
    <div
      data-tid={task._id}
      className="bg-[#ffffff] border-4 border-[#242424] px-3 py-3 mb-2 select-none cursor-pointer active:opacity-70"
      onPointerDown={(e) => onPointerDown(e, task)}
      style={{ touchAction: "none", willChange: "transform" }}
    >
      <div className="flex justify-between items-center gap-2 min-h-[24px]">
        <h4 className="font-bold text-[#242424] text-base leading-tight flex-1">{task.title}</h4>
        <PriorityChip priority={task.priority} />
      </div>
    </div>
  );
}

function Placeholder() {
  return <div className="bg-white/60 border-4 border-dashed border-[#242424] h-16 mb-3" />;
}

function Column({ col, tasks, dragging, isOver, overIndex, dragTaskId, columnRefs, onPointerDown }) {
  const visible = dragging ? tasks.filter((t) => t._id !== dragTaskId) : tasks;
  const items = [];
  visible.forEach((task, i) => {
    if (dragging && isOver && overIndex === i) items.push(<Placeholder key="ph" />);
    items.push(<TaskCard key={task._id} task={task} onPointerDown={onPointerDown} />);
  });
  if (dragging && isOver && overIndex >= visible.length) items.push(<Placeholder key="ph" />);
  return (
    <div className="snap-center shrink-0 w-[80vw] max-w-[320px] md:w-auto md:max-w-none md:flex-1 md:shrink">
      <div className={`${col.bg} border-4 border-[#242424] p-3 mb-3`}>
        <h3 className="font-bold text-[#242424] text-center text-lg">
          {col.label} ({tasks.length})
        </h3>
      </div>
      <div
        ref={(el) => {
          columnRefs.current[col.id] = el;
        }}
        className={`min-h-[40vh] md:min-h-[50vh] p-3 border-4 border-[#242424] bg-[#ffffff] bg-opacity-50 transition-shadow ${isOver ? "ring-4 ring-[#70d6ff]" : ""}`}
        style={{
          backgroundImage: `radial-gradient(circle at 20px 20px, #242424 3px, transparent 3px)`,
          backgroundSize: "40px 40px",
        }}
      >
        {items}
      </div>
    </div>
  );
}

// Edits start from the task doc the board already has (never `useDocument({_id})`
// pre-hydration), and save spreads the full doc so no field is dropped.
function DetailView({ task, canWrite, database, onClose }) {
  const [title, setTitle] = useState(task.title || "");
  const [description, setDescription] = useState(task.description || "");
  const [status, setStatus] = useState(task.status || "todo");
  const [priority, setPriority] = useState(task.priority || "MED");

  async function saveTask() {
    await database.put({
      ...task,
      title: title.trim() || task.title,
      description,
      status,
      priority,
      updatedAt: Date.now(),
    });
    onClose();
  }

  async function deleteTask() {
    await database.del(task._id);
    onClose();
  }

  // Compact on purpose: the common motion is open → retitle → Save, so the
  // title and Save share the TOP row (visible with the keyboard open — no
  // unfocus-and-scroll), the modal anchors to the top of the screen, and the
  // rare actions (delete, dates) sit at the bottom.
  return (
    <div
      className="fixed inset-0 flex items-start justify-center p-3 z-50"
      style={{ background: "rgba(36,36,36,0.4)" }}
      onClick={onClose}
    >
      <div
        className="bg-[#ffffff] border-4 border-[#242424] p-3 max-w-md w-full max-h-[85vh] overflow-y-auto space-y-2"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={!canWrite}
          placeholder="Task title"
          className="w-full min-h-[48px] p-2 border-4 border-[#242424] text-[#242424] font-bold disabled:opacity-60"
        />

        <div className="flex gap-2">
          {PRIORITIES.map((p) => (
            <button
              key={p}
              type="button"
              disabled={!canWrite}
              onClick={() => setPriority(p)}
              className={`flex-1 min-h-[44px] border-4 border-[#242424] font-bold text-sm text-[#242424] transition-colors ${priority === p ? PriorityColors[p] : "bg-[#ffffff]"} disabled:opacity-60`}
            >
              {p}
            </button>
          ))}
        </div>

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          disabled={!canWrite}
          className="w-full min-h-[44px] p-2 border-4 border-[#242424] text-[#242424] font-bold disabled:opacity-60"
        >
          {COLUMNS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>

        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add a description..."
          disabled={!canWrite}
          rows={2}
          className="w-full p-2 border-4 border-[#242424] text-[#242424] placeholder-[#242424] placeholder-opacity-50 resize-none disabled:opacity-60"
        />

        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="text-[0.65rem] leading-tight text-[#242424] opacity-60">
            <div>Created {new Date(task.createdAt).toLocaleDateString()}</div>
            {task.updatedAt && <div>Updated {new Date(task.updatedAt).toLocaleDateString()}</div>}
          </div>
          <div className="flex items-center gap-2">
            {canWrite && (
              <button
                onClick={deleteTask}
                className="min-h-[40px] px-3 border-2 border-[#d94f3d] text-[#d94f3d] bg-[#ffffff] font-bold text-sm active:bg-[#d94f3d] active:text-white"
              >
                Delete
              </button>
            )}
            <button onClick={onClose} className="min-h-[40px] px-3 border-2 border-[#242424] bg-[#ffffff] font-bold text-sm text-[#242424]">
              Close
            </button>
            {/* Save anchors the lower-right — thumb zone, end of the flow. The
                form is compact enough that it still clears the keyboard. */}
            {canWrite && (
              <button
                onClick={saveTask}
                className="min-h-[48px] px-5 bg-[#70d6ff] border-4 border-[#242424] font-bold text-[#242424] active:bg-[#e9ff70]"
              >
                Save
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { useDocument, useLiveQuery, database } = useFireproof(DB);
  const { viewer, HandleInput } = useViewer();
  const { can, ready, me } = useVibe(DB);

  const { doc: newTask, merge: mergeNewTask } = useDocument({ title: "", priority: "MED" });

  const { docs: liveTasks } = useLiveQuery("type", { key: "task" });
  const { docs: boardDocs } = useLiveQuery("type", { key: "board" });
  const { docs: memberDocs } = useLiveQuery("type", { key: "member" });

  // Boards: a built-in "default" plus board docs. Tasks carry a boardId;
  // legacy docs without one belong to Default — no migration needed. The
  // active board is a per-device choice (localStorage).
  const [boardId, setBoardIdState] = useState(() => {
    try {
      return localStorage.getItem("kanban-live-board") || "default";
    } catch {
      return "default";
    }
  });
  const [boardPickerOpen, setBoardPickerOpen] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [renameDraft, setRenameDraft] = useState("");
  const [deleteArmed, setDeleteArmed] = useState(false);
  // Every user has an IMPLICIT personal board: "default-<their handle>" — no
  // board doc, not public, same access model as any other board. The stored
  // board choice "default" is a sentinel meaning "my default", resolved here.
  const myDefaultId = "default-" + (me?.userHandle || viewer?.userHandle || "anon");
  const activeBoardId = boardId === "default" ? myDefaultId : boardId;
  const sortedBoards = [...boardDocs]
    .filter((b) => !String(b._id).startsWith("default"))
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const boards = [{ _id: "default", name: "Default" }, ...sortedBoards];
  const boardName = boards.find((b) => b._id === boardId)?.name || "Default";
  const boardTasks = liveTasks.filter((t) => t.boardId === activeBoardId);
  const taskCountFor = (id) => liveTasks.filter((t) => t.boardId === (id === "default" ? myDefaultId : id)).length;

  function switchBoard(id, knownName) {
    setBoardIdState(id);
    // Keep the rename draft in lockstep with the active board — a just-created
    // board's doc may not have landed in the live query yet, so the caller can
    // pass the name it already knows.
    setRenameDraft(knownName || boards.find((b) => b._id === id)?.name || "Default");
    try {
      localStorage.setItem("kanban-live-board", id);
    } catch {
      /* per-device nicety only */
    }
    setBoardPickerOpen(false);
  }

  function openBoardSheet() {
    setRenameDraft(boardName);
    setDeleteArmed(false);
    setBoardPickerOpen(true);
  }

  async function renameBoard(e) {
    e.preventDefault();
    const name = renameDraft.trim();
    const doc = boardDocs.find((b) => b._id === boardId);
    if (!name || !doc || !canWrite) return;
    setBoardPickerOpen(false);
    await database.put({ ...doc, name });
  }

  // Two-tap delete: first tap arms, second removes the board AND its tasks
  // (they'd be invisible orphans otherwise), then lands back on Default.
  async function deleteBoard() {
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    const doc = boardDocs.find((b) => b._id === boardId);
    if (!doc || !canWrite) return;
    const doomed = [...liveTasks.filter((t) => t.boardId === boardId), ...memberDocs.filter((m) => m.boardId === boardId)];
    switchBoard("default");
    await Promise.all([...doomed.map((d) => database.del(d._id)), database.del(doc._id)]);
  }

  const isDefaultBoard = boardId === "default";

  // Per-BOARD write verdict — with access.js bound, the fn is the authority
  // (owner on Default; creator/members on shared boards). The signed-in guard
  // stays: verdicts are optimistic for anonymous visitors, whose writes only
  // land locally and never sync.
  const boardMembers = memberDocs.filter((m) => m.boardId === activeBoardId);
  const createVerdict = ready ? can.create({ type: "task", boardId: activeBoardId, authorHandle: me?.userHandle }) : null;
  const canWrite = !!viewer && !!createVerdict?.ok;
  // Only the board's admin (creator, or the user on their own default) may
  // invite — ask the access fn the exact question with a member-doc verdict.
  const canInvite = !!viewer && ready ? !!can.create({ type: "member", boardId: activeBoardId, addedBy: me?.userHandle }).ok : false;
  const boardAdminHandle = boardId === "default" ? me?.userHandle || viewer?.userHandle : boards.find((b) => b._id === boardId)?.creatorHandle;

  // ---- Drag state ----
  const [dragging, setDragging] = useState(false);
  const [dragTask, setDragTask] = useState(null);
  const [overStatus, setOverStatus] = useState(null);
  const [overIndex, setOverIndex] = useState(0);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [snapshot, setSnapshot] = useState(null); // freeze list while dragging

  const [detailTaskId, setDetailTaskId] = useState(null);
  const [hasDragged, setHasDragged] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false); // mobile bottom sheet
  const [activeColIdx, setActiveColIdx] = useState(0); // mobile strip dots
  // The sheet adds to whichever column was centered when it was OPENED.
  const [composerTarget, setComposerTarget] = useState("todo");

  const columnRefs = useRef({ todo: null, inprogress: null, done: null });
  const stripRef = useRef(null); // the horizontal snap strip (mobile)
  const pointerIdRef = useRef(null);
  const startPosRef = useRef({ x: 0, y: 0 });
  const dragPosRef = useRef({ x: 0, y: 0 });
  const dropRef = useRef({ status: null, index: 0 });
  const originStatusRef = useRef(null); // column the drag started in
  // Staged drag-scroll (mobile): pulling the card out of its column scrolls the
  // strip to the 1/3 stop (origin + neighbour both droppable); lingering near
  // the edge for a beat advances to the 2/3 stop (neighbour primary, the column
  // beyond reachable). Stops are thirds of the strip's scroll range, measured
  // from where the drag started.
  const dragScrollRef = useRef({ startLeft: 0, dir: 0, level: 0, lingerStart: null });

  const viewTasks = dragging && snapshot ? snapshot : boardTasks;

  const tasksByCol = useMemo(() => {
    const by = {};
    for (const c of COLUMNS) by[c.id] = [];
    for (const t of viewTasks) (by[t.status] || (by[t.status] = [])).push(t);
    for (const c of COLUMNS) by[c.id].sort((a, b) => effPos(a) - effPos(b));
    return by;
  }, [viewTasks]);

  async function handleSubmit(e, colId) {
    e.preventDefault();
    const title = newTask.title.trim();
    if (!title || !canWrite) return;
    const priority = newTask.priority;
    mergeNewTask({ title: "" }); // clear input immediately, keep chosen priority
    setComposerOpen(false);
    const list = tasksByCol[colId] || [];
    await database.put({
      type: "task",
      title,
      priority,
      status: colId,
      boardId: activeBoardId,
      position: positionForIndex(list, list.length),
      createdAt: Date.now(),
      authorHandle: me?.userHandle || viewer?.userHandle,
    });
  }

  async function createBoard(e) {
    e.preventDefault();
    const name = newBoardName.trim();
    if (!name || !canWrite) return;
    setNewBoardName("");
    const res = await database.put({
      type: "board",
      name,
      createdAt: Date.now(),
      creatorHandle: me?.userHandle || viewer?.userHandle, // access.js: creator is the board's admin
    });
    switchBoard(res.id, name); // land on the new board right away
  }

  // `handle` arrives pre-sanitized from HandleInput (picked handles are real
  // users; raw entry is server-slug-sanitized), so no normalization here.
  async function addMember(handle) {
    if (!handle || !canInvite) return;
    if (boardMembers.some((m) => m.userHandle === handle)) return; // already a member
    await database.put({
      type: "member",
      boardId: activeBoardId,
      userHandle: handle,
      addedBy: me?.userHandle || viewer?.userHandle,
      createdAt: Date.now(),
    });
  }

  // Which column fills the mobile strip? (drives the ● ○ ○ dots)
  function handleStripScroll() {
    const el = stripRef.current;
    if (!el || el.scrollWidth <= el.clientWidth + 8) return;
    const center = el.scrollLeft + el.clientWidth / 2;
    let best = 0;
    let bestDist = Infinity;
    [...el.children].forEach((child, i) => {
      const c = child.offsetLeft + child.offsetWidth / 2;
      const d = Math.abs(c - center);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    setActiveColIdx(best);
  }

  // ---- Pointer drag ----
  function locateColumn(x, y) {
    for (const c of COLUMNS) {
      const el = columnRefs.current[c.id];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top - 80 && y <= r.bottom) return c.id;
    }
    return null;
  }

  // Insertion index in `status` at pointer y — measured from the DOM cards
  // (dragged card is unmounted while dragging, so indexes line up).
  function locateIndex(status, y) {
    const el = columnRefs.current[status];
    if (!el) return 0;
    const cards = [...el.querySelectorAll("[data-tid]")];
    for (let i = 0; i < cards.length; i++) {
      const r = cards[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) return i;
    }
    return cards.length;
  }

  function handlePointerDown(e, task) {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    pointerIdRef.current = e.pointerId;
    card.setPointerCapture(e.pointerId);

    startPosRef.current = { x: e.clientX, y: e.clientY };
    dragPosRef.current = { x: e.clientX, y: e.clientY };
    originStatusRef.current = task.status;
    dragScrollRef.current = {
      startLeft: stripRef.current ? stripRef.current.scrollLeft : 0,
      dir: 0,
      level: 0,
      lingerStart: null,
    };
    setHasDragged(false);

    setSnapshot(boardTasks);
    setDragTask(task);

    setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setDragPos({ x: e.clientX, y: e.clientY });
  }

  function handlePointerMove(e) {
    if (e.pointerId !== pointerIdRef.current) return;

    const x = e.clientX;
    const y = e.clientY;
    dragPosRef.current = { x, y };

    const deltaX = Math.abs(x - startPosRef.current.x);
    const deltaY = Math.abs(y - startPosRef.current.y);

    // Read-only visitors can still TAP a card, but never drag one.
    if (!dragging && canWrite && (deltaX > 5 || deltaY > 5)) {
      setDragging(true);
      setHasDragged(true);
      document.body.style.userSelect = "none";
      document.body.style.cursor = "grabbing";
      // Snap-mandatory would re-snap away from our fractional stops the moment
      // we scroll programmatically — off while dragging, restored after drop.
      if (stripRef.current) stripRef.current.style.scrollSnapType = "none";
    }
  }

  function smoothStripTo(left) {
    const strip = stripRef.current;
    if (!strip) return;
    const max = strip.scrollWidth - strip.clientWidth;
    strip.scrollTo({ left: Math.max(0, Math.min(max, left)), behavior: "smooth" });
  }

  // One rAF loop drives the overlay, the drop target, and mobile edge
  // auto-scroll — it keeps running while the finger holds still at an edge
  // (pointermove alone stops firing there).
  useEffect(() => {
    if (!dragging) return;
    let raf;
    const tick = () => {
      const { x, y } = dragPosRef.current;
      setDragPos({ x, y });

      const strip = stripRef.current;
      if (strip && strip.scrollWidth > strip.clientWidth + 8) {
        const sc = dragScrollRef.current;
        const third = (strip.scrollWidth - strip.clientWidth) / 3;

        // Stage 1 — the card left its origin column: scroll one third toward
        // that side, so the neighbour is easy to hit and the origin still is.
        const originEl = columnRefs.current[originStatusRef.current];
        const or = originEl ? originEl.getBoundingClientRect() : null;
        const wantDir = or ? (x > or.right ? 1 : x < or.left ? -1 : 0) : 0;
        if (wantDir !== 0 && (sc.level === 0 || sc.dir !== wantDir)) {
          sc.dir = wantDir;
          sc.level = 1;
          sc.lingerStart = null;
          smoothStripTo(sc.startLeft + wantDir * third);
        }

        // Stage 2 — lingering near the screen edge advances to the 2/3 stop,
        // IF a column exists beyond the neighbour. Past the last column there
        // is no second stop, and the beat never re-arms. The rhythm rule for
        // the whole gesture: the FIRST movement (pull-out, or first step back)
        // is immediate; every beat after the first is twice as long (1s).
        if (sc.level === 1 && sc.dir !== 0) {
          const EDGE = 64;
          const nearEdge = x > window.innerWidth - EDGE ? 1 : x < EDGE ? -1 : 0;
          if (nearEdge === sc.dir) {
            if (sc.lingerStart == null) {
              sc.lingerStart = performance.now();
            } else if (performance.now() - sc.lingerStart >= 1000) {
              const originIdx = COLUMNS.findIndex((c) => c.id === originStatusRef.current);
              const beyondIdx = originIdx + 2 * sc.dir;
              sc.level = 2; // consume the beat either way — never advances again
              sc.lingerStart = null;
              if (beyondIdx >= 0 && beyondIdx < COLUMNS.length) {
                smoothStripTo(sc.startLeft + sc.dir * 2 * third);
              }
            }
          } else {
            sc.lingerStart = null; // left the edge before the beat
          }
        }

        // Change of mind — after a stage, the origin's rect has scrolled far
        // off-side, so the pull-out test can never fire in reverse. Instead,
        // parking the finger in the OPPOSITE third of the screen steps the
        // scroll back one stop (cascading to the start if you keep holding),
        // and at the start the drag can re-stage toward the other side.
        // Same rhythm as forward: the first movement is immediate, and every
        // beat after the first is the doubled one (1s).
        if (sc.level > 0 && sc.dir !== 0) {
          const W = window.innerWidth;
          const inOpposite = sc.dir === 1 ? x < W / 3 : x > (2 * W) / 3;
          if (inOpposite && performance.now() - (sc.lastStepDown || 0) > 1000) {
            sc.level -= 1;
            sc.lastStepDown = performance.now();
            sc.lingerStart = null;
            smoothStripTo(sc.startLeft + sc.dir * sc.level * third);
            if (sc.level === 0) sc.dir = 0;
          }
        }
      }

      const status = locateColumn(x, y);
      const index = status ? locateIndex(status, y) : 0;
      dropRef.current = { status, index };
      setOverStatus(status);
      setOverIndex(index);

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  function handlePointerUp() {
    const task = dragTask;
    const { status: dest, index } = dropRef.current;
    const didDrag = hasDragged;
    const sc = dragScrollRef.current;

    setDragging(false);
    setDragTask(null);
    setOverStatus(null);
    setSnapshot(null);
    pointerIdRef.current = null;
    dropRef.current = { status: null, index: 0 };
    document.body.style.userSelect = "";
    document.body.style.cursor = "";

    if (didDrag) {
      if (task && dest && canWrite) {
        const destList = (tasksByCol[dest] || []).filter((t) => t._id !== task._id);
        const position = positionForIndex(destList, index);
        const noop = task.status === dest && Math.abs(effPos(task) - position) < 0.0001;
        if (!noop) {
          database.put({ ...task, status: dest, position, updatedAt: Date.now() }).catch(() => {});
        }
      }
      // Settle the strip: a real drop centers its column; a drop outside any
      // column reverts the scroll to where the drag began (the item reverts on
      // its own — nothing was written). Snap comes back after the glide.
      const strip = stripRef.current;
      if (strip && strip.scrollWidth > strip.clientWidth + 8 && (sc.level > 0 || (task && dest))) {
        if (task && dest && canWrite) {
          const i = COLUMNS.findIndex((c) => c.id === dest);
          const child = strip.children[i];
          if (child) smoothStripTo(child.offsetLeft - (strip.clientWidth - child.offsetWidth) / 2);
        } else {
          smoothStripTo(sc.startLeft);
        }
        setTimeout(() => {
          if (stripRef.current) stripRef.current.style.scrollSnapType = "";
        }, 500);
      } else if (strip) {
        strip.style.scrollSnapType = "";
      }
    } else if (task) {
      setDetailTaskId(task._id); // tap → detail view
    }
    dragScrollRef.current = { startLeft: 0, dir: 0, level: 0, lingerStart: null };
  }

  useEffect(() => {
    if (!dragTask) return;
    const onMove = (e) => handlePointerMove(e);
    const onUp = () => handlePointerUp();
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragTask, dragging, overStatus, overIndex, hasDragged]);

  const overlay =
    dragging && dragTask ? (
      <div
        className="pointer-events-none fixed z-50"
        style={{
          left: 0,
          top: 0,
          transform: `translate3d(${dragPos.x - dragOffset.x}px, ${dragPos.y - dragOffset.y}px, 0)`,
          willChange: "transform",
          filter: "drop-shadow(0 6px 0 #242424)",
        }}
      >
        <div className="scale-105">
          <div className="bg-[#ffffff] border-4 border-[#242424] p-4 w-[240px]">
            <div className="flex justify-between items-start gap-2">
              <h4 className="font-bold text-[#242424] text-base leading-tight flex-1">{dragTask.title}</h4>
              <PriorityChip priority={dragTask.priority} />
            </div>
          </div>
        </div>
      </div>
    ) : null;

  const detailTask = detailTaskId ? liveTasks.find((t) => t._id === detailTaskId) : null;

  return (
    <div
      className="min-h-screen p-4 bg-[#ff9770]"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23242424' fill-opacity='0.1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
      }}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {overlay}
      {detailTask && (
        <DetailView key={detailTask._id} task={detailTask} canWrite={canWrite} database={database} onClose={() => setDetailTaskId(null)} />
      )}

      <header id="app-header" className="mb-3 md:mb-5 max-w-5xl mx-auto">
        {/* Compact on mobile: one row, board gets the pixels. */}
        {/* The BOARD is the title. Tapping it opens the board sheet: switch,
            create, rename, or delete. */}
        <div className="flex items-end justify-between mb-2 md:mb-4 px-1">
          <button onClick={openBoardSheet} className="text-left">
            <span className="block text-[0.6rem] uppercase tracking-widest font-bold text-[#242424] opacity-60">Kanban Live</span>
            <h1 className="text-xl md:text-3xl font-bold text-[#242424] leading-tight">
              {boardName} <span className="text-sm md:text-xl align-middle">▾</span>
            </h1>
          </button>
          <span className="text-xs md:text-sm font-bold text-[#242424] opacity-70">{boardTasks.length} tasks</span>
        </div>

        {canWrite ? (
          /* Desktop composer — on mobile the floating + opens the bottom sheet. */
          <form onSubmit={(e) => handleSubmit(e, "todo")} className="hidden md:block bg-[#ffffff] border-4 border-[#242424] p-3">
            <div className="flex flex-row gap-2">
              <input
                type="text"
                placeholder="Add new task..."
                value={newTask.title}
                onChange={(e) => mergeNewTask({ title: e.target.value })}
                className="flex-1 min-h-[48px] p-3 border-4 border-[#242424] text-[#242424] placeholder-[#242424] placeholder-opacity-50 text-base"
              />
              <div className="flex gap-2">
                {PRIORITIES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => mergeNewTask({ priority: p })}
                    className={`min-h-[48px] px-3 border-4 border-[#242424] font-bold text-sm text-[#242424] transition-colors ${newTask.priority === p ? PriorityColors[p] : "bg-[#ffffff]"}`}
                  >
                    {p}
                  </button>
                ))}
                <button
                  type="submit"
                  className="min-h-[48px] bg-[#e9ff70] border-4 border-[#242424] px-6 font-bold text-[#242424] hover:bg-[#70d6ff] transition-colors text-base"
                >
                  Add
                </button>
              </div>
            </div>
          </form>
        ) : (
          ready && (
            <div className="bg-[#ffffff] border-4 border-[#242424] p-3 text-center">
              <p className="font-bold text-[#242424] text-sm">
                {viewer
                  ? createVerdict?.reason || "Read-only — ask the board's admin to add you as a member."
                  : "Boards are private — log in to see and edit yours."}
              </p>
            </div>
          )
        )}
      </header>

      {/* Mobile: horizontal snap strip with edge auto-scroll while dragging.
          Desktop: the classic three columns side by side. */}
      <div
        id="app"
        ref={stripRef}
        onScroll={handleStripScroll}
        className="flex flex-row gap-3 md:gap-4 overflow-x-auto md:overflow-x-visible snap-x snap-mandatory md:snap-none pb-2 md:pb-4 max-w-5xl mx-auto"
        style={{ scrollbarWidth: "none" }}
      >
        {COLUMNS.map((col) => (
          <Column
            key={col.id}
            col={col}
            tasks={tasksByCol[col.id] || []}
            dragging={dragging}
            isOver={overStatus === col.id}
            overIndex={overIndex}
            dragTaskId={dragTask?._id}
            columnRefs={columnRefs}
            onPointerDown={handlePointerDown}
          />
        ))}
      </div>

      {/* Mobile column dots — which of the three columns fills the strip. */}
      <div className="md:hidden flex justify-center gap-2 pb-20 pt-1">
        {COLUMNS.map((col, i) => (
          <span
            key={col.id}
            className={`w-2.5 h-2.5 border-2 border-[#242424] rounded-full ${i === activeColIdx ? "bg-[#242424]" : "bg-[#ffffff]"}`}
          />
        ))}
      </div>

      {/* Mobile composer FAB, in the thumb zone (left, clear of the Vibes
          switch). Board management lives in the header title now. */}
      {canWrite && !composerOpen && !boardPickerOpen && (
        <button
          aria-label="Add task"
          onClick={() => {
            setComposerTarget(COLUMNS[activeColIdx]?.id || "todo");
            setComposerOpen(true);
          }}
          className="md:hidden fixed bottom-5 left-5 z-40 w-14 h-14 bg-[#e9ff70] border-4 border-[#242424] text-3xl leading-none font-bold text-[#242424] active:bg-[#70d6ff]"
          style={{ boxShadow: "4px 4px 0 #242424" }}
        >
          +
        </button>
      )}

      {/* Board picker: switch boards, or create one (lands on it right away).
          Same no-dim, tap-outside-closes pattern as the composer sheet. */}
      {boardPickerOpen && (
        <>
          <div className="fixed inset-0 z-40" onPointerDown={() => setBoardPickerOpen(false)} />
          {/* pb-16: the host page floats its Vibes switch over the iframe's
              bottom-right corner, which EATS taps there (verified: clicks on a
              button under it never reach the app). Keep the sheet's tappables
              above that zone, and the create row at the top for good measure. */}
          <div
            className="fixed inset-x-0 bottom-0 z-50 md:inset-x-auto md:left-1/2 md:bottom-10 md:w-[380px] md:-translate-x-1/2 bg-[#ffffff] border-t-4 md:border-4 border-[#242424] p-4 pb-16 md:pb-4 space-y-2 max-h-[70vh] overflow-y-auto"
            style={{ boxShadow: "0 -6px 0 #242424" }}
          >
            {/* Current board management — members for every board (your
                implicit Default included); rename/delete only for boards that
                are real docs. */}
            {canWrite && (
              <>
                <h3 className="font-bold text-[#242424] text-xs uppercase tracking-widest">This board</h3>
                {!isDefaultBoard && (
                  <form onSubmit={renameBoard} className="flex gap-2">
                    <input
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      placeholder="Board name"
                      className="flex-1 min-w-0 min-h-[44px] p-2 border-4 border-[#242424] text-[#242424] font-bold"
                    />
                    <button type="submit" className="min-h-[44px] px-3 bg-[#70d6ff] border-4 border-[#242424] font-bold text-[#242424]">
                      Rename
                    </button>
                  </form>
                )}
                {/* Members: read/write on this board's channel, granted by
                    handle. The access fn only lets the board's admin invite. */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-[#242424] opacity-60 uppercase tracking-widest">Members</span>
                  <span className="text-sm font-bold text-[#242424]">@{boardAdminHandle || "?"}</span>
                  {boardMembers.map((m) => (
                    <span key={m._id} className="text-sm font-bold text-[#242424] bg-[#ffd670] border-2 border-[#242424] px-2 py-0.5">
                      @{m.userHandle}
                    </span>
                  ))}
                </div>
                {canInvite && (
                  /* Platform people-picker: autocompletes handles you've
                     interacted with, then global matches. Inviting happens on
                     pick; the always-null value keeps the field ready for the
                     next member (the new member shows in the row above). */
                  <HandleInput
                    value={null}
                    onChange={addMember}
                    placeholder="Add a member..."
                    style={{ display: "block", "--border": "#242424", "--card-bg": "#ffffff", "--text": "#242424", "--muted": "#5c5c5c" }}
                  />
                )}
                {!isDefaultBoard && (
                  <button
                    onClick={deleteBoard}
                    className={`w-full min-h-[44px] px-3 border-2 font-bold text-sm ${deleteArmed ? "bg-[#d94f3d] text-white border-[#242424]" : "border-[#d94f3d] text-[#d94f3d] bg-[#ffffff]"}`}
                  >
                    {deleteArmed
                      ? `Really delete "${boardName}" and its ${liveTasks.filter((t) => t.boardId === boardId).length} task(s)?`
                      : "Delete board"}
                  </button>
                )}
              </>
            )}
            <h3 className="font-bold text-[#242424] text-xs uppercase tracking-widest pt-1">Boards</h3>
            {canWrite && (
              <form onSubmit={createBoard} className="flex gap-2">
                <input
                  value={newBoardName}
                  onChange={(e) => setNewBoardName(e.target.value)}
                  placeholder="New board name..."
                  className="flex-1 min-w-0 min-h-[44px] p-2 border-4 border-[#242424] text-[#242424] placeholder-[#242424] placeholder-opacity-50"
                />
                <button type="submit" className="min-h-[44px] px-4 bg-[#e9ff70] border-4 border-[#242424] font-bold text-[#242424]">
                  Create
                </button>
              </form>
            )}
            {boards.map((b) => (
              <button
                key={b._id}
                onClick={() => switchBoard(b._id)}
                className={`w-full min-h-[44px] px-3 border-4 border-[#242424] font-bold text-left text-[#242424] ${b._id === boardId ? "bg-[#e9ff70]" : "bg-[#ffffff]"}`}
              >
                {b.name}
                <span className="float-right text-xs opacity-60 font-normal">{taskCountFor(b._id)}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {canWrite && composerOpen && (
        <>
          {/* No dim, no takeover: the page stays as it stands. This invisible
              catcher makes the first tap outside the sheet close it (without
              also triggering whatever was under the finger). The draft lives in
              useDocument state, so closing never loses typed content. */}
          <div className="md:hidden fixed inset-0 z-40" onPointerDown={() => setComposerOpen(false)} />
          <form
            onSubmit={(e) => handleSubmit(e, composerTarget)}
            className="md:hidden fixed inset-x-0 bottom-0 z-50 bg-[#ffffff] border-t-4 border-[#242424] p-4 pb-16 space-y-3"
            style={{ boxShadow: "0 -6px 0 #242424" }}
          >
            <input
              type="text"
              placeholder="Add new task..."
              autoFocus
              value={newTask.title}
              onChange={(e) => mergeNewTask({ title: e.target.value })}
              className="w-full min-h-[48px] p-3 border-4 border-[#242424] text-[#242424] placeholder-[#242424] placeholder-opacity-50 text-base"
            />
            <div className="flex gap-2">
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => mergeNewTask({ priority: p })}
                  className={`flex-1 min-h-[48px] border-4 border-[#242424] font-bold text-sm text-[#242424] ${newTask.priority === p ? PriorityColors[p] : "bg-[#ffffff]"}`}
                >
                  {p}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 min-h-[48px] bg-[#e9ff70] border-4 border-[#242424] font-bold text-[#242424] active:bg-[#70d6ff]"
              >
                Add to {COLUMNS.find((c) => c.id === composerTarget)?.label || "To Do"}
              </button>
              <button
                type="button"
                onClick={() => setComposerOpen(false)}
                className="min-h-[48px] px-5 bg-[#ffffff] border-4 border-[#242424] font-bold text-[#242424]"
              >
                Close
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
