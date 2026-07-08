import React from "react";
import { fmtDate, fmtTime } from "./festival-utils.js";
import { eventCardBg } from "./styles.js";

// Anchor ids need a URL-safe form of the track name ("Data Analysis & Data Model"
// has spaces and an ampersand).
const trackSlug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

export default function TracksView({ tracksList, myFavIds, canWrite, toggleFavorite, favCounts, superMode, c, database, userId }) {
  const toggleAllTrack = async (track) => {
    const allFaved = track.events.every((e) => myFavIds.has(e.eventId));
    if (allFaved) {
      for (const e of track.events) {
        const favId = `favorite-${userId}-${e.eventId}`;
        await database.del(favId).catch(() => {});
      }
    } else {
      for (const e of track.events) {
        if (!myFavIds.has(e.eventId)) {
          await database.put({
            _id: `favorite-${userId}-${e.eventId}`,
            type: "favorite",
            eventId: e.eventId,
            userId,
          });
        }
      }
    }
  };

  return (
    <div>
      <div className="flex items-center gap-[3px] mb-1.5 flex-wrap">
        <h2 className={`text-2xl font-black ${c.bodyText}`}>Tracks ({tracksList.length})</h2>
        {tracksList.map((track) => (
          <button
            key={`nav-${track.title}`}
            onClick={() =>
              document.getElementById(`track-${trackSlug(track.title)}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
            className="px-2 py-1.5 rounded-xl m-0.5  font-black text-sm cursor-pointer hover:opacity-80 transition-all text-white"
            style={{ backgroundColor: track.lineup?.color || "#4c7a34" }}
          >
            {track.title} ({track.events.length})
          </button>
        ))}
      </div>
      {tracksList.map((track) => {
        const allFaved = track.events.every((e) => myFavIds.has(e.eventId));
        const anyFav = track.events.some((e) => myFavIds.has(e.eventId));
        const trackColor = track.lineup?.color || "#4c7a34";
        return (
          <div key={track.title} id={`track-${trackSlug(track.title)}`} className="mb-2 scroll-mt-4">
            <h3
              className="text-lg font-black mb-[3px] px-2 py-1.5 rounded-xl m-0.5  inline-block text-white"
              style={{ backgroundColor: trackColor }}
            >
              {track.title} ({track.events.length})
            </h3>
            <div className={`rounded-[16px] m-0.5 p-2 shadow-lg ${eventCardBg}`} style={{ "--lineup": trackColor }}>
              <div className="flex items-start gap-[3px]">
                {canWrite && (
                  <button
                    onClick={() => toggleAllTrack(track)}
                    title={allFaved ? "Remove every talk in this track" : "Favorite every talk in this track"}
                    className={`shrink-0 text-2xl p-1.5 rounded-2xl m-0.5  font-bold transition-all ${allFaved ? "bg-[#2d6a8f] text-white hover:opacity-90" : anyFav ? "bg-[#2d6a8f]/40 text-white hover:opacity-90" : "bg-white dark:bg-[#1b2913] text-[#2b3a24] dark:text-[#e9f0e3] hover:bg-[#d8e8c8] dark:hover:bg-[#16220e]"}`}
                  >
                    {allFaved ? "♥" : anyFav ? "◐" : "♡"}
                  </button>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-0.5 mb-0.5 flex-wrap">
                    <p className={`text-sm font-bold text-[#2b3a24]/70 dark:text-[#e9f0e3]/70`}>
                      {track.venueList.join(" · ")} · {track.events.length} talk{track.events.length > 1 ? "s" : ""}
                    </p>
                    {superMode && track.events.some((e) => favCounts[e.eventId] > 0) && (
                      <span className={c.badge} title="Total picks across this track">
                        ★ {track.events.reduce((n, e) => n + (favCounts[e.eventId] || 0), 0)}
                      </span>
                    )}
                  </div>
                  <div className="space-y-[3px]">
                    {track.events.map((e) => (
                      <div key={e.eventId} className="flex items-start gap-0.5 flex-wrap">
                        {canWrite && (
                          <button
                            onClick={() => toggleFavorite(e)}
                            className={`text-sm px-0.5 py-[0.5px] rounded-lg m-0.5  font-bold transition-all ${myFavIds.has(e.eventId) ? "bg-[#2d6a8f] text-white" : "bg-white dark:bg-[#1b2913] text-[#2b3a24] dark:text-[#e9f0e3] hover:bg-[#d8e8c8] dark:hover:bg-[#16220e]"}`}
                          >
                            {myFavIds.has(e.eventId) ? "♥" : "♡"}
                          </button>
                        )}
                        <div className="flex-1 min-w-0">
                          <span className={`text-sm font-black ${c.bodyText}`}>{e.title}</span>
                          {e.speakers && (
                            <span className={`text-sm font-bold text-[#2b3a24]/70 dark:text-[#e9f0e3]/70`}> — {e.speakers}</span>
                          )}
                          <p className={`text-sm font-bold text-[#2b3a24]/70 dark:text-[#e9f0e3]/70`}>
                            {fmtDate(e.start)} · {fmtTime(e.start)}–{fmtTime(e.end)} · {e.venueTitle}
                          </p>
                        </div>
                        <a href={e.url} target="_blank" rel="noopener noreferrer" className={c.linkBtn} title="View on pretalx.com">
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
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
