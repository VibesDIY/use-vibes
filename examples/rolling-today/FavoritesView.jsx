import React, { useState } from "react";
import RideCard from "./RideCard.jsx";
import { c } from "./styles.js";
import { prettyDate, rideKey } from "./calendar-utils.js";

// Live calendar subscription buttons. The URL carries a per-user random
// token (opt-in — created only when the user asks), so it's unguessable and
// revocable. webcal:// (NOT webcals:// — iOS Safari rejects the secure-scheme
// variant as an invalid address, settled on-device for pickathon-picker)
// opens the iPhone/macOS Calendar subscribe flow; iOS shows a one-time
// "Insecure Connection" prompt whose Continue works (fetches ride the
// http→https redirect). The copied https form pastes into Google Calendar
// (From URL) or Settings → Calendar → Add Subscribed Calendar, which skips
// the prompt entirely.
function SubscribeBar({ subscribePath }) {
  const [copied, setCopied] = useState(false);
  if (!subscribePath) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`https://${window.location.host}${subscribePath}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      /* long-press the subscribe button instead */
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2 mb-2">
      <a
        href={`webcal://${window.location.host}${subscribePath}`}
        target="_blank"
        rel="noopener noreferrer"
        className={`${c.actionBtn} ${c.actionCal}`}
        title="Subscribe in your phone's calendar — it follows your starred rides live (cancelled rides drop off, times stay current). iOS may warn about an insecure connection; tap Continue. Share the link and friends can subscribe to your rides."
      >
        📆 Subscribe on iPhone
      </a>
      <button
        onClick={copy}
        className={`${c.actionBtn} ${c.actionWeb}`}
        title="Copy the subscription URL — paste into Google Calendar (From URL) or send to a friend"
        aria-label="Copy subscription link"
      >
        {copied ? "✓" : "📋"}
      </button>
    </div>
  );
}

// The all-days Favorites screen: every day you've saved a ride, oldest first,
// empty days skipped, each day under its own header. Cards are condensed (no long
// descriptions or images) since this is a scan-your-plan view, not a browse view.
export default function FavoritesView({
  favDates,
  favByDay,
  userId,
  favsByRide,
  canFavorite,
  toggleFavorite,
  notes,
  saveNote,
  subscribePath,
}) {
  if (favDates.length === 0) {
    return (
      <>
        <SubscribeBar subscribePath={subscribePath} />
        <div className={c.empty}>No favorites yet — tap the star on any ride to save it here.</div>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <SubscribeBar subscribePath={subscribePath} />
      {favDates.map((date) => {
        const rides = favByDay[date];
        return (
          <section key={date}>
            <div className={c.dayHead}>
              <span>{prettyDate(date)}</span>
              <span className={c.dayHeadCount}>
                {rides.length} ride{rides.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className={c.list}>
              {rides.map((event) => (
                <RideCard
                  key={rideKey(event)}
                  event={event}
                  favs={favsByRide[rideKey(event)] || []}
                  userId={userId}
                  canFavorite={canFavorite}
                  toggleFavorite={toggleFavorite}
                  note={notes[rideKey(event)]}
                  saveNote={saveNote}
                  condensed
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
