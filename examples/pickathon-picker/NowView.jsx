import React from 'react';
import { FESTIVAL_TZ, fmtTime, fmtDate } from './festival-utils.js';
import EventListItem from './EventListItem.jsx';

export default function NowView({
  nowSets,
  nextSets,
  nowTick,
  myFavIds,
  friendPicksByEvent,
  ViewerTag,
  notes = {},
  superMode,
  favCounts = {},
  canWrite,
  // Load shedding: hearts stay legible but inert (loadshed.js).
  picksPaused,
  toggleFavorite,
  c,
}) {
  // Same list item as the All Events feed — only the meta line differs (the now
  // feed prints the set's own clock, since there is no time-slot label above it).
  const renderSet = (event, showDate) => (
    <EventListItem
      key={event.eventId}
      event={event}
      isMine={myFavIds.has(event.eventId)}
      canFavorite={canWrite}
      picksPaused={picksPaused}
      toggleFavorite={toggleFavorite}
      superMode={superMode}
      favCount={favCounts[event.eventId] || 0}
      friendPicks={(friendPicksByEvent && friendPicksByEvent.get(event.eventId)) || []}
      ViewerTag={ViewerTag}
      note={notes[event.eventId]}
      meta={`${event.venueTitle} · ${showDate ? `${fmtDate(event.start)} ` : ''}${fmtTime(event.start)}–${fmtTime(event.end)}`}
      c={c}
    />
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5 flex-wrap gap-[3px]">
        <h2 className={`text-2xl font-black ${c.bodyText}`}>Right Now</h2>
        <p className={`text-sm font-bold ${c.bodyText}`}>
          {new Date(nowTick).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            timeZone: FESTIVAL_TZ,
          })}{' '}
          festival time
        </p>
      </div>

      {nowSets.length === 0 ? (
        <div className="mb-1.5 p-2 bg-white dark:bg-[#22252d] rounded-2xl m-0.5 ">
          <p className={`font-bold ${c.bodyText}`}>Nothing is on stage right now.</p>
        </div>
      ) : (
        <div className="grid gap-1 mb-2">{nowSets.map((event) => renderSet(event, false))}</div>
      )}

      <h3 className={`text-xl font-black mb-[3px] ${c.bodyText}`}>Up Next</h3>
      {nextSets.length === 0 ? (
        <div className="p-2 bg-white dark:bg-[#22252d] rounded-2xl m-0.5 ">
          <p className={`font-bold ${c.bodyText}`}>No more sets scheduled.</p>
        </div>
      ) : (
        <div className="grid gap-1">{nextSets.map((event) => renderSet(event, true))}</div>
      )}
    </div>
  );
}
