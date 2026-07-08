import React from 'react';
import { fmtDate, fmtTime } from './festival-utils.js';
import { eventCardBg } from './styles.js';

export default function GroupsView({
  groupsList,
  myFavIds,
  canWrite,
  toggleFavorite,
  favCounts,
  superMode,
  c,
  database,
  userId,
}) {
  const toggleAllGroup = async (group) => {
    const allFaved = group.events.every((e) => myFavIds.has(e.eventId));
    if (allFaved) {
      for (const e of group.events) {
        const favId = `favorite-${userId}-${e.eventId}`;
        await database.del(favId).catch(() => {});
      }
    } else {
      for (const e of group.events) {
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

  // Preferred display order: the IETF areas the datatracker ships, then IRTF. Any
  // *other* bucket the feed adds later (teams, directorates, admin sessions carry
  // their group type instead of an area) is still rendered — appended after these —
  // so nothing silently drops off the page.
  const AREA_ORDER = ['art', 'gen', 'int', 'ops', 'rtg', 'sec', 'wit', 'irtf'];
  // Area/bucket ids are acronyms — label them as the datatracker does, uppercase.
  const labelFor = (key) => key.toUpperCase();

  const grouped = {};
  for (const group of groupsList) {
    const key = group.lineup?.id || 'other';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(group);
  }
  // Known areas first (in preferred order), then any unrecognized buckets present in
  // the data, sorted — never a hardcoded whitelist that could hide a new bucket.
  const orderedKeys = [
    ...AREA_ORDER.filter((key) => grouped[key]?.length > 0),
    ...Object.keys(grouped)
      .filter((key) => !AREA_ORDER.includes(key))
      .sort(),
  ];

  return (
    <div>
      <div className="flex items-center gap-[3px] mb-1.5 flex-wrap">
        <h2 className={`text-2xl font-black ${c.bodyText}`}>Groups ({groupsList.length})</h2>
        {orderedKeys.map((key) => (
          <button
            key={`nav-${key}`}
            onClick={() =>
              document
                .getElementById(`area-${key}`)
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
            className="px-2 py-1.5 rounded-md m-0.5 font-black text-sm cursor-pointer hover:opacity-80 transition-all"
            style={{
              backgroundColor: grouped[key][0].lineup?.color || '#34495e',
              color: grouped[key][0].lineup?.textColor || '#fff',
            }}
          >
            {labelFor(key)} ({grouped[key].length})
          </button>
        ))}
      </div>
      {orderedKeys.map((key) => (
        <div key={key} id={`area-${key}`} className="mb-2 scroll-mt-4">
          <h3
            className="text-lg font-black mb-[3px] px-2 py-1.5 rounded-md m-0.5 inline-block"
            style={{
              backgroundColor: grouped[key][0].lineup?.color || '#34495e',
              color: grouped[key][0].lineup?.textColor || '#fff',
            }}
          >
            {labelFor(key)} ({grouped[key].length})
          </h3>
          <div className="grid gap-[3px] mt-[3px]">
            {grouped[key].map((group) => {
              const allFaved = group.events.every((e) => myFavIds.has(e.eventId));
              const anyFav = group.events.some((e) => myFavIds.has(e.eventId));
              const areaLabel = group.lineup?.id || 'other';
              const areaColor = group.lineup?.color || '#34495e';
              const areaText = group.lineup?.textColor || '#fff';
              return (
                <div
                  key={group.acronym}
                  className={`rounded-lg m-0.5 p-2 shadow-lg ${eventCardBg}`}
                  style={{ '--lineup': areaColor }}
                >
                  <div className="flex items-start gap-[3px]">
                    {canWrite && (
                      <button
                        onClick={() => toggleAllGroup(group)}
                        className={`shrink-0 text-2xl p-1.5 rounded-lg m-0.5 font-bold transition-all ${allFaved ? 'bg-[#b45309] text-white hover:opacity-90' : anyFav ? 'bg-[#b45309]/40 text-white hover:opacity-90' : 'bg-white dark:bg-[#21262d] text-[#1f2328] dark:text-[#e6edf3] hover:bg-[#e9eef5] dark:hover:bg-[#101826]'}`}
                      >
                        {allFaved ? '♥' : anyFav ? '◐' : '♡'}
                      </button>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-0.5 mb-0.5 flex-wrap">
                        <h3 className={`text-xl font-black ${c.bodyText}`}>{group.acronym}</h3>
                        <span className={`text-base font-bold ${c.bodyText}`}>{group.name}</span>
                        <span
                          className="px-[3px] py-[1px] rounded-full text-xs font-black m-0.5 uppercase"
                          style={{ backgroundColor: areaColor, color: areaText }}
                        >
                          {areaLabel}
                        </span>
                        {group.isBof && (
                          <span
                            className={c.badge}
                            title="Birds of a Feather — a possible new working group"
                          >
                            BOF
                          </span>
                        )}
                        {superMode && group.events.some((e) => favCounts[e.eventId] > 0) && (
                          <span className={c.badge} title="Total picks across sessions">
                            ★ {group.events.reduce((n, e) => n + (favCounts[e.eventId] || 0), 0)}
                          </span>
                        )}
                      </div>
                      <p
                        className={`text-sm font-bold mb-0.5 text-[#1f2328]/70 dark:text-[#e6edf3]/70`}
                      >
                        {group.venueList.join(' · ')} · {group.events.length} session
                        {group.events.length > 1 ? 's' : ''}
                      </p>
                      <div className="space-y-[1px]">
                        {group.events.map((e) => (
                          <div key={e.eventId} className="flex items-center gap-0.5 flex-wrap">
                            {canWrite && (
                              <button
                                onClick={() => toggleFavorite(e)}
                                className={`text-sm px-0.5 py-[0.5px] rounded-md m-0.5 font-bold transition-all ${myFavIds.has(e.eventId) ? 'bg-[#b45309] text-white' : 'bg-white dark:bg-[#21262d] text-[#1f2328] dark:text-[#e6edf3] hover:bg-[#e9eef5] dark:hover:bg-[#101826]'}`}
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
                      href={group.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={c.linkBtn}
                      title="View on datatracker.ietf.org"
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
