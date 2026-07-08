import React, { useState, useMemo, useEffect } from 'react';
import { useFireproof } from 'use-fireproof';
import { useViewer, useVibe } from 'use-vibes';

// ── Habits Live (system/habits-live) ─────────────────────────────────────────
// The daily-recurring branch of the /start Productive lane (#3080): habits
// reset every day, checks are per-day docs, and streaks come from consecutive
// day-keys. Friends invited by handle are accountability VIEWERS — they see
// your streaks (read-only by construction in access.js), you log your own days.
//
// Per-day checks are keyed on a LOCAL day-key derived from the same Date the
// write uses (the hue-hunt lesson: never mix clock bases — a UTC storage date
// under a local day-key makes evening check-ins land on "tomorrow"). Check doc
// ids are deterministic (check-<habitId>-<day>) so toggling is idempotent and
// the local→cloud migration overwrites rather than duplicates.
//
// LOCAL-FIRST: the most personal branch of the family — fully usable logged
// out via anonymousLocal; sign-in is only for syncing and accountability
// sharing, and lives in the Friends sheet.

const DB = 'habits';

// Local calendar day (YYYY-MM-DD) for a Date — the ONE day-key derivation.
function dayKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// The last `n` local days, oldest first, ending today.
function lastDays(n) {
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    out.push({ key: dayKey(d), label: 'SMTWTFS'[d.getDay()], date: d });
  }
  return out;
}

// Consecutive checked days ending today (or yesterday, so an unlogged "today"
// doesn't zero the flame before bedtime).
function streakFor(daySet, days) {
  const today = days[days.length - 1].key;
  let count = 0;
  const now = new Date();
  for (let i = 0; ; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const k = dayKey(d);
    if (daySet.has(k)) count += 1;
    else if (k === today)
      continue; // today not logged yet — keep counting back
    else break;
  }
  return count;
}

// Local → cloud migration on first sign-in: re-home anonymous-era habits and
// checks onto the new user's implicit scope. Check ids carry no handle
// (check-<habitId>-<day>), so preserved _ids make retries idempotent. Members
// can't exist pre-login — drop strays.
const migrateHabitsDoc = (doc, handle) => {
  if (doc.type === 'habit' || doc.type === 'check') {
    return { ...doc, scopeId: 'default-' + handle, authorHandle: handle };
  }
  return null;
};

