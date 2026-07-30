import React, { useMemo, useRef, useEffect } from 'react';
import { fmtTime, toFestivalDate } from './festival-utils.js';
import { groupEventsByTimeSlot } from './schedule-build.js';
import EventListItem from './EventListItem.jsx';

export default function BrowseView({
  filteredEvents,
  searchTerm,
  setSearchTerm,
  selectedDay,
  setSelectedDay,
  displayDays,
  getDateForDay,
  myFavIds,
  canWrite,
  canFavorite,
  // Load shedding: the heart still shows your pick state, it just can't be
  // flipped right now (loadshed.js). Inert, never hidden.
  picksPaused,
  toggleFavorite,
  notes,
  saveNote,
  superMode,
  favCounts,
  friendPicksByEvent,
  ViewerTag,
  nowTick,
  c,
}) {
  // The event to land on when the page first opens: whatever is on now, else the
  // next one still to come (during the festival), so you open onto the current
  // moment. `nowTick` ticks each minute but the scroll fires once (didScrollRef).
  const nowMs = nowTick || 0;
  const nowTargetId = useMemo(() => {
    let upcomingId = null;
    let upcomingMs = Infinity;
    let lastId = null;
    let lastMs = -Infinity;
    let earliestMs = Infinity;
    for (const e of filteredEvents) {
      const startMs = toFestivalDate(e.start).getTime();
      const endMs = toFestivalDate(e.end).getTime();
      if (startMs < earliestMs) earliestMs = startMs;
      if (endMs >= nowMs && startMs < upcomingMs) {
        upcomingId = e.eventId;
        upcomingMs = startMs;
      }
      if (startMs > lastMs) {
        lastId = e.eventId;
        lastMs = startMs;
      }
    }
    // Before the festival starts (now is earlier than every set) there is no
    // "now" to jump to — stay at the top so the search/day controls stay in view.
    if (nowMs < earliestMs) return null;
    return upcomingId || lastId;
  }, [filteredEvents, nowMs]);

  const targetRef = useRef(null);
  const didScrollRef = useRef(false);
  useEffect(() => {
    if (didScrollRef.current || !nowTargetId || !targetRef.current) return;
    // Only auto-scroll the pristine, unfiltered list — never yank the view while
    // someone is actively searching or day-filtering.
    if (selectedDay !== 'all' || searchTerm) return;
    targetRef.current.scrollIntoView({ block: 'start', behavior: 'auto' });
    didScrollRef.current = true;
  }, [nowTargetId, filteredEvents.length, selectedDay, searchTerm]);

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap gap-1">
        <input
          type="text"
          placeholder="Search for artists..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={`flex-1 min-w-64 p-2 m-0.5 ${c.border} rounded-2xl text-lg font-bold ${c.bodyText}`}
        />
        <select
          value={selectedDay}
          onChange={(e) => setSelectedDay(e.target.value)}
          className={`p-2 m-0.5 ${c.border} rounded-2xl font-bold bg-white dark:bg-[#22252d] ${c.bodyText}`}
        >
          <option value="all">All Days</option>
          {displayDays.map((day) => (
            <option key={day} value={day}>
              {day}
            </option>
          ))}
        </select>
      </div>

      {/* Group into per-day sections with headers, matching the My Faves page. Events
          carry a festival-night `day` (4 AM cutoff), so a late set sorts under the
          right night. Ordered by the festival day order; empty days are skipped. */}
      {(() => {
        const byDay = {};
        for (const event of filteredEvents) {
          const day = event.day || '';
          (byDay[day] || (byDay[day] = [])).push(event);
        }
        const daysToShow = displayDays.filter((day) => byDay[day]?.length > 0);
        return daysToShow.map((day) => (
          <div key={day} className={c.schedDay}>
            <h3 className="text-xl font-black mb-1 px-[14px] text-white">
              {day} — {getDateForDay(day)}
            </h3>
            {/* Time slots: the time prints once as a label on the green and the cards
                under it carry only what differs. Groups form on the FILTERED list, so a
                search narrows the day and the labels regroup with it. */}
            {groupEventsByTimeSlot(byDay[day]).map((group) => (
              <div key={group.key}>
                {/* Slot labels hug the container edge; only the day header keeps the 14px indent. */}
                <div className="px-[5px] pt-0.5 text-base font-black text-white">
                  {fmtTime(group.start)}
                  {group.end ? ` – ${fmtTime(group.end)}` : ''}
                </div>
                <div className="grid gap-1">
              {group.items.map((event) => {
                const friendPicks =
                  (friendPicksByEvent && friendPicksByEvent.get(event.eventId)) || [];
                return (
                  <EventListItem
                    key={event.eventId}
                    itemRef={event.eventId === nowTargetId ? targetRef : null}
                    event={event}
                    isMine={myFavIds.has(event.eventId)}
                    canFavorite={canFavorite}
                    picksPaused={picksPaused}
                    toggleFavorite={toggleFavorite}
                    superMode={superMode}
                    favCount={favCounts[event.eventId] || 0}
                    friendPicks={friendPicks}
                    ViewerTag={ViewerTag}
                    note={notes[event.eventId]}
                    meta={`${event.venueTitle}${group.end ? '' : ` · until ${fmtTime(event.end)}`}`}
                    c={c}
                  />
                );
              })}
                </div>
              </div>
            ))}
          </div>
        ));
      })()}

      {searchTerm && filteredEvents.length === 0 && (
        <div className="text-center py-3">
          <h3 className={`text-2xl font-black mb-0.5 ${c.bodyText}`}>No events found</h3>
          <p className={c.bodyText}>Try searching for a different artist name</p>
        </div>
      )}
    </div>
  );
}
