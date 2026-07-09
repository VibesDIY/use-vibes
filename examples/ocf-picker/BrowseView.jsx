import React from 'react';
import { fmtTime } from './festival-utils.js';
import { lineupTag, eventCardStyle, eventCardBg } from './styles.js';
import NoteField from './NoteField.jsx';

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
  toggleFavorite,
  notes,
  saveNote,
  superMode,
  favCounts,
  c,
}) {
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap gap-1">
        <input
          type="text"
          placeholder="Search for artists & events..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={`flex-1 min-w-64 p-2 m-0.5 ${c.border} rounded-2xl text-lg font-bold ${c.bodyText}`}
        />
        <select
          value={selectedDay}
          onChange={(e) => setSelectedDay(e.target.value)}
          className={`p-2 m-0.5 ${c.border} rounded-2xl font-bold bg-[#efe4cf] dark:bg-[#1e1a12] ${c.bodyText}`}
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
          carry a fair-day `day` (4 AM cutoff), so a late set sorts under the right
          day. Ordered by the fair day order; empty days are skipped. */}
      {(() => {
        const byDay = {};
        for (const event of filteredEvents) {
          const day = event.day || '';
          (byDay[day] || (byDay[day] = [])).push(event);
        }
        const daysToShow = displayDays.filter((day) => byDay[day]?.length > 0);
        return daysToShow.map((day) => (
          <div key={day} className={c.schedDay}>
            <h3 className="text-xl font-black font-serif mb-1 text-white">
              {day} — {getDateForDay(day)}
            </h3>
            <div className="grid gap-1">
              {byDay[day].map((event) => {
                const tag = lineupTag(event);
                return (
                  <div
                    key={event.eventId}
                    className={`rounded-[16px] m-0.5 p-2 shadow-lg ${eventCardBg}`}
                    style={eventCardStyle(event)}
                  >
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-1">
                      <div className="flex-1">
                        <div className="flex items-center gap-0.5 mb-0.5 flex-wrap">
                          {superMode && favCounts[event.eventId] > 0 && (
                            <span className={c.badge} title="People who picked this">
                              ★ {favCounts[event.eventId]}
                            </span>
                          )}
                          <h3 className={`text-xl font-black ${c.bodyText}`}>{event.title}</h3>
                          <span
                            className="px-0.5 py-[0.5px] rounded-full text-xs font-black m-0.5  uppercase"
                            style={{ backgroundColor: tag.color, color: tag.textColor }}
                          >
                            {tag.label}
                          </span>
                        </div>
                        <div className={`space-y-[1px] text-sm font-bold ${c.bodyText}`}>
                          <p>{event.venueTitle}</p>
                          <p>
                            {fmtTime(event.start)} – {fmtTime(event.end)}
                          </p>
                        </div>
                        {event.description && (
                          <p className={`mt-0.5 text-sm ${c.bodyText}`}>{event.description}</p>
                        )}
                        {canWrite ? (
                          <NoteField
                            saved={notes[event.eventId]}
                            onSave={(t) => saveNote(event.eventId, t)}
                            className={c.noteArea}
                          />
                        ) : notes[event.eventId] ? (
                          <div className={c.noteBox}>
                            <p className={`text-sm font-bold ${c.bodyText}`}>
                              {notes[event.eventId]}
                            </p>
                          </div>
                        ) : null}
                      </div>
                      <div className="flex gap-0.5">
                        {canFavorite && (
                          <button
                            onClick={() => toggleFavorite(event)}
                            className={myFavIds.has(event.eventId) ? c.favToggleOn : c.favToggleOff}
                          >
                            {myFavIds.has(event.eventId) ? '♥' : '♡'}
                          </button>
                        )}
                        <a
                          href={event.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={c.linkBtn}
                          title="View artist page"
                        >
                          <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ));
      })()}

      {searchTerm && filteredEvents.length === 0 && (
        <div className="text-center py-3">
          <h3 className={`text-2xl font-black mb-0.5 ${c.bodyText}`}>No events found</h3>
          <p className={c.bodyText}>Try searching for a different artist or event</p>
        </div>
      )}
    </div>
  );
}
