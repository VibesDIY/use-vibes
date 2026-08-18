import React from 'react';
import { HeartIcon, StarIcon } from './icons.jsx';
import { lineupTag, eventCardStyle, eventCardBg } from './styles.js';

// The one card shape every event feed uses. Extracted from the All Events browse
// list so "Right Now" renders identical items rather than a near-copy that drifts
// — same title/tag line, same meta line, same heart, same followed-pick chips and
// saved note. The only per-feed difference is the `meta` line the caller composes
// (browse prints "venue · until <end>"; now prints "venue · date time–time").
export default function EventListItem({
  event,
  isMine,
  canFavorite,
  picksPaused,
  toggleFavorite,
  superMode,
  favCount = 0,
  friendPicks = [],
  ViewerTag,
  note,
  meta,
  c,
  itemRef,
}) {
  const tag = lineupTag(event);
  return (
    <div
      ref={itemRef || null}
      className={`rounded-[16px] m-0.5 p-2 shadow-lg ${eventCardBg}`}
      style={eventCardStyle(event)}
    >
      <div>
        <div className="flex items-center gap-0.5 mb-0.5 flex-wrap">
          {superMode && favCount > 0 && (
            <span
              className={`${c.badge} inline-flex items-center gap-0.5`}
              title="People who picked this"
            >
              <StarIcon size={12} /> {favCount}
            </span>
          )}
          <h3 className={`text-xl font-black ${c.bodyText}`}>{event.title}</h3>
          <span className="px-0.5 py-[0.5px] rounded-full text-xs font-black m-0.5  uppercase bg-[#BACD32] text-[#4A4A4A]">
            {tag.label}
          </span>
        </div>
        {/* Venue/time on the left, heart floated right on the same line — on every
            screen size (the old layout dropped the button onto its own row on mobile). */}
        <div className="flex justify-between items-start gap-1">
          <div className={`space-y-[1px] text-sm font-bold ${c.bodyText}`}>
            <p>{meta}</p>
          </div>
          <div className="flex gap-0.5 shrink-0">
            {canFavorite && (
              <button
                onClick={() => toggleFavorite(event)}
                disabled={picksPaused}
                className={`${isMine ? c.favToggleOn : c.favToggleOff} ${picksPaused ? c.shedInert : ''}`}
              >
                <HeartIcon state={isMine ? 'full' : 'empty'} />
              </button>
            )}
          </div>
        </div>
        {/* People you follow who have this on their picks — glanceable on every
            feed so you can trail your friends' schedules. */}
        {ViewerTag && friendPicks.length > 0 && (
          <div className="flex items-center gap-0.5 flex-wrap mt-0.5">
            {friendPicks.map((h) => (
              <ViewerTag key={h} userHandle={h} />
            ))}
          </div>
        )}
        {/* No "Add note…" editor in the feeds (owner call: too noisy at this
            density) — notes are edited from the My Faves schedule. An
            already-saved note still shows. */}
        {note ? (
          <div className={c.noteBox}>
            <p className={`text-sm font-bold ${c.bodyText}`}>{note}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
