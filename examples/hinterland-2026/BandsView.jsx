import React from 'react';
import { fmtDate, fmtTime } from './festival-utils.js';
import { eventCardBg } from './styles.js';
import FavMark from './FavMark.jsx';

export default function BandsView({
  bandsList,
  myFavIds,
  canWrite,
  toggleFavorite,
  favCounts,
  superMode,
  c,
  database,
  userId,
}) {
  const toggleAllBand = async (band) => {
    const allFaved = band.events.every((e) => myFavIds.has(e.eventId));
    if (allFaved) {
      for (const e of band.events) {
        const favId = `favorite-${userId}-${e.eventId}`;
        await database.del(favId).catch(() => {});
      }
    } else {
      for (const e of band.events) {
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

  // Preferred display order for the lineup categories the feed ships (music/djs/family/
  // wellness/curation/literary as of 2026). Any *other* category the feed adds later is
  // still rendered — appended after these — so nothing silently drops off the page.
  const LINEUP_ORDER = ['music', 'djs', 'family', 'wellness', 'curation', 'literary'];
  const LINEUP_LABELS = {
    music: 'Music',
    djs: 'DJs',
    family: 'Family',
    wellness: 'Wellness',
    curation: 'Curation',
    literary: 'Literary',
  };
  const titleCase = (s) => s.replace(/(^|[\s-])\w/g, (m) => m.toUpperCase());
  const labelFor = (key) => LINEUP_LABELS[key] || titleCase(key);

  const grouped = {};
  for (const band of bandsList) {
    const key = band.lineup?.id || 'music';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(band);
  }
  // Known categories first (in preferred order), then any unrecognized ones present in
  // the data, sorted — never a hardcoded whitelist that could hide a new category.
  const orderedKeys = [
    ...LINEUP_ORDER.filter((key) => grouped[key]?.length > 0),
    ...Object.keys(grouped)
      .filter((key) => !LINEUP_ORDER.includes(key))
      .sort(),
  ];

  return (
    <div>
      <div className="flex items-center gap-[3px] mb-1.5 flex-wrap">
        <h2 className={`text-2xl font-black ${c.bodyText}`}>Bands ({bandsList.length})</h2>
        {orderedKeys.map((key) => (
          <button
            key={`nav-${key}`}
            onClick={() =>
              document
                .getElementById(`lineup-${key}`)
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
            className="px-2 py-1.5  m-0.5  font-black text-sm cursor-pointer hover:opacity-80 transition-all"
            style={{
              backgroundColor: grouped[key][0].lineup?.color || '#d7c57d',
              color: grouped[key][0].lineup?.textColor || '#000',
            }}
          >
            {labelFor(key)} ({grouped[key].length})
          </button>
        ))}
      </div>
      {orderedKeys.map((key) => (
        <div key={key} id={`lineup-${key}`} className="mb-2 scroll-mt-4">
          <h3
            className="text-lg font-black mb-[3px] px-2 py-1.5  m-0.5  inline-block"
            style={{
              backgroundColor: grouped[key][0].lineup?.color || '#d7c57d',
              color: grouped[key][0].lineup?.textColor || '#000',
            }}
          >
            {labelFor(key)} ({grouped[key].length})
          </h3>
          <div className="grid gap-[3px] mt-[3px]">
            {grouped[key].map((band) => {
              const allFaved = band.events.every((e) => myFavIds.has(e.eventId));
              const anyFav = band.events.some((e) => myFavIds.has(e.eventId));
              const lineupLabel = band.lineup?.id || 'music';
              const lineupColor = band.lineup?.color || '#d7c57d';
              const lineupText = band.lineup?.textColor || '#000';
              return (
                <div
                  key={band.title}
                  className={` m-0.5 p-2 shadow-lg ${eventCardBg}`}
                  style={{ '--lineup': lineupColor }}
                >
                  <div className="flex items-start gap-[3px]">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-0.5 mb-0.5 flex-wrap">
                        <h3 className={`text-xl font-black ${c.bodyText}`}>{band.title}</h3>
                        <span className="px-[3px] py-[1px]  text-xs font-black m-0.5  uppercase bg-[#EAD9C0] text-[#353329]">
                          {lineupLabel}
                        </span>
                        {superMode && band.events.some((e) => favCounts[e.eventId] > 0) && (
                          <span className={c.badge} title="Total picks across sets">
                            ★ {band.events.reduce((n, e) => n + (favCounts[e.eventId] || 0), 0)}
                          </span>
                        )}
                      </div>
                      <p className={`text-sm font-bold mb-0.5 text-[#FBF6EF]/80`}>
                        {band.venueList.join(' · ')}
                      </p>
                      <div className="space-y-[1px]">
                        {band.events.map((e) => (
                          <div
                            key={e.eventId}
                            className="flex items-center justify-between gap-0.5 flex-wrap"
                          >
                            <span className="text-sm font-bold text-[#FBF6EF]/90">
                              {fmtDate(e.start)} · {fmtTime(e.start)}–{fmtTime(e.end)} ·{' '}
                              {e.venueTitle}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-0.5">
                      {canWrite &&
                        band.events.map((e) => (
                          <button
                            key={`fav-${e.eventId}`}
                            onClick={() => toggleFavorite(e)}
                            className={myFavIds.has(e.eventId) ? c.favToggleOn : c.favToggleOff}
                            title={`${myFavIds.has(e.eventId) ? 'Remove' : 'Add'} ${band.title} — ${fmtDate(e.start)} ${fmtTime(e.start)}`}
                          >
                            <FavMark filled={myFavIds.has(e.eventId)} />
                          </button>
                        ))}
                      <a
                        href={band.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={c.linkBtn}
                        title="View on pickathon.com"
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
      ))}
    </div>
  );
}
