import React from "react";
import { FESTIVAL_TZ, fmtTime, fmtDate } from "./festival-utils.js";
import { lineupTag, eventCardStyle, eventCardBg } from "./styles.js";

function EventCard({ event, isMine, isFriendPick, canWrite, toggleFavorite, c, showDate }) {
  const tag = lineupTag(event);
  return (
    <div className={`rounded-[16px] m-0.5 p-2 shadow-lg ${eventCardBg}`} style={eventCardStyle(event)}>
      <div className="flex justify-between items-start gap-[3px] flex-wrap">
        <div className="flex-1">
          <div className="flex items-center gap-0.5 mb-[1px] flex-wrap">
            <h4 className={`text-lg font-black ${c.bodyText}`}>{event.title}</h4>
            <span
              className="px-0.5 py-[0.5px] rounded-full text-xs font-black m-0.5"
              style={{ backgroundColor: tag.color, color: tag.textColor }}
            >
              {tag.label}
            </span>
            {isFriendPick && (
              <span className={c.badge} title="A friend favorited this">
                friend pick
              </span>
            )}
          </div>
          {event.speakers && <p className={`text-sm font-bold text-[#22303c]/70 dark:text-[#e4edf5]/70`}>{event.speakers}</p>}
          <p className={`text-sm font-bold ${c.bodyText}`}>
            {event.venueTitle} · {showDate ? `${fmtDate(event.start)} ` : ""}
            {fmtTime(event.start)}–{fmtTime(event.end)}
          </p>
        </div>
        {canWrite && (
          <button onClick={() => toggleFavorite(event)} className={isMine ? c.favToggleOn : c.favToggleOff}>
            {isMine ? "♥" : "♡"}
          </button>
        )}
      </div>
    </div>
  );
}

export default function NowView({ nowSets, nextSets, nowTick, myFavIds, friendFavIds, canWrite, toggleFavorite, c }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5 flex-wrap gap-[3px]">
        <h2 className={`text-2xl font-black ${c.bodyText}`}>Right Now</h2>
        <p className={`text-sm font-bold ${c.bodyText}`}>
          {new Date(nowTick).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: FESTIVAL_TZ })} conference
          time
        </p>
      </div>

      {nowSets.length === 0 ? (
        <div className="mb-1.5 p-2 bg-white dark:bg-[#15202b] rounded-2xl m-0.5">
          <p className={`font-bold ${c.bodyText}`}>Nothing is on right now.</p>
        </div>
      ) : (
        <div className="grid gap-[3px] mb-2">
          {nowSets.map((event) => (
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
      {nextSets.length === 0 ? (
        <div className="p-2 bg-white dark:bg-[#15202b] rounded-2xl m-0.5">
          <p className={`font-bold ${c.bodyText}`}>No more talks scheduled.</p>
        </div>
      ) : (
        <div className="grid gap-[3px]">
          {nextSets.map((event) => (
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