export default function App() {
  const { useDocument, useLiveQuery, database } = useFireproof(DB, {
    anonymousLocal: true,
    migrate: migrateHabitsDoc,
  });
  const { viewer, ViewerTag, HandleInput } = useViewer();
  const { can, ready, me } = useVibe(DB);

  const signedIn = !!viewer?.userHandle;
  const myHandle = me?.userHandle || viewer?.userHandle;
  const myScopeId = 'default-' + (myHandle || 'anon');

  const { doc: draft, merge: mergeDraft } = useDocument({ name: '' });
  const { docs: habitDocs } = useLiveQuery('type', { key: 'habit' });
  const { docs: checkDocs } = useLiveQuery('type', { key: 'check' });
  const { docs: memberDocs } = useLiveQuery('type', { key: 'member' });

  // Whose habits am I looking at? Mine, or a friend's who invited me.
  const [scopeChoice, setScopeChoiceState] = useState(() => {
    try {
      return localStorage.getItem('habits-live-scope') || 'mine';
    } catch {
      return 'mine';
    }
  });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const [deleteArmedId, setDeleteArmedId] = useState(null);

  // Re-derive "today" when the calendar day rolls over mid-session.
  const [todayTick, setTodayTick] = useState(() => dayKey(new Date()));
  useEffect(() => {
    const t = setInterval(() => {
      const k = dayKey(new Date());
      setTodayTick((prev) => (prev === k ? prev : k));
    }, 60_000);
    return () => clearInterval(t);
  }, []);
  const days = useMemo(() => lastDays(7), [todayTick]);
  const todayKey = days[days.length - 1].key;

  const sharedScopeIds = useMemo(() => {
    const ids = new Set();
    for (const m of memberDocs) {
      if (myHandle && m.userHandle === myHandle && m.scopeId && m.scopeId !== myScopeId)
        ids.add(m.scopeId);
    }
    return [...ids].sort();
  }, [memberDocs, myHandle, myScopeId]);

  const activeScopeId =
    scopeChoice === 'mine' || !sharedScopeIds.includes(scopeChoice) ? myScopeId : scopeChoice;
  const isMyScope = activeScopeId === myScopeId;
  const scopeOwnerHandle = activeScopeId.slice('default-'.length);

  function switchScope(choice) {
    setScopeChoiceState(choice);
    try {
      localStorage.setItem('habits-live-scope', choice);
    } catch {
      /* per-device nicety only */
    }
    setSheetOpen(false);
  }

  const habits = useMemo(
    () =>
      habitDocs
        .filter((h) => (h.scopeId || myScopeId) === activeScopeId)
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)),
    [habitDocs, activeScopeId, myScopeId]
  );
  // day-sets per habit, for dots and streaks.
  const checksByHabit = useMemo(() => {
    const by = new Map();
    for (const c of checkDocs) {
      if ((c.scopeId || myScopeId) !== activeScopeId || !c.habitId || !c.day) continue;
      let s = by.get(c.habitId);
      if (!s) by.set(c.habitId, (s = new Map()));
      s.set(c.day, c);
    }
    return by;
  }, [checkDocs, activeScopeId, myScopeId]);
  const viewers = memberDocs.filter((m) => m.scopeId === activeScopeId);

  // Viewers are read-only by construction (access.js); the UI mirrors that.
  const canWrite =
    isMyScope &&
    (signedIn
      ? ready && !!can.create({ type: 'habit', scopeId: myScopeId, authorHandle: myHandle }).ok
      : true);
  // Probe with a concrete userHandle — the fn validates the grantee id, so a
  // handle-less probe would throw instead of answering.
  const canInvite =
    signedIn && ready
      ? !!can.create({
          type: 'member',
          scopeId: myScopeId,
          userHandle: myHandle,
          addedBy: myHandle,
        }).ok
      : false;

  async function guarded(write) {
    try {
      setNotice(null);
      await write();
    } catch (e) {
      setNotice(
        signedIn
          ? e?.message || 'That change was not allowed.'
          : 'Sign in to keep using your habits on this device.'
      );
    }
  }

  async function addHabit(e) {
    e.preventDefault();
    const name = draft.name.trim();
    if (!name || !canWrite) return;
    mergeDraft({ name: '' });
    await guarded(() =>
      database.put({
        type: 'habit',
        name,
        scopeId: myScopeId,
        createdAt: Date.now(),
        authorHandle: myHandle,
      })
    );
  }

  // Toggle a day: deterministic _id makes this idempotent (a double-tap
  // overwrites, never duplicates), and delete un-logs the day.
  async function toggleDay(habit, key) {
    if (!canWrite) return;
    const existing = checksByHabit.get(habit._id)?.get(key);
    await guarded(() =>
      existing
        ? database.del(existing._id)
        : database.put({
            _id: `check-${habit._id}-${key}`,
            type: 'check',
            habitId: habit._id,
            day: key,
            scopeId: myScopeId,
            createdAt: Date.now(),
            authorHandle: myHandle,
          })
    );
  }

  // Two-tap delete sweeps the habit's checks (invisible orphans otherwise).
  async function deleteHabit(habit) {
    if (!canWrite) return;
    if (deleteArmedId !== habit._id) {
      setDeleteArmedId(habit._id);
      return;
    }
    setDeleteArmedId(null);
    const doomed = checkDocs.filter((c) => c.habitId === habit._id);
    await guarded(() =>
      Promise.all([...doomed.map((c) => database.del(c._id)), database.del(habit._id)])
    );
  }

  // `handle` arrives pre-sanitized from HandleInput (picked handles are real
  // users; raw entry is server-slug-sanitized), so no normalization here.
  async function addViewer(handle) {
    if (!handle || !canInvite) return;
    if (handle === myHandle || viewers.some((m) => m.userHandle === handle)) return;
    await guarded(() =>
      database.put({
        type: 'member',
        scopeId: myScopeId,
        userHandle: handle,
        addedBy: myHandle,
        createdAt: Date.now(),
      })
    );
  }

  async function removeViewer(m) {
    await guarded(() => database.del(m._id));
  }

  return (
    <div
      className="min-h-screen p-4 bg-[#e9ff70]"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23242424' fill-opacity='0.08'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
      }}
    >
      <div className="max-w-md mx-auto">
        <header className="mb-3 flex items-end justify-between px-1">
          <div>
            <span className="block text-[0.6rem] uppercase tracking-widest font-bold text-[#242424] opacity-60">
              Habits Live
            </span>
            <h1 className="text-xl md:text-3xl font-bold text-[#242424] leading-tight">
              {isMyScope ? 'My Habits' : `@${scopeOwnerHandle}'s habits`}
            </h1>
          </div>
          <button
            onClick={() => setSheetOpen(true)}
            className="min-h-[44px] px-3 bg-[#ffd670] border-4 border-[#242424] font-bold text-sm text-[#242424] active:bg-[#70d6ff]"
          >
            Friends{signedIn && viewers.length > 0 ? ` (${viewers.length})` : ''}
          </button>
        </header>

        {canWrite ? (
          <form
            onSubmit={addHabit}
            className="bg-[#ffffff] border-4 border-[#242424] p-3 mb-3 flex gap-2"
          >
            <input
              type="text"
              placeholder="Start a daily habit..."
              value={draft.name}
              onChange={(e) => mergeDraft({ name: e.target.value })}
              className="flex-1 min-w-0 min-h-[48px] p-3 border-4 border-[#242424] text-[#242424] placeholder-[#242424] placeholder-opacity-50 text-base"
            />
            <button
              type="submit"
              className="min-h-[48px] bg-[#70d6ff] border-4 border-[#242424] px-4 font-bold text-[#242424] active:bg-[#ff9770]"
            >
              Add
            </button>
          </form>
        ) : (
          !isMyScope && (
            <div className="bg-[#ffffff] border-4 border-[#242424] p-3 mb-3 text-center">
              <p className="font-bold text-[#242424] text-sm">
                Cheering @{scopeOwnerHandle} on — viewers can look, only they can log.
              </p>
            </div>
          )
        )}

        {notice && (
          <div className="bg-[#ff9770] border-4 border-[#242424] p-2 mb-3 text-center">
            <p className="font-bold text-[#242424] text-xs">{notice}</p>
          </div>
        )}

        <div className="space-y-3">
          {habits.length === 0 && (
            <div className="bg-[#ffffff] bg-opacity-70 border-4 border-[#242424] p-6 text-center">
              <p className="font-bold text-[#242424] opacity-70">
                {isMyScope
                  ? 'No habits yet — start one above. Check in daily to build a streak.'
                  : 'No habits here yet.'}
              </p>
            </div>
          )}
          {habits.map((habit) => {
            const dayMap = checksByHabit.get(habit._id) || new Map();
            const daySet = new Set(dayMap.keys());
            const streak = streakFor(daySet, days);
            const doneToday = daySet.has(todayKey);
            return (
              <div key={habit._id} className="bg-[#ffffff] border-4 border-[#242424] p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h3 className="font-bold text-[#242424] text-lg leading-tight flex-1">
                    {habit.name}
                  </h3>
                  <span
                    className={`shrink-0 text-sm font-bold px-2 py-0.5 border-2 border-[#242424] ${streak > 0 ? 'bg-[#ffd670]' : 'bg-[#ffffff] opacity-50'}`}
                  >
                    🔥 {streak}
                  </span>
                  {canWrite && (
                    <button
                      aria-label={`Delete ${habit.name}`}
                      onClick={() => deleteHabit(habit)}
                      className={`shrink-0 min-h-[32px] px-2 border-2 font-bold text-xs ${deleteArmedId === habit._id ? 'bg-[#d94f3d] text-white border-[#242424]' : 'border-[#d94f3d] text-[#d94f3d] bg-[#ffffff]'}`}
                    >
                      {deleteArmedId === habit._id ? 'Really?' : '✕'}
                    </button>
                  )}
                </div>
                {/* The week strip: last 7 days, today last. Tap a day to log or
                    fix it (yours only) — today's is the big one. */}
                <div className="flex gap-1.5 items-end">
                  {days.map((d) => {
                    const checked = daySet.has(d.key);
                    const isToday = d.key === todayKey;
                    return (
                      <button
                        key={d.key}
                        disabled={!canWrite}
                        onClick={() => toggleDay(habit, d.key)}
                        aria-label={`${habit.name} on ${d.key}`}
                        className={`border-[#242424] font-bold text-[#242424] flex flex-col items-center justify-center ${
                          isToday
                            ? 'flex-1 min-h-[52px] border-4 text-base'
                            : 'w-9 min-h-[44px] border-2 text-[0.6rem]'
                        } ${checked ? 'bg-[#e9ff70]' : 'bg-[#ffffff]'} ${!canWrite ? 'opacity-70' : 'active:bg-[#ffd670]'}`}
                      >
                        <span className="opacity-60">
                          {isToday ? (doneToday ? 'DONE TODAY ✓' : 'MARK TODAY') : d.label}
                        </span>
                        {!isToday && <span>{checked ? '✓' : '·'}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="pt-2 pb-20 text-center">
          {!signedIn && (
            <p className="text-xs font-bold text-[#242424] opacity-70">
              On this device — sign in to sync &amp; share your streaks
            </p>
          )}
        </div>
      </div>

      {/* Friends sheet — accountability viewers + the scope switcher, and
          (logged out) the sign-in upsell. pb-16 keeps taps clear of the host
          page's Vibes switch pill (#3076). */}
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
                  Your habits live on this device. Sign in to sync them everywhere and invite
                  friends to cheer your streaks — they see, you log.
                </p>
                <div className="flex justify-center py-1">
                  <ViewerTag />
                </div>
              </>
            ) : (
              <>
                <h3 className="font-bold text-[#242424] text-xs uppercase tracking-widest">
                  My accountability crew
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-[#242424] opacity-60 uppercase tracking-widest">
                    Viewers
                  </span>
                  {memberDocs.filter((m) => m.scopeId === myScopeId).length === 0 && (
                    <span className="text-sm font-bold text-[#242424] opacity-50">nobody yet</span>
                  )}
                  {memberDocs
                    .filter((m) => m.scopeId === myScopeId)
                    .map((m) => (
                      <span
                        key={m._id}
                        className="text-sm font-bold text-[#242424] bg-[#ffd670] border-2 border-[#242424] px-2 py-0.5 inline-flex items-center gap-1"
                      >
                        @{m.userHandle}
                        <button
                          aria-label={`Remove @${m.userHandle}`}
                          onClick={() => removeViewer(m)}
                          className="font-bold"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                </div>
                {canInvite && (
                  /* Platform people-picker: autocompletes handles you've
                     interacted with, then global matches. Inviting happens on
                     pick; the always-null value keeps the field ready for the
                     next viewer (the new member shows in the row above). */
                  <HandleInput
                    value={null}
                    onChange={addViewer}
                    placeholder="Invite a viewer..."
                    style={{
                      display: 'block',
                      '--border': '#242424',
                      '--card-bg': '#ffffff',
                      '--text': '#242424',
                      '--muted': '#5c5c5c',
                    }}
                  />
                )}
                {(sharedScopeIds.length > 0 || !isMyScope) && (
                  <>
                    <h3 className="font-bold text-[#242424] text-xs uppercase tracking-widest pt-1">
                      Watching
                    </h3>
                    <button
                      onClick={() => switchScope('mine')}
                      className={`w-full min-h-[44px] px-3 border-4 border-[#242424] font-bold text-left text-[#242424] ${isMyScope ? 'bg-[#e9ff70]' : 'bg-[#ffffff]'}`}
                    >
                      My Habits
                    </button>
                    {sharedScopeIds.map((id) => (
                      <button
                        key={id}
                        onClick={() => switchScope(id)}
                        className={`w-full min-h-[44px] px-3 border-4 border-[#242424] font-bold text-left text-[#242424] ${activeScopeId === id ? 'bg-[#e9ff70]' : 'bg-[#ffffff]'}`}
                      >
                        @{id.slice('default-'.length)}'s habits
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
