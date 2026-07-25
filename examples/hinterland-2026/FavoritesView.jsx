import React from 'react';
import { fmtTime, fmtDate } from './festival-utils.js';
import { lineupTag, eventCardStyle, eventCardBg } from './styles.js';
import FavMark from './FavMark.jsx';

export default function FavoritesView({
  favoriteEvents,
  favUsers,
  viewingUser,
  setViewingUser,
  userId,
  myFavIds,
  canWrite,
  toggleFavorite,
  notes,
  ViewerTag,
  c,
}) {
  return (
    <div>
      <div className="mb-1.5 p-2 bg-[#403D31]  m-0.5 ">
        <div className="flex items-center justify-between mb-[3px] flex-wrap gap-0.5">
          <h3 className={`text-lg font-black ${c.bodyText}`}>
            {viewingUser ? `Viewing ${viewingUser}'s picks` : 'Pickers (tap to view their picks)'}
          </h3>
          {viewingUser && (
            <button onClick={() => setViewingUser(null)} className={c.btnCyan}>
              Back to my picks
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-0.5">
          {favUsers.map((u) => (
            <button
              key={u.userId}
              onClick={() => setViewingUser(u.userId === userId ? null : u.userId)}
              className={`flex items-center gap-0.5 p-[1px]  m-0.5  transition-all ${viewingUser === u.userId || (!viewingUser && u.userId === userId) ? 'bg-[#C8613C]' : 'bg-[#403D31] hover:bg-[#3BB683] '}`}
              title={`${u.count} pick${u.count === 1 ? '' : 's'}`}
            >
              <ViewerTag userHandle={u.userId} />
              <span className={`pr-[3px] font-bold text-sm ${c.bodyText}`}>{u.count}</span>
            </button>
          ))}
        </div>
      </div>

      <h2 className={`text-2xl font-black mb-1.5 ${c.bodyText}`}>Favorite Events</h2>
      {favoriteEvents.length === 0 ? (
        <div className="text-center py-3">
          <h3 className={`text-2xl font-black mb-0.5 ${c.bodyText}`}>No favorites yet!</h3>
        </div>
      ) : (
        <div className="grid gap-1">
          {favoriteEvents.map((event) => {
            const tag = lineupTag(event);
            return (
              <div
                key={event.eventId}
                className={` m-0.5 p-2 shadow-lg ${eventCardBg}`}
                style={eventCardStyle(event)}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-0.5 mb-[1px] flex-wrap">
                      <h3 className={`text-xl font-black ${c.bodyText}`}>{event.title}</h3>
                      <span className="px-0.5 py-[0.5px]  text-xs font-black m-0.5  uppercase bg-[#EAD9C0] text-[#353329]">
                        {tag.label}
                      </span>
                    </div>
                    <div className={`space-y-[1px] text-sm font-bold ${c.bodyText}`}>
                      <p>{event.venueTitle}</p>
                      <p>{fmtDate(event.start)}</p>
                      <p>
                        {fmtTime(event.start)} – {fmtTime(event.end)}
                      </p>
                    </div>
                    {notes[event.eventId] && (
                      <div className={c.noteBox}>
                        <p className={`text-sm font-bold ${c.bodyText}`}>{notes[event.eventId]}</p>
                      </div>
                    )}
                  </div>
                  {canWrite && (
                    <button onClick={() => toggleFavorite(event)} className={c.favToggleOn}>
                      <span className="text-lg">
                        <FavMark filled />
                      </span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
