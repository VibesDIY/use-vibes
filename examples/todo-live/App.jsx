import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useFireproof } from 'use-fireproof';
import { useViewer, useVibe } from 'use-vibes';

// ── To-Do Live (system/todo-live) ────────────────────────────────────────────
// Step 1 of the /start Productive lane (#3080): ONE list — add, check, delete,
// drag to reorder (fractional `position`, kanban-live's pointer-drag feel in a
// single column: pointer capture, rAF overlay, 5px tap-vs-drag threshold,
// live-query freeze while dragging; a tap toggles done).
//
// LOCAL-FIRST: anonymous /start visitors use it instantly — `anonymousLocal`
// runs put/del/useLiveQuery against a localStorage store while logged out and
// migrates into the cloud on first sign-in (the `migrate` hook stamps what the
// access fn requires: your handle and your implicit personal list id). Sign-in
// arrives as an upsell at the first *invite* — the Friends sheet is where
// "sign in to sync & share" lives.
//
// Sharing: your list is an implicit per-user channel ("list:default-<handle>");
// friends added BY HANDLE get read/write via member-doc grants (access.js).
// Lists shared WITH you appear in the Friends sheet as a switcher.

const DB = 'todo';
const STEP = 1000;

function effPos(t) {
  return typeof t.position === 'number' ? t.position : (t.createdAt || 0) / 1000;
}

// Insertion position for dropping at `index` within `sorted` (dragged row excluded).
function positionForIndex(sorted, index) {
  const before = sorted[index - 1];
  const after = sorted[index];
  if (!before && !after) return STEP;
  if (!before) return effPos(after) - STEP; // top
  if (!after) return effPos(before) + STEP; // bottom
  return (effPos(before) + effPos(after)) / 2; // between → average
}

