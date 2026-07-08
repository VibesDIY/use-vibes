import React, { useState, useRef, useMemo, useEffect } from "react";
import { useFireproof } from "use-fireproof";
import { useViewer, useVibe, callAI } from "use-vibes";

// ── Family Grocery (jchris/family-grocery) ───────────────────────────────────
// One list per STORE, stores grouped into FAMILY GROUPS. Anyone can start a
// group, you can belong to many (your own is implicit — "My family"), and
// adding someone to a group shares every store list in it at once
// (kanban-live's per-object channel model, see access.js).
//
// Drag and drop is kanban-live's pointer machinery — pointer capture, rAF
// overlay, tap-vs-drag threshold, live-query freeze while dragging, edge
// auto-scroll on the horizontal strip — with STORES as the columns: drag an
// item to another store, or reorder within one (fractional `position`, only
// the moved doc writes). A plain tap toggles the item in/out of the cart.
//
// THEME: smooth — warm paper background, white rounded cards, soft shadows,
// one calm green accent. Spacing/radii use arbitrary px values throughout
// (vibe Tailwind's numeric spacing scale is px-scaled).
//
// LOCAL-FIRST pre-invite: anonymousLocal runs everything against a local
// store while logged out, migrating into your implicit group on sign-in.

const DB = "groceries";

const INK = "#2f2c27";
const MUTED = "#8f8a80";
const ACCENT = "#3e9b6d";
const ACCENT_SOFT = "#e7f3ec";
const DANGER = "#c05c4a";
const LINE = "#e9e5da";
const CARD_LINE = "#eeeae0";
const CARD_SHADOW = "0 1px 2px rgba(44,40,33,0.05), 0 3px 10px rgba(44,40,33,0.06)";
const LIFT_SHADOW = "0 10px 24px rgba(44,40,33,0.18), 0 2px 6px rgba(44,40,33,0.12)";

const STORE_IDEAS = ["Supermarket", "Costco", "Farmers market", "Pharmacy"];

const STEP = 1000;
const effPos = (i) => (typeof i.position === "number" ? i.position : (i.createdAt || 0) / 1000);

// Insertion position for dropping at `index` within `sorted` (dragged item excluded).
function positionForIndex(sorted, index) {
  const before = sorted[index - 1];
  const after = sorted[index];
  if (!before && !after) return STEP;
  if (!before) return effPos(after) - STEP;
  if (!after) return effPos(before) + STEP;
  return (effPos(before) + effPos(after)) / 2;
}

// Local → cloud migration on first sign-in: anonymous-era stores and items
// re-home onto the new user's implicit group. Groups/members can't exist
// pre-login — drop strays.
const migrateGroceryDoc = (doc, handle) => {
  if (doc.type === "item" || doc.type === "store") {
    return { ...doc, groupId: "default-" + handle, authorHandle: handle };
  }
  return null;
};

function Check({ checked }) {
  return (
    <span
      className="shrink-0 w-[22px] h-[22px] rounded-full flex items-center justify-center text-[13px] font-bold text-white transition-colors"
      style={{ border: checked ? `2px solid ${ACCENT}` : "2px solid #d8d2c4", background: checked ? ACCENT : "transparent" }}
    >
      {checked ? "✓" : ""}
    </span>
  );
}

