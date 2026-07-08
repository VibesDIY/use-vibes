import React from 'react';
import { fmtDate, fmtTime } from './festival-utils.js';
import { eventCardBg } from './styles.js';

export default function ArtistsView({
  artistsList,
  myFavIds,
  canWrite,
  toggleFavorite,
  favCounts,
  superMode,
  c,
  database,
  userId,
}) {
  const toggleAllArtist = async (artist) => {
    const allFaved = artist.events.every((e) => myFavIds.has(e.eventId));
    if (allFaved) {
      for (const e of artist.events) {
        const favId = `favorite-${userId}-${e.eventId}`;
        await database.del(favId).catch(() => {});
      }
    } else {
      for (const e of artist.events) {
        if (!myFavIds.has(e.eventId)) {
          await database.put({
            _id: `favorite-${userId}-${e.eventId}`,
            type: 'favorite',
            eventId: e.eventId,
            userId,
          });
        }
      }
    }
  };

  // Preferred display order for the six lineup genres the page ships (lineup.id
  // is the display label). Multi-genre combos ("Dance, Movement, Music") and any
  // genre the page adds later are still rendered — appended after these, sorted —
  // so nothing silently drops off the page.
  const LINEUP_ORDER = ['Music', 'Vaudeville', 'Spoken Word', 'Movement', 'Workshop', 'Ambiance'];

  const grouped = {};
  for (const artist of artistsList) {
    const key = artist.lineup?.id || 'Event';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(artist);
  }
  // Known genres first (in preferred order), then any unrecognized ones present in
  // the data, sorted — never a hardcoded whitelist that could hide a new genre.
  const orderedKeys = [
    ...LINEUP_ORDER.filter((key) => grouped[key]?.length > 0),
    ...Object.keys(grouped)
      .filter((key) => !LINEUP_ORDER.includes(key))
      .sort(),
  ];

  return (
    <div>
      <div className="flex items-center gap-[3px] mb-1.5 flex-wrap">
        <h2 className={`text-2xl font-black font-serif ${c.bodyText}`}>
          Artists ({artistsList.length})
        </h2>
        {orderedKeys.map((key) => (
          <button
            key={`nav-${key}`}
            onClick={() =>
              document
                .getElementById(`lineup-${key}`)
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
            className="px-2 py-1.5 rounded-xl m-0.5  font-black text-sm cursor-pointer hover:opacity-80 transition-all text-white"
            style={{ backgroundColor: grouped[key][0].lineup?.color || '#8a8378' }}
          >
            {key} ({grouped[key].length})
          </button>
        ))}
      </div>
      {orderedKeys.map((key) => (
        <div key={key} id={`lineup-${key}`} className="mb-2 scroll-mt-4">
          <h3
            className="text-lg font-black font-serif mb-[3px] px-2 py-1.5 rounded-xl m-0.5  inline-block text-white"
            style={{ backgroundColor: grouped[key][0].lineup?.color || '#8a8378' }}
          >
            {key} ({grouped[key].length})
          </h3>
          <div className="grid gap-[3px] mt-[3px]">
            {grouped[key].map((artist) => {
              const allFaved = artist.events.every((e) => myFavIds.has(e.eventId));
              const anyFav = artist.events.some((e) => myFavIds.has(e.eventId));
              const lineupLabel = artist.lineup?.id || 'Event';
              const lineupColor = artist.lineup?.color || '#8a8378';
              return (
                <div
                  key={artist.title}
                  className={`rounded-[16px] m-0.5 p-2 shadow-lg ${eventCardBg}`}
                  style={{ '--lineup': lineupColor }}
                >
                  <div className="flex items-start gap-[3px]">
                    {canWrite && (
                      <button
                        onClick={() => toggleAllArtist(artist)}
                        className={`shrink-0 text-2xl p-1.5 rounded-2xl m-0.5  font-bold transition-all ${allFaved ? 'bg-[#d95931] text-white hover:opacity-90' : anyFav ? 'bg-[#d95931]/40 text-white hover:opacity-90' : 'bg-[#efe4cf] dark:bg-[#1e1a12] text-[#3a2f28] dark:text-[#f0e9df] hover:bg-[#f7e8d8] dark:hover:bg-[#241c10]'}`}
                        title={
                          allFaved
                            ? "Remove all this artist's sets"
                            : "Favorite all this artist's sets"
                        }
                      >
                        {allFaved ? '♥' : anyFav ? '◐' : '♡'}
                      </button>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-0.5 mb-0.5 flex-wrap">
                        <h3 className={`text-xl font-black ${c.bodyText}`}>{artist.title}</h3>
                        <span
                          className="px-[3px] py-[1px] rounded-full text-xs font-black m-0.5  uppercase text-white"
                          style={{ backgroundColor: lineupColor }}
                        >
                          {lineupLabel}
                        </span>
                        {superMode && artist.events.some((e) => favCounts[e.eventId] > 0) && (
                          <span className={c.badge} title="Total picks across sets">
                            ★ {artist.events.reduce((n, e) => n + (favCounts[e.eventId] || 0), 0)}
                          </span>
                        )}
                      </div>
                      <p
                        className={`text-sm font-bold mb-0.5 text-[#3a2f28]/70 dark:text-[#f0e9df]/70`}
                      >
                        {artist.venueList.join(' · ')} · {artist.events.length} set
                        {artist.events.length > 1 ? 's' : ''}
                      </p>
                      <div className="space-y-[1px]">
                        {artist.events.map((e) => (
                          <div key={e.eventId} className="flex items-center gap-0.5 flex-wrap">
                            {canWrite && (
                              <button
                                onClick={() => toggleFavorite(e)}
                                className={`text-sm px-0.5 py-[0.5px] rounded-lg m-0.5  font-bold transition-all ${myFavIds.has(e.eventId) ? 'bg-[#d95931] text-white' : 'bg-[#efe4cf] dark:bg-[#1e1a12] text-[#3a2f28] dark:text-[#f0e9df] hover:bg-[#f7e8d8] dark:hover:bg-[#241c10]'}`}
                              >
                                {myFavIds.has(e.eventId) ? '♥' : '♡'}
                              </button>
                            )}
                            <span className={`text-sm font-bold ${c.bodyText}`}>
                              {fmtDate(e.start)} · {fmtTime(e.start)}–{fmtTime(e.end)} ·{' '}
                              {e.venueTitle}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <a
                      href={artist.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={c.linkBtn}
                      title="View on oregoncountryfair.org"
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
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