// Re-stamp locally-stored docs onto the freshly signed-in handle when the
// anonymousLocal store migrates local → cloud: the access fn requires
// authorHandle = the writing user, and todo-live's only lists are the implicit
// "default-<handle>" scopes, so anonymous-era items land on the new user's
// private channel, correctly granted. DROP everything else (members can't
// exist pre-login; the invite UI is sign-in-gated).
const migrateTodoDoc = (doc, handle) => {
  if (doc.type === 'todo') return { ...doc, listId: 'default-' + handle, authorHandle: handle };
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
  // anonymousLocal: identical API against a local store while logged out, with
  // migrate-on-first-sign-in. Returning signed-out devices fall through to the
  // cloud db (whose anonymous-write rejection IS the "please sign in" signal).
  const { useDocument, useLiveQuery, database } = useFireproof(DB, {
    anonymousLocal: true,
    migrate: migrateTodoDoc,
  });
  const { viewer, ViewerTag, HandleInput } = useViewer();
  const { can, ready, me } = useVibe(DB);

  const signedIn = !!viewer?.userHandle;
  const myHandle = me?.userHandle || viewer?.userHandle;
  const myDefaultId = 'default-' + (myHandle || 'anon');

  const { doc: draft, merge: mergeDraft } = useDocument({ text: '' });
  const { docs: todoDocs } = useLiveQuery('type', { key: 'todo' });
  const { docs: memberDocs } = useLiveQuery('type', { key: 'member' });

  // The active list: yours ("mine" sentinel — resolves per-handle), or a list
  // shared with you. Per-device choice.
  const [listChoice, setListChoiceState] = useState(() => {
    try {
      return localStorage.getItem('todo-live-list') || 'mine';
    } catch {
      return 'mine';
    }
  });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [notice, setNotice] = useState(null);

  // Lists shared with me: member docs naming my handle ride each list's channel,
  // so they replicate to me once I'm granted.
  const sharedListIds = useMemo(() => {
    const ids = new Set();
    for (const m of memberDocs) {
      if (myHandle && m.userHandle === myHandle && m.listId && m.listId !== myDefaultId)
        ids.add(m.listId);
    }
    return [...ids].sort();
  }, [memberDocs, myHandle, myDefaultId]);

  const activeListId =
    listChoice === 'mine' || !sharedListIds.includes(listChoice) ? myDefaultId : listChoice;
  const isMyList = activeListId === myDefaultId;
  const listOwnerHandle = activeListId.slice('default-'.length);

  function switchList(choice) {
    setListChoiceState(choice);
    try {
      localStorage.setItem('todo-live-list', choice);
    } catch {
      /* per-device nicety only */
    }
    setSheetOpen(false);
  }

  const items = useMemo(
    () =>
      todoDocs
        .filter((t) => (t.listId || myDefaultId) === activeListId)
        .sort((a, b) => effPos(a) - effPos(b)),
    [todoDocs, activeListId, myDefaultId]
  );
  const listMembers = memberDocs.filter((m) => m.listId === activeListId);

  // Write verdicts: while logged out the local store accepts everything (the
  // access fn only gates cloud writes); signed in, the fn is the authority —
  // your own list, or a shared list you were granted.
  const createVerdict =
    signedIn && ready
      ? can.create({ type: 'todo', listId: activeListId, authorHandle: myHandle })
      : null;
  const canWrite = signedIn ? !!createVerdict?.ok : true;
  // Only the list's user may invite (implicit scopes: their handle IS the
  // admin). Probe with a concrete userHandle — the fn validates the grantee id,
  // so a handle-less probe would throw instead of answering.
  const canInvite =
    signedIn && ready
      ? !!can.create({
          type: 'member',
          listId: activeListId,
          userHandle: myHandle,
          addedBy: myHandle,
        }).ok
      : false;

  async function guarded(write) {
    try {
      setNotice(null);
      await write();
    } catch (e) {
      // Returning-signed-out devices ride the cloud db, where anonymous writes
      // are rejected — surface that as the sign-in nudge it is.
      setNotice(
        signedIn
          ? e?.message || 'That change was not allowed.'
          : 'Sign in to keep using your list on this device.'
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
  const [snapshot, setSnapshot] = useState(null); // freeze list while dragging
  const [hasDragged, setHasDragged] = useState(false);

  const listRef = useRef(null);
  const pointerIdRef = useRef(null);
  const startPosRef = useRef({ x: 0, y: 0 });
  const dragPosRef = useRef({ x: 0, y: 0 });
  const dropRef = useRef(0);

  const viewItems = dragging && snapshot ? snapshot : items;
  const visibleItems =
    dragging && dragItem ? viewItems.filter((t) => t._id !== dragItem._id) : viewItems;

  // Insertion index at pointer y — measured from the DOM rows (the dragged row
  // is unmounted while dragging, so indexes line up).
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
    // Read-only visitors can look, never drag; a sub-threshold press is a tap.
    if (!dragging && canWrite && (dx > 5 || dy > 5)) {
      setDragging(true);
      setHasDragged(true);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'grabbing';
    }
  }

  // One rAF loop drives the overlay and the drop index (pointermove alone
  // stops firing when the finger holds still).
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
      toggleItem(item); // tap → toggle done
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

  const doneCount = items.filter((t) => t.done).length;

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
      className="min-h-screen p-4 bg-[#70d6ff]"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23242424' fill-opacity='0.08'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
      }}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {overlay}
      <div className="max-w-md mx-auto">
        <header className="mb-3 flex items-end justify-between px-1">
          <div>
            <span className="block text-[0.6rem] uppercase tracking-widest font-bold text-[#242424] opacity-60">
              To-Do Live
            </span>
            <h1 className="text-xl md:text-3xl font-bold text-[#242424] leading-tight">
              {isMyList ? 'My List' : `@${listOwnerHandle}'s list`}
            </h1>
          </div>
          <button
            onClick={() => setSheetOpen(true)}
            className="min-h-[44px] px-3 bg-[#ffd670] border-4 border-[#242424] font-bold text-sm text-[#242424] active:bg-[#e9ff70]"
          >
            Friends{signedIn && listMembers.length > 0 ? ` (${listMembers.length})` : ''}
          </button>
        </header>

        {canWrite ? (
          <form
            onSubmit={addItem}
            className="bg-[#ffffff] border-4 border-[#242424] p-3 mb-3 flex gap-2"
          >
            <input
              type="text"
              placeholder="Add something to do..."
              value={draft.text}
              onChange={(e) => mergeDraft({ text: e.target.value })}
              className="flex-1 min-w-0 min-h-[48px] p-3 border-4 border-[#242424] text-[#242424] placeholder-[#242424] placeholder-opacity-50 text-base"
            />
            <button
              type="submit"
              className="min-h-[48px] bg-[#e9ff70] border-4 border-[#242424] px-4 font-bold text-[#242424] active:bg-[#ff9770]"
            >
              Add
            </button>
          </form>
        ) : (
          ready && (
            <div className="bg-[#ffffff] border-4 border-[#242424] p-3 mb-3 text-center">
              <p className="font-bold text-[#242424] text-sm">
                {signedIn
                  ? createVerdict?.reason || "Read-only — ask the list's owner to add you."
                  : 'Sign in to see and edit your list.'}
              </p>
            </div>
          )
        )}

        {notice && (
          <div className="bg-[#ffd670] border-4 border-[#242424] p-2 mb-3 text-center">
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
              Nothing to do — add your first item.
            </p>
          )}
          {rows}
        </div>

        <div className="flex justify-between items-center px-1 pt-2 pb-20">
          <span className="text-xs font-bold text-[#242424] opacity-70">
            {items.length} item{items.length === 1 ? '' : 's'}
            {doneCount > 0 ? ` · ${doneCount} done` : ''}
          </span>
          {!signedIn && (
            <span className="text-xs font-bold text-[#242424] opacity-70">
              On this device — sign in to sync &amp; share
            </span>
          )}
        </div>
      </div>

      {/* Friends sheet — the sharing surface, and (logged out) the sign-in
          upsell moment. No dim; invisible tap-outside catcher; pb-16 keeps
          tappables clear of the host page's Vibes switch pill (#3076). */}
      {sheetOpen && (
        <>
          <div className="fixed inset-0 z-40" onPointerDown={() => setSheetOpen(false)} />
          <div
            className="fixed inset-x-0 bottom-0 z-50 md:inset-x-auto md:left-1/2 md:bottom-10 md:w-[380px] md:-translate-x-1/2 bg-[#ffffff] border-t-4 md:border-4 border-[#242424] p-4 pb-16 md:pb-4 space-y-3 max-h-[70vh] overflow-y-auto"
            style={{ boxShadow: '0 -6px 0 #242424' }}
          >
            {!signedIn ? (
              <>
                <h3 className="font-bold text-[#242424] text-xs uppercase tracking-widest">
                  Sync &amp; share
                </h3>
                <p className="text-sm font-bold text-[#242424]">
                  Your list lives on this device. Sign in to sync it everywhere and invite friends
                  by handle — your items come along.
                </p>
                <div className="flex justify-center py-1">
                  <ViewerTag />
                </div>
              </>
            ) : (
              <>
                <h3 className="font-bold text-[#242424] text-xs uppercase tracking-widest">
                  This list
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-[#242424] opacity-60 uppercase tracking-widest">
                    Members
                  </span>
                  <span className="text-sm font-bold text-[#242424]">@{listOwnerHandle}</span>
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
                    placeholder="Invite a friend..."
                    style={{
                      display: 'block',
                      '--border': '#242424',
                      '--card-bg': '#ffffff',
                      '--text': '#242424',
                      '--muted': '#5c5c5c',
                    }}
                  />
                )}
                {(sharedListIds.length > 0 || !isMyList) && (
                  <>
                    <h3 className="font-bold text-[#242424] text-xs uppercase tracking-widest pt-1">
                      Lists
                    </h3>
                    <button
                      onClick={() => switchList('mine')}
                      className={`w-full min-h-[44px] px-3 border-4 border-[#242424] font-bold text-left text-[#242424] ${isMyList ? 'bg-[#e9ff70]' : 'bg-[#ffffff]'}`}
                    >
                      My List
                    </button>
                    {sharedListIds.map((id) => (
                      <button
                        key={id}
                        onClick={() => switchList(id)}
                        className={`w-full min-h-[44px] px-3 border-4 border-[#242424] font-bold text-left text-[#242424] ${activeListId === id ? 'bg-[#e9ff70]' : 'bg-[#ffffff]'}`}
                      >
                        @{id.slice('default-'.length)}'s list
                      </button>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
