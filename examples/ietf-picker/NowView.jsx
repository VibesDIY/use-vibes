import React from 'react';
import { MEETING_TZ, fmtTime, fmtDate } from './festival-utils.js';
import { lineupTag, eventCardStyle, eventCardBg } from './styles.js';

function EventCard({ event, isMine, isFriendPick, canWrite, toggleFavorite, c, showDate }) {
  const tag = lineupTag(event);
  return (
    <div className={`rounded-lg m-0.5 p-2 shadow-lg ${eventCardBg}`} style={eventCardStyle(event)}>
      <div className="flex justify-between items-start gap-[3px] flex-wrap">
        <div className="flex-1">
          <div className="flex items-center gap-0.5 mb-[1px] flex-wrap">
            <h4 className={`text-lg font-black ${c.bodyText}`}>{event.title}</h4>
            <span
              className="px-0.5 py-[0.5px] rounded-full text-xs font-black m-0.5 uppercase"
              style={{ backgroundColor: tag.color, color: tag.textColor }}
            >
              {tag.label}
            </span>
            {event.isBof && (
              <span className={c.badge} title="Birds of a Feather — a possible new working group">
                BOF
              </span>
            )}
            {isFriendPick && (
              <span className={c.badge} title="A friend favorited this">
                followed pick
              </span>
            )}
          </div>
          <p className={`text-sm font-bold ${c.bodyText}`}>
            {event.venueTitle} · {showDate ? `${fmtDate(event.start)} ` : ''}
            {fmtTime(event.start)}–{fmtTime(event.end)}
          </p>
        </div>
        {canWrite && (
          <button
            onClick={() => toggleFavorite(event)}
            className={isMine ? c.favToggleOn : c.favToggleOff}
          >
            {isMine ? '♥' : '♡'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function NowView({
  nowSessions,
  nextSessions,
  nowTick,
  myFavIds,
  friendFavIds,
  canWrite,
  toggleFavorite,
  c,
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5 flex-wrap gap-[3px]">
        <h2 className={`text-2xl font-black ${c.bodyText}`}>Right Now</h2>
        <p className={`text-sm font-bold ${c.bodyText}`}>
          {new Date(nowTick).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            timeZone: MEETING_TZ,
          })}{' '}
          Vienna time
        </p>
      </div>

      {nowSessions.length === 0 ? (
        <div className="mb-1.5 p-2 bg-white dark:bg-[#21262d] rounded-lg m-0.5">
          <p className={`font-bold ${c.bodyText}`}>No sessions are meeting right now.</p>
        </div>
      ) : (
        <div className="grid gap-[3px] mb-2">
          {nowSessions.map((event) => (
            <EventCard
              key={event.eventId}
              event={event}
              isMine={myFavIds.has(event.eventId)}
              isFriendPick={friendFavIds.has(event.eventId)}
              canWrite={canWrite}
              toggleFavorite={toggleFavorite}
              c={c}
              showDate={false}
            />
          ))}
        </div>
      )}

      <h3 className={`text-xl font-black mb-[3px] ${c.bodyText}`}>Up Next</h3>
      {nextSessions.length === 0 ? (
        <div className="p-2 bg-white dark:bg-[#21262d] rounded-lg m-0.5">
          <p className={`font-bold ${c.bodyText}`}>No more sessions scheduled.</p>
        </div>
      ) : (
        <div className="grid gap-[3px]">
          {nextSessions.map((event) => (
            <EventCard
              key={event.eventId}
              event={event}
              isMine={myFavIds.has(event.eventId)}
              isFriendPick={friendFavIds.has(event.eventId)}
              canWrite={canWrite}
              toggleFavorite={toggleFavorite}
              c={c}
              showDate={true}
            />
          ))}
        </div>
      )}
    </div>
  );
}
