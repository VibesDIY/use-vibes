import React from 'react';
import { HeartIcon } from './icons.jsx';
import { toFestivalDate, festivalDayFor, fmtTime as fmtTimeUtil } from './festival-utils.js';
import { groupByTimeSlot } from './schedule-build.js';
import { lineupTag, eventCardStyle, eventCardBg } from './styles.js';
import NoteField from './NoteField.jsx';

function GapStrip({ startMs, endMs, allDayEvents, fmtTime }) {
  const count = allDayEvents.filter((e) => {
    const es = toFestivalDate(e.start).getTime();
    const ee = toFestivalDate(e.end).getTime();
    return es < endMs && ee > startMs;
  }).length;
  if (count === 0) return null;
  const startStr = fmtTime(new Date(startMs).toISOString());
  const endStr = fmtTime(new Date(endMs).toISOString());
  return (
    <div className="rounded-lg m-0.5  px-[7px] py-[5px] bg-white/40 dark:bg-white/10 flex items-center gap-0.5">
      <span className="text-xs font-bold text-[#4A4A4A]/60 dark:text-[#e9e9e9]/60">
        {startStr}–{endStr} · {count} act{count !== 1 ? 's' : ''}
      </span>
    </div>
  );
}

export default function ScheduleView({
  days,
  getDateForDay,
  buildSchedule,
  fmtTime,
  notes,
  c,
  shiftStartRaw,
  shiftEndRaw,
  emptyMessage,
  saveNote,
  canWrite,
  // Load shedding: the heart goes inert and the note editor stands down, while
  // the schedule itself (and any saved note) reads exactly as before
  // (loadshed.js). App passes canWrite already ANDed with the shed level, which
  // is what stands the editor down; this flag is only about the heart's look.
  picksPaused,
  onToggleFavorite,
  myFavIds,
  allEvents,
  showGaps,
  // Optional: items whose data carries `pickedBy` (unified friends schedule) render
  // the handles of everyone who picked them, when a ViewerTag component is provided.
  ViewerTag,
}) {
  const anyContent = days.some((day) => buildSchedule(day).length > 0);
  if (!anyContent) {
    return (
      <div className="text-center py-3">
        <h3 className={`text-2xl font-black mb-0.5 ${c.bodyText}`}>{emptyMessage}</h3>
      </div>
    );
  }
  return (
    <>
      {days.map((day) => {
        const daySchedule = buildSchedule(day);
        if (daySchedule.length === 0) return null;

        // The day reads as time slots: the time is printed once on the green as a slot
        // label and the cards under it carry only what differs between them.
        const groups = groupByTimeSlot(daySchedule, shiftStartRaw, shiftEndRaw);

        // Gap strips are dormant — every call site passes showGaps false — but they stay
        // wired to the slot boundaries so the feature can be switched back on.
        const allDayEvents =
          showGaps && allEvents ? allEvents.filter((e) => festivalDayFor(e.start) === day) : [];
        const gapBefore = (group, i) => {
          if (!showGaps || allDayEvents.length === 0) return null;
          const startMs = toFestivalDate(group.start).getTime();
          const prev = groups[i - 1];
          const fromMs = prev
            ? Math.max(
                ...prev.items.map((r) =>
                  toFestivalDate(
                    r.type === 'shift' ? shiftEndRaw(r.data) : r.data.end
                  ).getTime()
                )
              )
            : Math.min(...allDayEvents.map((e) => toFestivalDate(e.start).getTime()));
          return fromMs < startMs ? { startMs: fromMs, endMs: startMs } : null;
        };

        return (
          <div key={day} className={c.schedDay}>
            <h3 className="text-xl font-black mb-1 px-[14px] text-white">
              {day} — {getDateForDay(day)}
            </h3>
            <dl className="space-y-0.5 m-0">
              {groups.map((group, gi) => {
                const gap = gapBefore(group, gi);
                return (
                  <React.Fragment key={group.key}>
                    {gap && (
                      <GapStrip
                        startMs={gap.startMs}
                        endMs={gap.endMs}
                        allDayEvents={allDayEvents}
                        fmtTime={fmtTime}
                      />
                    )}
                    {/* Text only: at 390px a time range plus any rule would wrap. */}
                    {/* Slot labels hug the container edge; only the day header keeps the 14px indent. */}
                    <dt className="px-[5px] pt-0.5 text-base font-black text-white">
                      {fmtTime(group.start)}
                      {group.end ? ` – ${fmtTime(group.end)}` : ''}
                    </dt>
                    <dd className="m-0 space-y-0.5">
                      {group.items.map((item) => {
                        const isEvent = item.type === 'event';
                        const tag = isEvent ? lineupTag(item.data) : null;
                        // Only when the slot label can't speak for this card.
                        const endNote = group.end
                          ? null
                          : fmtTime(isEvent ? item.data.end : shiftEndRaw(item.data));
                        const showNoteField = isEvent && canWrite && saveNote;
                        return (
                          <div
                            key={`${item.type}-${item.id}`}
                            className={
                              item.type === 'shift'
                                ? c.schedShift
                                : `rounded-[12px] m-0.5 p-[7px] ${eventCardBg}`
                            }
                            style={isEvent ? eventCardStyle(item.data) : undefined}
                          >
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <div className="flex items-center gap-0.5 flex-wrap mb-[1px]">
                                  <h4 className={`font-black ${c.bodyText}`}>
                                    {item.type === 'shift'
                                      ? item.data.kind || item.data.title || 'Shift'
                                      : item.title}
                                  </h4>
                                  {isEvent && (
                                    <span className="px-0.5 py-[0.5px] rounded-full text-xs font-black m-0.5  uppercase bg-[#BACD32] text-[#4A4A4A]">
                                      {tag.label}
                                    </span>
                                  )}
                                  {isEvent && onToggleFavorite && (
                                    <button
                                      onClick={() => onToggleFavorite(item.data)}
                                      disabled={picksPaused}
                                      className={`p-[1px] rounded-lg m-0.5  text-xs font-bold px-0.5 ${picksPaused ? c.shedInert : ''} ${myFavIds && myFavIds.has(item.data.eventId) ? 'bg-[#CD6C0C] text-white' : 'bg-white dark:bg-[#22252d] text-[#4A4A4A] dark:text-[#e9e9e9]'}`}
                                    >
                                      <HeartIcon state={myFavIds && myFavIds.has(item.data.eventId) ? 'full' : 'empty'} size={16} />
                                    </button>
                                  )}
                                </div>
                                {/* Venue line — the time now lives in the slot label above.
                                    The collapsed note box rides this line (flex-wrap:
                                    expanded it goes basis-full and wraps below on its own). */}
                                {(isEvent || endNote || showNoteField) && (
                                  <div className="flex flex-wrap items-center justify-between gap-0.5">
                                    <p className={`text-sm font-bold ${c.bodyText}`}>
                                      {isEvent ? item.venue : ''}
                                      {endNote ? `${isEvent ? ' · ' : ''}until ${endNote}` : ''}
                                    </p>
                                    {showNoteField && (
                                      <NoteField
                                        saved={notes && notes[item.data.eventId]}
                                        onSave={(t) => saveNote(item.data.eventId, t)}
                                        className={c.noteArea}
                                        collapsedStyle={{ width: '8em' }}
                                      />
                                    )}
                                  </div>
                                )}
                                {ViewerTag &&
                                  Array.isArray(item.data.pickedBy) &&
                                  item.data.pickedBy.length > 0 && (
                                    <div className="flex items-center gap-0.5 flex-wrap mt-0.5">
                                      {item.data.pickedBy.map((h) => (
                                        <ViewerTag key={h} userHandle={h} />
                                      ))}
                                    </div>
                                  )}
                                {isEvent && !showNoteField && notes && notes[item.data.eventId] ? (
                                  <div
                                    className={`mt-0.5 p-1.5 bg-[#EEE] dark:bg-[#22252d] rounded-lg m-0.5 `}
                                  >
                                    <p className={`text-sm font-bold ${c.bodyText}`}>
                                      {notes[item.data.eventId]}
                                    </p>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </dd>
                  </React.Fragment>
                );
              })}
            </dl>
          </div>
        );
      })}
    </>
  );
}
