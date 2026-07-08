import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useFireproof } from 'use-fireproof';
import { useViewer, useVibe } from 'use-vibes';

// ── Lists Live (system/lists-live) ───────────────────────────────────────────
// Step 2 of the /start Productive lane (#3080): MULTIPLE lists, and the point —
// DIFFERENT friends per list. The list picker IS the app title (kanban-live's
// board-sheet pattern: tap it to switch, create, rename, or two-tap delete a
// list; delete sweeps the list's todos and members). Each list is its own
// channel with its own member grants (access.js), so your "Groceries" friends
// never see your "Gift ideas".
//
// Items keep todo-live's feel: add, tap to check, delete, drag to reorder
// (fractional `position`, pointer capture + rAF overlay + 5px tap-vs-drag
// threshold, live-query freeze while dragging).
//
// LOCAL-FIRST: anonymousLocal runs the whole thing against a localStorage
// store while logged out (your default list AND lists you create), migrating
// into the cloud on first sign-in — the migrate hook stamps handles and
// re-homes default-scope items onto your implicit channel.

const DB = 'lists';
const STEP = 1000;

function effPos(t) {
  return typeof t.position === 'number' ? t.position : (t.createdAt || 0) / 1000;
}

function positionForIndex(sorted, index) {
  const before = sorted[index - 1];
  const after = sorted[index];
  if (!before && !after) return STEP;
  if (!before) return effPos(after) - STEP;
  if (!after) return effPos(before) + STEP;
  return (effPos(before) + effPos(after)) / 2;
}

// Local → cloud migration on first sign-in: stamp what the access fn requires.
// Anonymous-era items on the local default list re-home to the new user's
// implicit channel; items on locally-created lists keep their listId (the list
// doc migrates too, restamped as created by the new user). Members can't exist
// pre-login (the invite UI is sign-in-gated) — drop any strays.
const migrateListsDoc = (doc, handle) => {
  if (doc.type === 'list') return { ...doc, creatorHandle: handle };
  if (doc.type === 'todo') {
    const listId = String(doc.listId || '').startsWith('default-')
      ? 'default-' + handle
      : doc.listId;
    return { ...doc, listId, authorHandle: handle };
  }
  return null;
};

function Row({ item, onPointerDown, onDelete, canWrite }) {
  return (
    <div
      data-tid={item._id}
      className="bg-[#ffffff] border-4 border-[#242424] px-3 py-3 mb-2 select-none cursor-pointer active:opacity-70 flex items-center gap-3"
      onPointerDown={(e) => onPointerDown(e, item)}
      style={{ touchAction: 'none', willChange: 'transform' }}
    >
      <span
        className={`shrink-0 w-7 h-7 border-4 border-[#242424] flex items-center justify-center text-base font-bold ${item.done ? 'bg-[#e9ff70]' : 'bg-[#ffffff]'}`}
      >
        {item.done ? '✓' : ''}
      </span>
      <span
        className={`flex-1 font-bold text-[#242424] text-base leading-tight ${item.done ? 'line-through opacity-50' : ''}`}
      >
        {item.text}
      </span>
      {canWrite && (
        <button
          aria-label="Delete item"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onDelete(item)}
          className="shrink-0 w-8 h-8 border-2 border-[#242424] bg-[#ffffff] font-bold text-[#242424] active:bg-[#ff70a6]"
        >
          ✕
        </button>
      )}
    </div>
  );
}

function Placeholder() {
  return <div className="bg-white/60 border-4 border-dashed border-[#242424] h-14 mb-2" />;
}