// One open (to-buy) item: the whole row is a drag handle; a tap (under the
// 5px threshold) toggles it into the cart. The ✕ stops pointerdown so it
// never starts a drag.
function ItemRow({ item, canWrite, onPointerDown, onDelete }) {
  return (
    <div
      data-iid={item._id}
      onPointerDown={(e) => onPointerDown(e, item)}
      className="bg-white rounded-[12px] pl-[12px] pr-[8px] py-[10px] mb-[8px] flex items-center gap-[10px] select-none active:opacity-80"
      style={{ boxShadow: CARD_SHADOW, border: `1px solid ${CARD_LINE}`, touchAction: "none", willChange: "transform", cursor: canWrite ? "grab" : "default" }}
    >
      <Check checked={false} />
      <span className="flex-1 min-w-0 text-[15px] font-medium leading-snug" style={{ color: INK }}>
        {item.name}
      </span>
      {canWrite && (
        <button
          aria-label={`Delete ${item.name}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onDelete(item)}
          className="shrink-0 w-[28px] h-[28px] rounded-full text-[13px] opacity-35 hover:opacity-100 transition-opacity"
          style={{ color: INK }}
        >
          ✕
        </button>
      )}
    </div>
  );
}

function CartRow({ item, canWrite, onToggle }) {
  return (
    <button
      onClick={() => canWrite && onToggle(item)}
      className="w-full text-left rounded-[10px] px-[10px] py-[7px] flex items-center gap-[10px]"
      style={{ cursor: canWrite ? "pointer" : "default" }}
    >
      <Check checked />
      <span className="flex-1 min-w-0 text-[14px] leading-snug line-through" style={{ color: MUTED }}>
        {item.name}
      </span>
    </button>
  );
}

function Placeholder() {
  return <div className="h-[46px] rounded-[12px] mb-[8px]" style={{ border: "2px dashed #cdc6b4", background: "rgba(255,255,255,0.5)" }} />;
}

// Per-column composer with its own draft (defined top-level so typing never
// remounts the input).
function ColumnComposer({ onAdd }) {
  const [text, setText] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const name = text.trim();
        if (!name) return;
        setText("");
        onAdd(name);
      }}
      className="mt-[2px] flex gap-[8px]"
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add an item…"
        className="flex-1 min-w-0 min-h-[42px] px-[12px] rounded-[12px] text-[15px] bg-white outline-none focus:bg-white"
        style={{ border: "1px dashed #d5cfc0", color: INK }}
      />
      <button
        type="submit"
        aria-label="Add item"
        className="shrink-0 min-h-[42px] w-[42px] rounded-[12px] text-[20px] leading-none font-semibold text-white active:opacity-80"
        style={{ background: ACCENT }}
      >
        +
      </button>
    </form>
  );
}

function NewStoreColumn({ onCreate, hasStores }) {
  const [name, setName] = useState("");
  return (
    <section className="snap-center shrink-0 w-[82vw] max-w-[300px] md:w-[280px]">
      <div className="rounded-[18px] p-[16px]" style={{ border: "2px dashed #ddd6c5", background: "rgba(255,255,255,0.4)" }}>
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] mb-[10px]" style={{ color: MUTED }}>
          {hasStores ? "New store" : "Add your first store"}
        </h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const n = name.trim();
            if (!n) return;
            setName("");
            onCreate(n);
          }}
          className="flex gap-[8px] mb-[12px]"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Trader Joe's, Costco…"
            className="flex-1 min-w-0 min-h-[42px] px-[12px] rounded-[12px] text-[15px] bg-white outline-none"
            style={{ border: `1px solid ${LINE}`, color: INK }}
          />
          <button type="submit" className="shrink-0 min-h-[42px] px-[14px] rounded-[12px] text-[14px] font-semibold text-white active:opacity-80" style={{ background: ACCENT }}>
            Add
          </button>
        </form>
        <div className="flex flex-wrap gap-[6px]">
          {STORE_IDEAS.map((s) => (
            <button
              key={s}
              onClick={() => onCreate(s)}
              className="px-[10px] py-[6px] rounded-full text-[13px] font-medium active:opacity-70"
              style={{ background: "white", border: `1px solid ${LINE}`, color: INK }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

// A store column: header (name, count, ⋯ menu), open items (drop zone),
// composer, then the cart section for checked-off items.
function Column({
  store,
  open,
  cart,
  dragging,
  isOver,
  overIndex,
  dragItemId,
  storeRefs,
  canWrite,
  onPointerDown,
  onDelete,
  onToggle,
  onAdd,
  onClearCart,
  menuOpen,
  onMenuToggle,
  renameDraft,
  setRenameDraft,
  onRename,
  deleteArmed,
  onDeleteStore,
}) {
  const visible = dragging ? open.filter((i) => i._id !== dragItemId) : open;
  const rows = [];
  visible.forEach((item, i) => {
    if (dragging && isOver && overIndex === i) rows.push(<Placeholder key="ph" />);
    rows.push(<ItemRow key={item._id} item={item} canWrite={canWrite} onPointerDown={onPointerDown} onDelete={onDelete} />);
  });
  if (dragging && isOver && overIndex >= visible.length) rows.push(<Placeholder key="ph" />);

  return (
    <section className="snap-center shrink-0 w-[82vw] max-w-[300px] md:w-[300px]">
      <div
        className="rounded-[18px] p-[12px] transition-shadow"
        style={{
          background: "rgba(255,255,255,0.62)",
          border: `1px solid ${LINE}`,
          boxShadow: isOver ? `0 0 0 2px ${ACCENT}, 0 8px 24px rgba(62,155,109,0.15)` : "0 1px 3px rgba(44,40,33,0.04)",
        }}
      >
        <div className="flex items-center gap-[8px] px-[4px] pb-[10px]">
          <h2 className="flex-1 min-w-0 text-[16px] font-semibold truncate" style={{ color: INK }}>
            {store.name}
          </h2>
          <span
            className="shrink-0 min-w-[24px] text-center text-[12px] font-semibold rounded-full px-[7px] py-[2px]"
            style={{ background: open.length ? ACCENT_SOFT : "transparent", color: open.length ? ACCENT : MUTED }}
          >
            {open.length}
          </span>
          {canWrite && (
            <button
              aria-label={`Store options for ${store.name}`}
              onClick={onMenuToggle}
              className="shrink-0 w-[30px] h-[30px] rounded-full text-[16px] leading-none opacity-50 hover:opacity-100"
              style={{ color: INK, background: menuOpen ? ACCENT_SOFT : "transparent" }}
            >
              ⋯
            </button>
          )}
        </div>

        {menuOpen && canWrite && (
          <div className="rounded-[12px] p-[10px] mb-[10px] space-y-[8px]" style={{ background: "white", border: `1px solid ${CARD_LINE}` }}>
            <form onSubmit={onRename} className="flex gap-[8px]">
              <input
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                placeholder="Store name"
                className="flex-1 min-w-0 min-h-[38px] px-[10px] rounded-[10px] text-[14px] outline-none"
                style={{ border: `1px solid ${LINE}`, color: INK }}
              />
              <button type="submit" className="shrink-0 min-h-[38px] px-[12px] rounded-[10px] text-[13px] font-semibold text-white" style={{ background: ACCENT }}>
                Save
              </button>
            </form>
            <button
              onClick={onDeleteStore}
              className="w-full min-h-[38px] rounded-[10px] text-[13px] font-semibold"
              style={
                deleteArmed
                  ? { background: DANGER, color: "white" }
                  : { border: `1px solid ${DANGER}`, color: DANGER, background: "white" }
              }
            >
              {deleteArmed ? `Really delete "${store.name}" and its ${open.length + cart.length} item(s)?` : "Delete store"}
            </button>
          </div>
        )}

        <div
          ref={(el) => {
            storeRefs.current[store._id] = el;
          }}
          className="min-h-[120px]"
        >
          {rows.length === 0 && !canWrite && (
            <p className="text-center text-[13px] py-[16px]" style={{ color: MUTED }}>
              Nothing to buy here.
            </p>
          )}
          {rows}
        </div>

        {canWrite && <ColumnComposer onAdd={(name) => onAdd(store._id, name)} />}

        {cart.length > 0 && (
          <div className="mt-[12px] pt-[8px]" style={{ borderTop: `1px solid ${LINE}` }}>
            <div className="flex items-center justify-between px-[4px] pb-[4px]">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: MUTED }}>
                In the cart · {cart.length}
              </span>
              {canWrite && (
                <button onClick={onClearCart} className="text-[12px] font-semibold opacity-70 hover:opacity-100" style={{ color: DANGER }}>
                  Clear
                </button>
              )}
            </div>
            {cart.map((item) => (
              <CartRow key={item._id} item={item} canWrite={canWrite} onToggle={onToggle} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// Recipe → ingredients bar. Asks the AI to break a dish into ingredients and
// assign each to the fewest distinct stores, honoring quality sourcing (fresh
// produce → farmers market, bulk → warehouse, etc.), reusing existing stores
// from the current group when possible.
function RecipeBar({ storeNames, existingNames, canWrite, onResult }) {
  const [recipe, setRecipe] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function run(e) {
    e.preventDefault();
    const dish = recipe.trim();
    if (!dish || loading) return;
    setError(null);
    setLoading(true);
    try {
      const prompt = `Break the recipe "${dish}" into a shopping list of ingredients.
Assign each ingredient to a store, using the FEWEST distinct stores possible while still
prioritizing quality sourcing: fresh produce/herbs → a farmers market if one exists,
bulk/pantry staples → a warehouse store, medicine/toiletries → a pharmacy, everything
else → a general supermarket.

Stores that already exist in this list (reuse these names exactly when they fit):
${storeNames.length ? storeNames.map((s) => `- ${s}`).join("\n") : "(none yet)"}

Items already on the list (do not duplicate these):
${existingNames.length ? existingNames.map((s) => `- ${s}`).join("\n") : "(none)"}

Return concise ingredient names (e.g. "Basil", not "1 bunch of fresh basil").`;
      const raw = await callAI(prompt, {
        schema: {
          properties: {
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  ingredient: { type: "string" },
                  store: { type: "string" },
                },
              },
            },
          },
        },
      });
      const parsed = JSON.parse(raw);
      const items = (parsed.items || []).filter((x) => x && x.ingredient && x.store);
      if (!items.length) {
        setError("Couldn't parse a shopping list — try another recipe.");
        return;
      }
      await onResult(dish, items);
      setRecipe("");
    } catch (err) {
      setError("Something went wrong generating that recipe.");
    } finally {
      setLoading(false);
    }
  }

  if (!canWrite) return null;

  return (
    <div className="max-w-[1100px] mx-auto mb-[14px]">
      <div className="rounded-[18px] p-[14px]" style={{ background: "white", border: `1px solid ${CARD_LINE}`, boxShadow: CARD_SHADOW }}>
        <div className="flex items-center gap-[8px] mb-[10px]">
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: MUTED }}>
            Add a recipe
          </h3>
        </div>
        <form onSubmit={run} className="flex gap-[8px]">
          <input
            value={recipe}
            onChange={(e) => setRecipe(e.target.value)}
            placeholder="Chicken tikka masala, pesto pasta…"
            disabled={loading}
            className="flex-1 min-w-0 min-h-[44px] px-[14px] rounded-[12px] text-[15px] bg-white outline-none disabled:opacity-60"
            style={{ border: `1px solid ${LINE}`, color: INK }}
          />
          <button
            type="submit"
            disabled={loading}
            className="shrink-0 min-h-[44px] px-[16px] rounded-[12px] text-[14px] font-semibold text-white flex items-center gap-[8px] active:opacity-80 disabled:opacity-70"
            style={{ background: ACCENT }}
          >
            {loading ? (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" className="animate-spin" fill="none">
                  <circle cx="12" cy="12" r="9" stroke="white" strokeWidth="3" strokeLinecap="round" opacity="0.35" />
                  <path d="M12 3a9 9 0 0 1 9 9" stroke="white" strokeWidth="3" strokeLinecap="round" />
                </svg>
                Working…
              </>
            ) : (
              "Generate"
            )}
          </button>
        </form>
        {error && (
          <p className="mt-[8px] text-[13px]" style={{ color: DANGER }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const { useLiveQuery, database } = useFireproof(DB, {
    anonymousLocal: true,
    migrate: migrateGroceryDoc,
  });
  const { viewer, ViewerTag, HandleInput } = useViewer();
  const { can, ready, me } = useVibe(DB);

  const signedIn = !!viewer?.userHandle;
  const myHandle = me?.userHandle || viewer?.userHandle;
  const myDefault = "default-" + (myHandle || "anon");

  const { docs: itemDocs } = useLiveQuery("type", { key: "item" });
  const { docs: storeDocs } = useLiveQuery("type", { key: "store" });
  const { docs: groupDocs } = useLiveQuery("type", { key: "group" });
  const { docs: memberDocs } = useLiveQuery("type", { key: "member" });

  // Which group? "mine" is the implicit personal group. The choice is a
  // per-device nicety (localStorage).
  const [groupChoice, setGroupChoiceState] = useState(() => {
    try {
      return localStorage.getItem("family-grocery-group") || "mine";
    } catch {
      return "mine";
    }
  });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [groupRename, setGroupRename] = useState("");
  const [groupDeleteArmed, setGroupDeleteArmed] = useState(false);
  const [notice, setNotice] = useState(null);
  const [menuStoreId, setMenuStoreId] = useState(null);
  const [storeRename, setStoreRename] = useState("");
  const [storeDeleteArmed, setStoreDeleteArmed] = useState(false);

  // Groups I can open: mine, ones with a doc I can see (created or shared),
  // and ones I only know through my own member doc (another user's implicit
  // default group has no group doc to sync).
  const groups = useMemo(() => {
    const map = new Map();
    for (const g of [...groupDocs].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))) {
      map.set(g._id, g.name || "Family group");
    }
    if (myHandle) {
      for (const m of memberDocs) {
        if (m.userHandle !== myHandle || !m.groupId || m.groupId === myDefault || map.has(m.groupId)) continue;
        map.set(m.groupId, m.groupId.startsWith("default-") ? `@${m.groupId.slice("default-".length)}'s family` : "Shared group");
      }
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [groupDocs, memberDocs, myHandle, myDefault]);

  const activeGroupId = groupChoice === "mine" || !groups.some((g) => g.id === groupChoice) ? myDefault : groupChoice;
  const isMyGroup = activeGroupId === myDefault;
  const activeGroupDoc = groupDocs.find((g) => g._id === activeGroupId);
  const groupName = isMyGroup ? "My family" : groups.find((g) => g.id === activeGroupId)?.name || "Family group";

  const stores = useMemo(
    () => storeDocs.filter((s) => (s.groupId || myDefault) === activeGroupId).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)),
    [storeDocs, activeGroupId, myDefault]
  );
  const groupItems = useMemo(() => itemDocs.filter((i) => (i.groupId || myDefault) === activeGroupId), [itemDocs, activeGroupId, myDefault]);
  const groupMembers = memberDocs.filter((m) => m.groupId === activeGroupId);
  const founderHandle = activeGroupId.startsWith("default-")
    ? activeGroupId.slice("default-".length)
    : activeGroupDoc?.creatorHandle || "?";
  const openCountFor = (groupId) => itemDocs.filter((i) => !i.checked && (i.groupId || myDefault) === groupId).length;

  // Per-GROUP write verdict — with access.js bound, the fn is the authority.
  // Anonymous runs local-only (anonymousLocal), so writes are real for them.
  const createVerdict = signedIn && ready ? can.create({ type: "item", groupId: activeGroupId, authorHandle: myHandle }) : null;
  const canWrite = signedIn ? !!createVerdict?.ok : true;
  // Only the group's admin (creator, or you on your own default) may invite —
  // ask the access fn the exact question with a concrete member-doc shape.
  const canInvite =
    signedIn && ready
      ? !!can.create({ type: "member", groupId: activeGroupId, userHandle: myHandle, addedBy: myHandle }).ok
      : false;

  async function guarded(write) {
    try {
      setNotice(null);
      await write();
    } catch (e) {
      setNotice(signedIn ? e?.message || "That change was not allowed." : "Sign in to keep your lists and share them.");
    }
  }

  function switchGroup(choice) {
    setGroupChoiceState(choice);
    setMenuStoreId(null);
    setGroupDeleteArmed(false);
    try {
      localStorage.setItem("family-grocery-group", choice);
    } catch {
      /* per-device nicety only */
    }
    setSheetOpen(false);
  }

  function openSheet() {
    setGroupRename(activeGroupDoc?.name || "");
    setGroupDeleteArmed(false);
    setSheetOpen(true);
  }

  // ---- Data writes ----
  async function addItem(storeId, name) {
    if (!canWrite) return;
    const list = openByStore[storeId] || [];
    await guarded(() =>
      database.put({
        type: "item",
        name,
        storeId,
        groupId: activeGroupId,
        checked: false,
        position: positionForIndex(list, list.length),
        createdAt: Date.now(),
        authorHandle: myHandle,
      })
    );
  }

  async function toggleItem(item) {
    if (!canWrite) return;
    await guarded(() => database.put({ ...item, checked: !item.checked, checkedAt: item.checked ? 0 : Date.now() }));
  }

  async function deleteItem(item) {
    if (!canWrite) return;
    await guarded(() => database.del(item._id));
  }

  async function clearCart(storeId) {
    const doomed = groupItems.filter((i) => i.checked && i.storeId === storeId);
    if (!canWrite || doomed.length === 0) return;
    await guarded(() => Promise.all(doomed.map((i) => database.del(i._id))));
  }

  // The recipe bar's writes: reuse stores by (lowercased) name or create
  // fresh ones, skip ingredients already on the group's list, and keep
  // insertion order stable with incrementing timestamps.
  async function applyRecipe(dish, plan) {
    const existingLower = new Set(groupItems.map((i) => (i.name || "").trim().toLowerCase()));
    const byName = new Map(stores.map((s) => [(s.name || "").trim().toLowerCase(), s]));
    let base = Date.now();
    for (const { ingredient, store } of plan) {
      // Dedupe BEFORE store creation — a skipped duplicate must not leave
      // behind an empty just-created store (Codex P2 on #3390).
      const nameKey = ingredient.trim().toLowerCase();
      if (existingLower.has(nameKey)) continue;
      existingLower.add(nameKey);
      const key = (store || "").trim().toLowerCase();
      let storeDoc = byName.get(key);
      if (!storeDoc) {
        const res = await database.put({
          type: "store",
          name: store.trim(),
          groupId: activeGroupId,
          authorHandle: myHandle,
          createdAt: base++,
        });
        storeDoc = { _id: res.id, name: store.trim() };
        byName.set(key, storeDoc);
      }
      await database.put({
        type: "item",
        name: ingredient.trim(),
        storeId: storeDoc._id,
        groupId: activeGroupId,
        authorHandle: myHandle,
        checked: false,
        createdAt: base++,
      });
    }
    setNotice(`Added "${dish}" ingredients across ${byName.size} store(s).`);
  }

  async function createStore(name) {
    if (!canWrite || !name) return;
    await guarded(() =>
      database.put({ type: "store", name, groupId: activeGroupId, createdAt: Date.now(), authorHandle: myHandle })
    );
  }

  async function renameStore(e) {
    e.preventDefault();
    const doc = stores.find((s) => s._id === menuStoreId);
    const name = storeRename.trim();
    if (!doc || !name || !canWrite) return;
    setMenuStoreId(null);
    await guarded(() => database.put({ ...doc, name }));
  }

  // Two-tap delete sweeps the store's items so they don't become orphans.
  async function deleteStore() {
    if (!storeDeleteArmed) {
      setStoreDeleteArmed(true);
      return;
    }
    const doc = stores.find((s) => s._id === menuStoreId);
    if (!doc || !canWrite) return;
    const doomed = groupItems.filter((i) => i.storeId === doc._id);
    setMenuStoreId(null);
    await guarded(() => Promise.all([...doomed.map((d) => database.del(d._id)), database.del(doc._id)]));
  }

  async function createGroup(e) {
    e.preventDefault();
    const name = newGroupName.trim();
    if (!name || !signedIn) return;
    setNewGroupName("");
    await guarded(async () => {
      const res = await database.put({ type: "group", name, createdAt: Date.now(), creatorHandle: myHandle });
      switchGroup(res.id);
    });
  }

  async function renameGroup(e) {
    e.preventDefault();
    const name = groupRename.trim();
    if (!name || !activeGroupDoc || !canInvite) return;
    await guarded(() => database.put({ ...activeGroupDoc, name }));
  }

  // Two-tap delete: sweeps the group's stores, items, and memberships, then
  // the group doc, and lands back on My family.
  async function deleteGroup() {
    if (!groupDeleteArmed) {
      setGroupDeleteArmed(true);
      return;
    }
    if (!activeGroupDoc || !canInvite) return;
    const doomed = [
      ...groupItems,
      ...stores,
      ...groupMembers,
    ];
    switchGroup("mine");
    await guarded(() => Promise.all([...doomed.map((d) => database.del(d._id)), database.del(activeGroupDoc._id)]));
  }

  // `handle` arrives pre-sanitized from HandleInput (picked handles are real
  // users; raw entry is server-slug-sanitized), so no normalization here.
  async function addMember(handle) {
    if (!handle || !canInvite) return;
    if (handle === myHandle || groupMembers.some((m) => m.userHandle === handle)) return;
    await guarded(() =>
      database.put({ type: "member", groupId: activeGroupId, userHandle: handle, addedBy: myHandle, createdAt: Date.now() })
    );
  }

  async function removeMember(m) {
    await guarded(() => database.del(m._id));
  }

  // ---- Drag state (kanban-live's machinery, stores as columns) ----
  const [dragging, setDragging] = useState(false);
  const [dragItem, setDragItem] = useState(null);
  const [overStore, setOverStore] = useState(null);
  const [overIndex, setOverIndex] = useState(0);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [snapshot, setSnapshot] = useState(null); // freeze live items while dragging
  const [hasDragged, setHasDragged] = useState(false);

  const storeRefs = useRef({});
  const stripRef = useRef(null);
  const pointerIdRef = useRef(null);
  const startPosRef = useRef({ x: 0, y: 0 });
  const dragPosRef = useRef({ x: 0, y: 0 });
  const dropRef = useRef({ store: null, index: 0 });

  const viewItems = dragging && snapshot ? snapshot : groupItems;

  // First sync adds store columns to the LEFT of the new-store ghost column,
  // and the browser's snap-target preservation keeps re-snapping to the ghost
  // (the only snap target at first paint) on every late layout change — a
  // fresh phone would land staring at the wrong end of the strip, and a
  // plain scrollTo(0) gets overridden by the next re-snap. Remounting the
  // strip when stores first arrive (and on group switch) wipes the preserved
  // snap target and starts scroll state at the first store.
  const stripKey = activeGroupId + (stores.length > 0 ? ":s" : ":e");

  const { openByStore, cartByStore } = useMemo(() => {
    const open = {};
    const cart = {};
    for (const s of stores) {
      open[s._id] = [];
      cart[s._id] = [];
    }
    for (const i of viewItems) {
      const bucket = i.checked ? cart : open;
      if (!bucket[i.storeId]) continue; // store deleted or other group
      bucket[i.storeId].push(i);
    }
    for (const s of stores) {
      open[s._id].sort((a, b) => effPos(a) - effPos(b));
      cart[s._id].sort((a, b) => (b.checkedAt || 0) - (a.checkedAt || 0));
    }
    return { openByStore: open, cartByStore: cart };
  }, [viewItems, stores]);

  const openCount = groupItems.filter((i) => !i.checked).length;

  function locateStore(x, y) {
    for (const s of stores) {
      const el = storeRefs.current[s._id];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (x >= r.left - 8 && x <= r.right + 8 && y >= r.top - 90 && y <= r.bottom + 60) return s._id;
    }
    return null;
  }

  // Insertion index at pointer y — measured from the DOM cards (the dragged
  // card is unmounted while dragging, so indexes line up).
  function locateIndex(storeId, y) {
    const el = storeRefs.current[storeId];
    if (!el) return 0;
    const cards = [...el.querySelectorAll("[data-iid]")];
    for (let i = 0; i < cards.length; i++) {
      const r = cards[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) return i;
    }
    return cards.length;
  }

  function handlePointerDown(e, item) {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    pointerIdRef.current = e.pointerId;
    card.setPointerCapture(e.pointerId);
    startPosRef.current = { x: e.clientX, y: e.clientY };
    dragPosRef.current = { x: e.clientX, y: e.clientY };
    setHasDragged(false);
    setSnapshot(groupItems);
    setDragItem(item);
    setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setDragPos({ x: e.clientX, y: e.clientY });
  }

  function handlePointerMove(e) {
    if (e.pointerId !== pointerIdRef.current) return;
    const x = e.clientX;
    const y = e.clientY;
    dragPosRef.current = { x, y };
    const dx = Math.abs(x - startPosRef.current.x);
    const dy = Math.abs(y - startPosRef.current.y);
    if (!dragging && canWrite && (dx > 5 || dy > 5)) {
      setDragging(true);
      setHasDragged(true);
      document.body.style.userSelect = "none";
      document.body.style.cursor = "grabbing";
      // Snap-mandatory fights programmatic edge scrolling — off while
      // dragging, restored after drop.
      if (stripRef.current) stripRef.current.style.scrollSnapType = "none";
    }
  }

  // One rAF loop drives the overlay, the drop target, and edge auto-scroll —
  // it keeps running while the finger holds still at an edge (pointermove
  // alone stops firing there).
  useEffect(() => {
    if (!dragging) return;
    let raf;
    const tick = () => {
      const { x, y } = dragPosRef.current;
      setDragPos({ x, y });

      const strip = stripRef.current;
      if (strip && strip.scrollWidth > strip.clientWidth + 8) {
        const EDGE = 60;
        if (x > window.innerWidth - EDGE) strip.scrollLeft += 9;
        else if (x < EDGE) strip.scrollLeft -= 9;
      }

      const store = locateStore(x, y);
      const index = store ? locateIndex(store, y) : 0;
      dropRef.current = { store, index };
      setOverStore(store);
      setOverIndex(index);

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  function handlePointerUp() {
    // Both the root's onPointerUp and the window listener fire for the same
    // release — the ref (mutated synchronously, unlike state) makes the
    // second call a no-op, or a tap would toggle an item twice.
    if (pointerIdRef.current == null) return;
    const item = dragItem;
    const { store: dest, index } = dropRef.current;
    const didDrag = hasDragged;

    setDragging(false);
    setDragItem(null);
    setOverStore(null);
    setSnapshot(null);
    pointerIdRef.current = null;
    dropRef.current = { store: null, index: 0 };
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    if (stripRef.current) {
      const strip = stripRef.current;
      setTimeout(() => {
        if (strip) strip.style.scrollSnapType = "";
      }, 300);
    }

    if (didDrag) {
      if (item && dest && canWrite) {
        const destList = (openByStore[dest] || []).filter((i) => i._id !== item._id);
        const position = positionForIndex(destList, index);
        const noop = item.storeId === dest && Math.abs(effPos(item) - position) < 0.0001;
        if (!noop) {
          database.put({ ...item, storeId: dest, position, updatedAt: Date.now() }).catch(() => {});
        }
      }
    } else if (item) {
      toggleItem(item); // tap → into the cart
    }
  }

  useEffect(() => {
    if (!dragItem) return;
    const onMove = (e) => handlePointerMove(e);
    const onUp = () => handlePointerUp();
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragItem, dragging, overStore, overIndex, hasDragged]);

  const overlay =
    dragging && dragItem ? (
      <div
        className="pointer-events-none fixed z-50"
        style={{
          left: 0,
          top: 0,
          transform: `translate3d(${dragPos.x - dragOffset.x}px, ${dragPos.y - dragOffset.y}px, 0) rotate(2deg) scale(1.03)`,
          willChange: "transform",
        }}
      >
        <div
          className="bg-white rounded-[12px] pl-[12px] pr-[16px] py-[10px] flex items-center gap-[10px] w-[240px]"
          style={{ boxShadow: LIFT_SHADOW, border: `1px solid ${CARD_LINE}` }}
        >
          <Check checked={false} />
          <span className="flex-1 min-w-0 text-[15px] font-medium leading-snug" style={{ color: INK }}>
            {dragItem.name}
          </span>
        </div>
      </div>
    ) : null;

  const peopleCount = groupMembers.length + 1;

  return (
    <div
      className="min-h-screen antialiased"
      style={{ background: "linear-gradient(180deg, #f8f5ee 0%, #f1eee4 100%)", color: INK }}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {overlay}

      <div className="p-[16px] md:p-[24px]">
        <header id="app-header" className="max-w-[1100px] mx-auto mb-[14px] flex items-end justify-between px-[4px]">
          {/* The GROUP is the title — tap it to switch groups, invite family,
              or start a new group. */}
          <button onClick={openSheet} className="text-left">
            <span className="block text-[11px] uppercase tracking-[0.16em] font-semibold" style={{ color: MUTED }}>
              Family Grocery
            </span>
            <h1 className="text-[24px] md:text-[30px] font-bold leading-tight">
              {groupName}{" "}
              <span className="text-[14px] md:text-[16px] align-middle" style={{ color: MUTED }}>
                ▾
              </span>
            </h1>
            <span className="block text-[12px] mt-[2px]" style={{ color: MUTED }}>
              {signedIn
                ? peopleCount > 1
                  ? `${peopleCount} people sharing every list`
                  : "Just you — tap to invite your family"
                : "On this device — sign in to share"}
            </span>
          </button>
          <span className="text-[13px] font-semibold shrink-0 pl-[8px]" style={{ color: MUTED }}>
            {openCount} to buy
          </span>
        </header>

        <RecipeBar
          storeNames={stores.map((s) => s.name)}
          existingNames={groupItems.map((i) => i.name)}
          canWrite={canWrite}
          onResult={applyRecipe}
        />

        {signedIn && ready && !canWrite && (
          <div className="max-w-[1100px] mx-auto mb-[12px] rounded-[14px] bg-white p-[12px] text-center" style={{ border: `1px solid ${LINE}` }}>
            <p className="text-[14px] font-medium">{createVerdict?.reason || "Read-only — ask the group's owner to add you."}</p>
          </div>
        )}
        {notice && (
          <div className="max-w-[1100px] mx-auto mb-[12px] rounded-[14px] p-[10px] text-center" style={{ background: "#fbeee9", border: `1px solid ${DANGER}` }}>
            <p className="text-[13px] font-medium" style={{ color: DANGER }}>
              {notice}
            </p>
          </div>
        )}

        {/* Stores are the columns: a horizontal snap strip on phones, a
            scrollable row on desktop. Drag items between stores or reorder
            within one. */}
        {/* NOT id="app" — the vibe wrapper's mount root already owns that id. */}
        <div
          id="store-strip"
          key={stripKey}
          ref={stripRef}
          className="max-w-[1100px] mx-auto flex flex-row items-start gap-[14px] overflow-x-auto snap-x snap-mandatory md:snap-none pb-[96px]"
          style={{ scrollbarWidth: "none", overflowAnchor: "none" }}
        >
          {stores.map((s) => (
            <Column
              key={s._id}
              store={s}
              open={openByStore[s._id] || []}
              cart={cartByStore[s._id] || []}
              dragging={dragging}
              isOver={overStore === s._id}
              overIndex={overIndex}
              dragItemId={dragItem?._id}
              storeRefs={storeRefs}
              canWrite={canWrite}
              onPointerDown={handlePointerDown}
              onDelete={deleteItem}
              onToggle={toggleItem}
              onAdd={addItem}
              onClearCart={() => clearCart(s._id)}
              menuOpen={menuStoreId === s._id}
              onMenuToggle={() => {
                setStoreDeleteArmed(false);
                setStoreRename(s.name || "");
                setMenuStoreId(menuStoreId === s._id ? null : s._id);
              }}
              renameDraft={storeRename}
              setRenameDraft={setStoreRename}
              onRename={renameStore}
              deleteArmed={storeDeleteArmed}
              onDeleteStore={deleteStore}
            />
          ))}
          {canWrite && <NewStoreColumn onCreate={createStore} hasStores={stores.length > 0} />}
        </div>
      </div>

      {/* Group sheet: members, rename/delete, switch or start a group. No dim;
          tap-outside catcher; extra bottom padding keeps taps clear of the
          host page's Vibes switch pill (#3076). */}
      {sheetOpen && (
        <>
          <div className="fixed inset-0 z-40" onPointerDown={() => setSheetOpen(false)} />
          <div
            className="fixed inset-x-0 bottom-0 z-50 md:inset-x-auto md:left-1/2 md:bottom-[40px] md:w-[400px] md:-translate-x-1/2 bg-white rounded-t-[20px] md:rounded-[20px] p-[18px] pb-[72px] md:pb-[18px] space-y-[10px] max-h-[72vh] overflow-y-auto"
            style={{ boxShadow: "0 -8px 30px rgba(44,40,33,0.16), 0 2px 12px rgba(44,40,33,0.10)" }}
          >
            {!signedIn && (
              <>
                <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: MUTED }}>
                  Share the shopping
                </h3>
                <p className="text-[14px] leading-relaxed">
                  Your lists live on this device for now. Sign in to sync them and share every store list with your family.
                </p>
                <div className="flex justify-center py-[4px]">
                  <ViewerTag />
                </div>
              </>
            )}

            {signedIn && (
              <>
                <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: MUTED }}>
                  {groupName}
                </h3>
                {/* One membership shares everything the group owns. */}
                <div className="flex flex-wrap items-center gap-[6px]">
                  <span
                    className="text-[13px] font-semibold rounded-full px-[10px] py-[4px]"
                    style={{ background: ACCENT_SOFT, color: ACCENT }}
                  >
                    @{founderHandle} · owner
                  </span>
                  {groupMembers.map((m) => (
                    <span
                      key={m._id}
                      className="text-[13px] font-medium rounded-full px-[10px] py-[4px] inline-flex items-center gap-[6px]"
                      style={{ background: "#f2f0e9", color: INK }}
                    >
                      @{m.userHandle}
                      {(canInvite || m.userHandle === myHandle) && (
                        <button aria-label={`Remove @${m.userHandle}`} onClick={() => removeMember(m)} className="font-semibold opacity-60 hover:opacity-100">
                          ✕
                        </button>
                      )}
                    </span>
                  ))}
                </div>
                {canInvite && (
                  /* Platform people-picker: autocompletes handles you've
                     interacted with, then global matches. Inviting happens on
                     pick; the always-null value keeps the field ready for the
                     next member. */
                  <HandleInput
                    value={null}
                    onChange={addMember}
                    placeholder="Add someone by handle…"
                    style={{ display: "block", "--border": LINE, "--card-bg": "#ffffff", "--text": INK, "--muted": MUTED }}
                  />
                )}
                {!isMyGroup && activeGroupDoc && canInvite && (
                  <form onSubmit={renameGroup} className="flex gap-[8px]">
                    <input
                      value={groupRename}
                      onChange={(e) => setGroupRename(e.target.value)}
                      placeholder="Group name"
                      className="flex-1 min-w-0 min-h-[42px] px-[12px] rounded-[12px] text-[14px] outline-none"
                      style={{ border: `1px solid ${LINE}`, color: INK }}
                    />
                    <button type="submit" className="shrink-0 min-h-[42px] px-[14px] rounded-[12px] text-[13px] font-semibold text-white" style={{ background: ACCENT }}>
                      Rename
                    </button>
                  </form>
                )}
                {!isMyGroup && activeGroupDoc && canInvite && (
                  <button
                    onClick={deleteGroup}
                    className="w-full min-h-[42px] rounded-[12px] text-[13px] font-semibold"
                    style={
                      groupDeleteArmed
                        ? { background: DANGER, color: "white" }
                        : { border: `1px solid ${DANGER}`, color: DANGER, background: "white" }
                    }
                  >
                    {groupDeleteArmed ? `Really delete "${groupName}" — its stores, items, and members?` : "Delete this group"}
                  </button>
                )}

                <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] pt-[6px]" style={{ color: MUTED }}>
                  My groups
                </h3>
                <button
                  onClick={() => switchGroup("mine")}
                  className="w-full min-h-[44px] px-[12px] rounded-[12px] text-left text-[15px] font-semibold flex items-center justify-between"
                  style={isMyGroup ? { background: ACCENT_SOFT, color: ACCENT } : { background: "#f7f5ef", color: INK }}
                >
                  My family
                  <span className="text-[12px] font-medium opacity-60">{openCountFor(myDefault)}</span>
                </button>
                {groups
                  .filter((g) => g.id !== myDefault)
                  .map((g) => (
                    <button
                      key={g.id}
                      onClick={() => switchGroup(g.id)}
                      className="w-full min-h-[44px] px-[12px] rounded-[12px] text-left text-[15px] font-semibold flex items-center justify-between"
                      style={activeGroupId === g.id ? { background: ACCENT_SOFT, color: ACCENT } : { background: "#f7f5ef", color: INK }}
                    >
                      {g.name}
                      <span className="text-[12px] font-medium opacity-60">{openCountFor(g.id)}</span>
                    </button>
                  ))}
                {/* Anyone can start a group — it's just a doc; you become its
                    owner and can invite whoever shops with you. */}
                <form onSubmit={createGroup} className="flex gap-[8px] pt-[2px]">
                  <input
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="Start a new group (The lake house…)"
                    className="flex-1 min-w-0 min-h-[44px] px-[12px] rounded-[12px] text-[14px] outline-none"
                    style={{ border: `1px solid ${LINE}`, color: INK }}
                  />
                  <button type="submit" className="shrink-0 min-h-[44px] px-[14px] rounded-[12px] text-[14px] font-semibold text-white" style={{ background: ACCENT }}>
                    Create
                  </button>
                </form>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
