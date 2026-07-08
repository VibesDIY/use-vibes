import React from "react";
import { toFestivalDate, festivalDayFor } from "./festival-utils.js";
import { lineupTag, eventCardStyle, eventCardBg } from "./styles.js";
import NoteField from "./NoteField.jsx";

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
      <span className="text-xs font-bold text-[#2b3a24]/60 dark:text-[#e9f0e3]/60">
        {startStr}–{endStr} · {count} talk{count !== 1 ? "s" : ""}
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

        const allDayEvents = showGaps && allEvents ? allEvents.filter((e) => festivalDayFor(e.start) === day) : [];

        const items = [];
        for (let i = 0; i < daySchedule.length; i++) {
          const item = daySchedule[i];
          const itemStart = item.type === "shift" ? shiftStartRaw(item.data) : item.data.start;
          const itemEnd = item.type === "shift" ? shiftEndRaw(item.data) : item.data.end;
          const itemStartMs = toFestivalDate(itemStart).getTime();
          const itemEndMs = toFestivalDate(itemEnd).getTime();

          if (showGaps && allDayEvents.length > 0 && i === 0) {
            const earliestEvent = allDayEvents.reduce((min, e) => {
              const t = toFestivalDate(e.start).getTime();
              return t < min ? t : min;
            }, Infinity);
            if (earliestEvent < itemStartMs) {
              items.push({ type: "gap", startMs: earliestEvent, endMs: itemStartMs, key: `gap-pre-${day}` });
            }
          }

          items.push({ type: "item", data: item, key: `${item.type}-${item.id}` });

          if (showGaps && allDayEvents.length > 0) {
            const nextItem = daySchedule[i + 1];
            const nextStartMs = nextItem
              ? toFestivalDate(nextItem.type === "shift" ? shiftStartRaw(nextItem.data) : nextItem.data.start).getTime()
              : null;

            if (nextStartMs && nextStartMs > itemEndMs) {
              items.push({ type: "gap", startMs: itemEndMs, endMs: nextStartMs, key: `gap-${i}` });
            }

            if (!nextItem) {
              const latestEvent = allDayEvents.reduce((max, e) => {
                const t = toFestivalDate(e.end).getTime();
                return t > max ? t : max;
              }, 0);
              if (latestEvent > itemEndMs) {
                items.push({ type: "gap", startMs: itemEndMs, endMs: latestEvent, key: `gap-post-${day}` });
              }
            }
          }
        }

        return (
          <div key={day} className={c.schedDay}>
            <h3 className="text-xl font-black mb-1 text-white">
              {day} — {getDateForDay(day)}
            </h3>
            <div className="space-y-0.5">
              {items.map((entry) => {
                if (entry.type === "gap") {
                  return (
                    <GapStrip
                      key={entry.key}
                      startMs={entry.startMs}
                      endMs={entry.endMs}
                      allDayEvents={allDayEvents}
                      fmtTime={fmtTime}
                    />
                  );
                }
                const item = entry.data;
                const itemStart = item.type === "shift" ? shiftStartRaw(item.data) : item.data.start;
                const itemEnd = item.type === "shift" ? shiftEndRaw(item.data) : item.data.end;
                const isEvent = item.type === "event";
                const tag = isEvent ? lineupTag(item.data) : null;
                return (
                  <div
                    key={entry.key}
                    className={item.type === "shift" ? c.schedShift : `rounded-[12px] m-0.5 p-[7px] ${eventCardBg}`}
                    style={isEvent ? eventCardStyle(item.data) : undefined}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-0.5 flex-wrap mb-[1px]">
                          <h4 className={`font-black ${c.bodyText}`}>
                            {item.type === "shift" ? item.data.kind || item.data.title || "Shift" : item.title}
                          </h4>
                          {isEvent && (
                            <span
                              className="px-0.5 py-[0.5px] rounded-full text-xs font-black m-0.5  uppercase"
                              style={{ backgroundColor: tag.color, color: tag.textColor }}
                            >
                              {tag.label}
                            </span>
                          )}
                          {isEvent && onToggleFavorite && (
                            <button
                              onClick={() => onToggleFavorite(item.data)}
                              className={`p-[1px] rounded-lg m-0.5  text-xs font-bold px-0.5 ${myFavIds && myFavIds.has(item.data.eventId) ? "bg-[#2d6a8f] text-white" : "bg-white dark:bg-[#1b2913] text-[#2b3a24] dark:text-[#e9f0e3]"}`}
                            >
                              {myFavIds && myFavIds.has(item.data.eventId) ? "♥" : "♡"}
                            </button>
                          )}
                        </div>
                        {isEvent && item.data.speakers && <p className={`text-sm font-bold ${c.bodyText}`}>{item.data.speakers}</p>}
                        <p className={`text-sm font-bold ${c.bodyText}`}>
                          {fmtTime(itemStart)} – {fmtTime(itemEnd)}
                          {isEvent && ` · ${item.venue}`}
                        </p>
                        {ViewerTag && Array.isArray(item.data.pickedBy) && item.data.pickedBy.length > 0 && (
                          <div className="flex items-center gap-0.5 flex-wrap mt-0.5">
                            {item.data.pickedBy.map((h) => (
                              <ViewerTag key={h} userHandle={h} />
                            ))}
                          </div>
                        )}
                        {isEvent &&
                          (canWrite && saveNote ? (
                            <NoteField
                              saved={notes && notes[item.data.eventId]}
                              onSave={(t) => saveNote(item.data.eventId, t)}
                              className={c.noteArea}
                              collapsedStyle={{ width: "8em" }}
                              collapsedRight
                            />
                          ) : notes && notes[item.data.eventId] ? (
                            <div className={`mt-0.5 p-1.5 bg-[#e6efdb] dark:bg-[#1b2913] rounded-lg m-0.5 `}>
                              <p className={`text-sm font-bold ${c.bodyText}`}>{notes[item.data.eventId]}</p>
                            </div>
                          ) : null)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}