export default function App() {
  const { useDocument, useLiveQuery, database } = useFireproof(DB, {
    anonymousLocal: true,
    migrate: migrateListsDoc,
  });
  const { viewer, ViewerTag, HandleInput } = useViewer();
  const { can, ready, me } = useVibe(DB);

  const signedIn = !!viewer?.userHandle;
  const myHandle = me?.userHandle || viewer?.userHandle;
  const myDefaultId = 'default-' + (myHandle || 'anon');

  const { doc: draft, merge: mergeDraft } = useDocument({ text: '' });
  const { docs: todoDocs } = useLiveQuery('type', { key: 'todo' });
  const { docs: listDocs } = useLiveQuery('type', { key: 'list' });
  const { docs: memberDocs } = useLiveQuery('type', { key: 'member' });

  // The active list is a per-device choice; "default" is a sentinel meaning
  // "my default", resolved per-handle.
  const [listChoice, setListChoiceState] = useState(() => {
    try {
      return localStorage.getItem('lists-live-list') || 'default';
    } catch {
      return 'default';
    }
  });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [renameDraft, setRenameDraft] = useState('');
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [notice, setNotice] = useState(null);

  const activeListId = listChoice === 'default' ? myDefaultId : listChoice;

  // Lists I can see: my implicit default, real list docs (mine + shared with
  // me — shared list docs replicate via their channel), and OTHER people's
  // implicit default lists I've been invited to (no doc — derived from the
  // member docs naming me).
  const sortedLists = [...listDocs]
    .filter((l) => !String(l._id).startsWith('default'))
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const sharedDefaultIds = useMemo(() => {
    const ids = new Set();
    for (const m of memberDocs) {
      if (
        myHandle &&
        m.userHandle === myHandle &&
        String(m.listId || '').startsWith('default-') &&
        m.listId !== myDefaultId
      ) {
        ids.add(m.listId);
      }
    }
    return [...ids].sort();
  }, [memberDocs, myHandle, myDefaultId]);
  const lists = [
    { _id: 'default', name: 'My List' },
    ...sortedLists,
    ...sharedDefaultIds.map((id) => ({ _id: id, name: `@${id.slice('default-'.length)}'s list` })),
  ];
  const listName = lists.find((l) => l._id === listChoice)?.name || 'My List';

  const items = useMemo(
    () =>
      todoDocs
        .filter((t) => (t.listId || myDefaultId) === activeListId)
        .sort((a, b) => effPos(a) - effPos(b)),
    [todoDocs, activeListId, myDefaultId]
  );
  const itemCountFor = (id) =>
    todoDocs.filter((t) => (t.listId || myDefaultId) === (id === 'default' ? myDefaultId : id))
      .length;
  const listMembers = memberDocs.filter((m) => m.listId === activeListId);
  const activeListDoc = listDocs.find((l) => l._id === listChoice);
  const isRealList = !!activeListDoc;
  const listAdminHandle = String(activeListId).startsWith('default-')
    ? activeListId.slice('default-'.length)
    : activeListDoc?.creatorHandle;

  function switchList(id, knownName) {
    setListChoiceState(id);
    setRenameDraft(knownName || lists.find((l) => l._id === id)?.name || 'My List');
    try {
      localStorage.setItem('lists-live-list', id);
    } catch {
      /* per-device nicety only */
    }
    setSheetOpen(false);
  }

  function openSheet() {
    setRenameDraft(listName);
    setDeleteArmed(false);
    setSheetOpen(true);
  }

  // Per-LIST write verdicts — the access fn is the authority once signed in;
  // logged out, the local store accepts everything.
  const createVerdict =
    signedIn && ready
      ? can.create({ type: 'todo', listId: activeListId, authorHandle: myHandle })
      : null;
  const canWrite = signedIn ? !!createVerdict?.ok : true;
  // Admin surface (invite/rename/delete) — ask the fn the exact question,
  // probing with a concrete userHandle (the fn validates the grantee id, so a
  // handle-less probe throws instead of answering).
  const canInvite =
    signedIn && ready
      ? !!can.create({
          type: 'member',
          listId: activeListId,
          userHandle: myHandle,
          addedBy: myHandle,
        }).ok
      : false;
  const canManage = signedIn ? canInvite : true;

  async function guarded(write) {
    try {
      setNotice(null);
      await write();
    } catch (e) {
      setNotice(
        signedIn
          ? e?.message || 'That change was not allowed.'
          : 'Sign in to keep using your lists on this device.'
      );
    }
  }

  async function addItem(e) {
    e.preventDefault();
    const text = draft.text.trim();
    if (!text || !canWrite) return;
    mergeDraft({ text: '' });
    const sorted = items;
    await guarded(() =>
      database.put({
        type: 'todo',
        text,
        done: false,
        listId: activeListId,
        position: positionForIndex(sorted, sorted.length),
        createdAt: Date.now(),
        authorHandle: myHandle,
      })
    );
  }

  async function toggleItem(item) {
    if (!canWrite) return;
    await guarded(() => database.put({ ...item, done: !item.done, updatedAt: Date.now() }));
  }

  async function deleteItem(item) {
    if (!canWrite) return;
    await guarded(() => database.del(item._id));
  }

  async function createList(e) {
    e.preventDefault();
    const name = newListName.trim();
    if (!name) return;
    setNewListName('');
    await guarded(async () => {
      const res = await database.put({
        type: 'list',
        name,
        createdAt: Date.now(),
        creatorHandle: myHandle, // access.js: creator is the list's admin
      });
      switchList(res.id, name); // land on the new list right away
    });
  }

  async function renameList(e) {
    e.preventDefault();
    const name = renameDraft.trim();
    if (!name || !activeListDoc || !canManage) return;
    setSheetOpen(false);
    await guarded(() => database.put({ ...activeListDoc, name }));
  }

  // Two-tap delete: first tap arms, second removes the list AND its todos and
  // members (invisible orphans otherwise), then lands back on My List.
  async function deleteList() {
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    if (!activeListDoc || !canManage) return;
    const doomed = [
      ...todoDocs.filter((t) => t.listId === listChoice),
      ...memberDocs.filter((m) => m.listId === listChoice),
    ];
    switchList('default');
    await guarded(() =>
      Promise.all([...doomed.map((d) => database.del(d._id)), database.del(activeListDoc._id)])
    );
  }

  // `handle` arrives pre-sanitized from HandleInput (picked handles are real
  // users; raw entry is server-slug-sanitized), so no normalization here.
  async function addMember(handle) {
    if (!handle || !canInvite) return;
    if (handle === myHandle || listMembers.some((m) => m.userHandle === handle)) return;
    await guarded(() =>
      database.put({
        type: 'member',
        listId: activeListId,
        userHandle: handle,
        addedBy: myHandle,
        createdAt: Date.now(),
      })
    );
  }

  async function removeMember(m) {
    await guarded(() => database.del(m._id));
  }

  // ---- Pointer drag (single-column reorder; tap toggles done) ----
  const [dragging, setDragging] = useState(false);
  const [dragItem, setDragItem] = useState(null);
  const [overIndex, setOverIndex] = useState(0);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [snapshot, setSnapshot] = useState(null);
  const [hasDragged, setHasDragged] = useState(false);

  const listRef = useRef(null);
  const pointerIdRef = useRef(null);
  const startPosRef = useRef({ x: 0, y: 0 });
  const dragPosRef = useRef({ x: 0, y: 0 });
  const dropRef = useRef(0);

  const viewItems = dragging && snapshot ? snapshot : items;
  const visibleItems =
    dragging && dragItem ? viewItems.filter((t) => t._id !== dragItem._id) : viewItems;

  function locateIndex(y) {
    const el = listRef.current;
    if (!el) return 0;
    const rows = [...el.querySelectorAll('[data-tid]')];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) return i;
    }
    return rows.length;
  }

  function handlePointerDown(e, item) {
    const row = e.currentTarget;
    const rect = row.getBoundingClientRect();
    pointerIdRef.current = e.pointerId;
    row.setPointerCapture(e.pointerId);
    startPosRef.current = { x: e.clientX, y: e.clientY };
    dragPosRef.current = { x: e.clientX, y: e.clientY };
    setHasDragged(false);
    setSnapshot(items);
    setDragItem(item);
    setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setDragPos({ x: e.clientX, y: e.clientY });
  }

  function handlePointerMove(e) {
    if (e.pointerId !== pointerIdRef.current) return;
    dragPosRef.current = { x: e.clientX, y: e.clientY };
    const dx = Math.abs(e.clientX - startPosRef.current.x);
    const dy = Math.abs(e.clientY - startPosRef.current.y);
    if (!dragging && canWrite && (dx > 5 || dy > 5)) {
      setDragging(true);
      setHasDragged(true);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'grabbing';
    }
  }

  useEffect(() => {
    if (!dragging) return;
    let raf;
    const tick = () => {
      const { x, y } = dragPosRef.current;
      setDragPos({ x, y });
      const index = locateIndex(y);
      dropRef.current = index;
      setOverIndex(index);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  function handlePointerUp() {
    const item = dragItem;
    const index = dropRef.current;
    const didDrag = hasDragged;
    setDragging(false);
    setDragItem(null);
    setSnapshot(null);
    pointerIdRef.current = null;
    dropRef.current = 0;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    if (didDrag) {
      if (item && canWrite) {
        const rest = items.filter((t) => t._id !== item._id);
        const position = positionForIndex(rest, index);
        if (Math.abs(effPos(item) - position) > 0.0001) {
          guarded(() => database.put({ ...item, position, updatedAt: Date.now() }));
        }
      }
    } else if (item) {
      toggleItem(item);
    }
  }

  useEffect(() => {
    if (!dragItem) return;
    const onMove = (e) => handlePointerMove(e);
    const onUp = () => handlePointerUp();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragItem, dragging, overIndex, hasDragged]);

  const rows = [];
  visibleItems.forEach((item, i) => {
    if (dragging && overIndex === i) rows.push(<Placeholder key="ph" />);
    rows.push(
      <Row
        key={item._id}
        item={item}
        onPointerDown={handlePointerDown}
        onDelete={deleteItem}
        canWrite={canWrite}
      />
    );
  });
  if (dragging && overIndex >= visibleItems.length) rows.push(<Placeholder key="ph" />);

  const overlay =
    dragging && dragItem ? (
      <div
        className="pointer-events-none fixed z-50"
        style={{
          left: 0,
          top: 0,
          transform: `translate3d(${dragPos.x - dragOffset.x}px, ${dragPos.y - dragOffset.y}px, 0)`,
          willChange: 'transform',
          filter: 'drop-shadow(0 6px 0 #242424)',
        }}
      >
        <div className="scale-105 bg-[#ffffff] border-4 border-[#242424] px-3 py-3 w-[260px] flex items-center gap-3">
          <span
            className={`shrink-0 w-7 h-7 border-4 border-[#242424] flex items-center justify-center text-base font-bold ${dragItem.done ? 'bg-[#e9ff70]' : 'bg-[#ffffff]'}`}
          >
            {dragItem.done ? '✓' : ''}
          </span>
          <span
            className={`flex-1 font-bold text-[#242424] text-base leading-tight ${dragItem.done ? 'line-through opacity-50' : ''}`}
          >
            {dragItem.text}
          </span>
        </div>
      </div>
    ) : null;

  return (
    <div
      className="min-h-screen p-4 bg-[#ffd670]"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23242424' fill-opacity='0.08'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
      }}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {overlay}
      <div className="max-w-md mx-auto">
        {/* The LIST is the title. Tapping it opens the list sheet: switch,
            create, rename, delete — and this list's own friends. */}
        <header className="mb-3 flex items-end justify-between px-1">
          <button onClick={openSheet} className="text-left">
            <span className="block text-[0.6rem] uppercase tracking-widest font-bold text-[#242424] opacity-60">
              Lists Live
            </span>
            <h1 className="text-xl md:text-3xl font-bold text-[#242424] leading-tight">
              {listName} <span className="text-sm md:text-xl align-middle">▾</span>
            </h1>
          </button>
          <span className="text-xs md:text-sm font-bold text-[#242424] opacity-70">
            {items.length} item{items.length === 1 ? '' : 's'}
          </span>
        </header>

        {canWrite ? (
          <form
            onSubmit={addItem}
            className="bg-[#ffffff] border-4 border-[#242424] p-3 mb-3 flex gap-2"
          >
            <input
              type="text"
              placeholder={`Add to ${listName}...`}
              value={draft.text}
              onChange={(e) => mergeDraft({ text: e.target.value })}
              className="flex-1 min-w-0 min-h-[48px] p-3 border-4 border-[#242424] text-[#242424] placeholder-[#242424] placeholder-opacity-50 text-base"
            />
            <button
              type="submit"
              className="min-h-[48px] bg-[#e9ff70] border-4 border-[#242424] px-4 font-bold text-[#242424] active:bg-[#70d6ff]"
            >
              Add
            </button>
          </form>
        ) : (
          ready && (
            <div className="bg-[#ffffff] border-4 border-[#242424] p-3 mb-3 text-center">
              <p className="font-bold text-[#242424] text-sm">
                {signedIn
                  ? createVerdict?.reason || "Read-only — ask this list's admin to add you."
                  : 'Lists are private — sign in to see and edit yours.'}
              </p>
            </div>
          )
        )}

        {notice && (
          <div className="bg-[#ff9770] border-4 border-[#242424] p-2 mb-3 text-center">
            <p className="font-bold text-[#242424] text-xs">{notice}</p>
          </div>
        )}

        <div
          ref={listRef}
          className="min-h-[40vh] p-3 border-4 border-[#242424] bg-[#ffffff] bg-opacity-50"
          style={{
            backgroundImage: `radial-gradient(circle at 20px 20px, #242424 3px, transparent 3px)`,
            backgroundSize: '40px 40px',
          }}
        >
          {rows.length === 0 && !dragging && (
            <p className="text-center font-bold text-[#242424] opacity-60 py-8">
              This list is empty — add the first item.
            </p>
          )}
          {rows}
        </div>

        <div className="flex justify-between items-center px-1 pt-2 pb-20">
          <span className="text-xs font-bold text-[#242424] opacity-70">
            Tap the title to switch lists
          </span>
          {!signedIn && (
            <span className="text-xs font-bold text-[#242424] opacity-70">
              On this device — sign in to sync &amp; share
            </span>
          )}
        </div>
      </div>

      {/* List sheet: manage THIS list (rename, its own members, delete) and
          switch/create lists. No dim; tap-outside catcher; pb-16 keeps taps
          clear of the host page's Vibes switch pill (#3076). */}
      {sheetOpen && (
        <>
          <div className="fixed inset-0 z-40" onPointerDown={() => setSheetOpen(false)} />
          <div
            className="fixed inset-x-0 bottom-0 z-50 md:inset-x-auto md:left-1/2 md:bottom-10 md:w-[380px] md:-translate-x-1/2 bg-[#ffffff] border-t-4 md:border-4 border-[#242424] p-4 pb-16 md:pb-4 space-y-2 max-h-[70vh] overflow-y-auto"
            style={{ boxShadow: '0 -6px 0 #242424' }}
          >
            {!signedIn && (
              <>
                <h3 className="font-bold text-[#242424] text-xs uppercase tracking-widest">
                  Sync &amp; share
                </h3>
                <p className="text-sm font-bold text-[#242424]">
                  Your lists live on this device. Sign in to sync them everywhere and give each list
                  its own friends.
                </p>
                <div className="flex justify-center py-1">
                  <ViewerTag />
                </div>
              </>
            )}
            {signedIn && canWrite && (
              <>
                <h3 className="font-bold text-[#242424] text-xs uppercase tracking-widest">
                  This list
                </h3>
                {isRealList && canManage && (
                  <form onSubmit={renameList} className="flex gap-2">
                    <input
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      placeholder="List name"
                      className="flex-1 min-w-0 min-h-[44px] p-2 border-4 border-[#242424] text-[#242424] font-bold"
                    />
                    <button
                      type="submit"
                      className="min-h-[44px] px-3 bg-[#70d6ff] border-4 border-[#242424] font-bold text-[#242424]"
                    >
                      Rename
                    </button>
                  </form>
                )}
                {/* THIS list's friends — every list has its own. */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-[#242424] opacity-60 uppercase tracking-widest">
                    Members
                  </span>
                  <span className="text-sm font-bold text-[#242424]">
                    @{listAdminHandle || '?'}
                  </span>
                  {listMembers.map((m) => (
                    <span
                      key={m._id}
                      className="text-sm font-bold text-[#242424] bg-[#ffd670] border-2 border-[#242424] px-2 py-0.5 inline-flex items-center gap-1"
                    >
                      @{m.userHandle}
                      {(canInvite || m.userHandle === myHandle) && (
                        <button
                          aria-label={`Remove @${m.userHandle}`}
                          onClick={() => removeMember(m)}
                          className="font-bold"
                        >
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
                     next friend (the new member shows in the row above). */
                  <HandleInput
                    value={null}
                    onChange={addMember}
                    placeholder="Add a friend to THIS list..."
                    style={{
                      display: 'block',
                      '--border': '#242424',
                      '--card-bg': '#ffffff',
                      '--text': '#242424',
                      '--muted': '#5c5c5c',
                    }}
                  />
                )}
                {isRealList && canManage && (
                  <button
                    onClick={deleteList}
                    className={`w-full min-h-[44px] px-3 border-2 font-bold text-sm ${deleteArmed ? 'bg-[#d94f3d] text-white border-[#242424]' : 'border-[#d94f3d] text-[#d94f3d] bg-[#ffffff]'}`}
                  >
                    {deleteArmed
                      ? `Really delete "${listName}" and its ${itemCountFor(listChoice)} item(s)?`
                      : 'Delete list'}
                  </button>
                )}
              </>
            )}
            <h3 className="font-bold text-[#242424] text-xs uppercase tracking-widest pt-1">
              Lists
            </h3>
            {canWrite && (
              <form onSubmit={createList} className="flex gap-2">
                <input
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  placeholder="New list name..."
                  className="flex-1 min-w-0 min-h-[44px] p-2 border-4 border-[#242424] text-[#242424] placeholder-[#242424] placeholder-opacity-50"
                />
                <button
                  type="submit"
                  className="min-h-[44px] px-4 bg-[#e9ff70] border-4 border-[#242424] font-bold text-[#242424]"
                >
                  Create
                </button>
              </form>
            )}
            {lists.map((l) => (
              <button
                key={l._id}
                onClick={() => switchList(l._id)}
                className={`w-full min-h-[44px] px-3 border-4 border-[#242424] font-bold text-left text-[#242424] ${l._id === listChoice ? 'bg-[#e9ff70]' : 'bg-[#ffffff]'}`}
              >
                {l.name}
                <span className="float-right text-xs opacity-60 font-normal">
                  {itemCountFor(l._id)}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
