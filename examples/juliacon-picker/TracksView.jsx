import React from "react";
import { fmtDate, fmtTime } from "./festival-utils.js";
import { eventCardBg } from "./styles.js";

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

  const totalTalks = tracksList.reduce((n, t) => n + t.events.length, 0);

  return (
    <div>
      <div className="flex items-center gap-[3px] mb-1.5 flex-wrap">
        <h2 className={`text-2xl font-black ${c.bodyText}`}>
          Tracks ({tracksList.length}) · {totalTalks} talks
        </h2>
        {tracksList.map((track, idx) => (
          <button
            key={`nav-${track.title}`}
            onClick={() => document.getElementById(`track-${idx}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="px-2 py-1.5 rounded-xl m-0.5  font-black text-sm cursor-pointer hover:opacity-80 transition-all"
            style={{
              backgroundColor: track.lineup?.color || "#9558B2",
              color: track.lineup?.textColor || "#fff",
            }}
          >
            {track.title} ({track.events.length})
          </button>
        ))}
      </div>
      {tracksList.map((track, idx) => {
        const allFaved = track.events.every((e) => myFavIds.has(e.eventId));
        const anyFav = track.events.some((e) => myFavIds.has(e.eventId));
        const trackColor = track.lineup?.color || "#9558B2";
        const trackText = track.lineup?.textColor || "#fff";
        return (
          <div key={track.title} id={`track-${idx}`} className="mb-2 scroll-mt-4">
            <div className={`rounded-[16px] m-0.5 p-2 shadow-lg ${eventCardBg}`} style={{ "--lineup": trackColor }}>
              <div className="flex items-start gap-[3px]">
                {canWrite && (
                  <button
                    onClick={() => toggleAllTrack(track)}
                    title={allFaved ? "Remove every talk in this track" : "Favorite every talk in this track"}
                    className={`shrink-0 text-2xl p-1.5 rounded-2xl m-0.5  font-bold transition-all ${allFaved ? "bg-[#CB3C33] text-white hover:opacity-90" : anyFav ? "bg-[#CB3C33]/40 text-white hover:opacity-90" : "bg-white dark:bg-[#262031] text-[#2a2a2a] dark:text-[#ece9f1] hover:bg-[#ece4f3] dark:hover:bg-[#241a2e]"}`}
                  >
                    {allFaved ? "♥" : anyFav ? "◐" : "♡"}
                  </button>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-0.5 mb-0.5 flex-wrap">
                    <h3
                      className="text-lg font-black px-2 py-1.5 rounded-xl m-0.5  inline-block"
                      style={{ backgroundColor: trackColor, color: trackText }}
                    >
                      {track.title} ({track.events.length})
                    </h3>
                    {superMode && track.events.some((e) => favCounts[e.eventId] > 0) && (
                      <span className={c.badge} title="Total picks across the track">
                        ★ {track.events.reduce((n, e) => n + (favCounts[e.eventId] || 0), 0)}
                      </span>
                    )}
                  </div>
                  <p className={`text-sm font-bold mb-0.5 text-[#2a2a2a]/70 dark:text-[#ece9f1]/70`}>
                    {track.venueList.join(" · ")} · {track.events.length} talk{track.events.length > 1 ? "s" : ""}
                  </p>
                  <div className="space-y-[3px]">
                    {track.events.map((e) => (
                      <div key={e.eventId} className="flex items-start gap-0.5 flex-wrap">
                        {canWrite && (
                          <button
                            onClick={() => toggleFavorite(e)}
                            className={`text-sm px-0.5 py-[0.5px] rounded-lg m-0.5  font-bold transition-all ${myFavIds.has(e.eventId) ? "bg-[#CB3C33] text-white" : "bg-white dark:bg-[#262031] text-[#2a2a2a] dark:text-[#ece9f1] hover:bg-[#ece4f3] dark:hover:bg-[#241a2e]"}`}
                          >
                            {myFavIds.has(e.eventId) ? "♥" : "♡"}
                          </button>
                        )}
                        <div className="flex-1 min-w-0">
                          <span className={`font-black ${c.bodyText}`}>{e.title}</span>
                          {e.speakers && <p className="text-xs font-bold text-[#2a2a2a]/70 dark:text-[#ece9f1]/70">{e.speakers}</p>}
                          <p className={`text-sm font-bold ${c.bodyText}`}>
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
