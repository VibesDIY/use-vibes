import React, { useState } from 'react';
import ScheduleView from './ScheduleView.jsx';

// Sentinel for selectedFriend meaning "everyone I follow" — the unified
// schedule. `*` can't appear in a real handle, so it can't collide.
export const ALL_FRIENDS = '*all*';

// The follow graph lives in the platform (Settings → Social); this view renders
// the viewer's edges from useSocial() and never touches the app db for them.
// Copy discipline: "following" = whose picks I see; "followers" = who sees my
// picks — never "friends".
export default function FriendsView({
  socialReady,
  following,
  followers,
  requests,
  follow,
  unfollow,
  approve,
  selectedFriend,
  setSelectedFriend,
  includeMyFaves,
  setIncludeMyFaves,
  friendFavoriteEvents,
  friendShifts,
  canWrite,
  toggleFavorite,
  myFavIds,
  displayDays,
  getDateForDay,
  makeFriendSchedule,
  shiftStartRaw,
  shiftEndRaw,
  fmtTime,
  connectUrl,
  qrSrc,
  ViewerTag,
  c,
}) {
  const [copied, setCopied] = useState(false);
  // Handles with an in-flight mutation: the promise resolves only after the
  // shell pushes the refreshed snapshot, so this is purely a double-tap guard —
  // when it clears, the lists already show the new state. Expected refusals
  // (self-follow, blocked pair, unknown handle) resolve quietly — the snapshot
  // just doesn't change — so there is nothing to catch and no error UI to render.
  const [busy, setBusy] = useState(() => new Set());
  const mutate = (fn, handle) => {
    setBusy((b) => new Set(b).add(handle));
    fn(handle).finally(() =>
      setBusy((b) => {
        const n = new Set(b);
        n.delete(handle);
        return n;
      })
    );
  };

  const copyLink = () => {
    navigator.clipboard.writeText(connectUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const followingActive = following.filter((f) => f.state === 'active');
  const followingRequested = following.filter((f) => f.state === 'requested');
  const followingSet = new Set(following.map((f) => f.handle));

  // Signed-in but the graph snapshot hasn't arrived yet — skeleton, not lists.
  if (!socialReady) {
    return (
      <div className="mb-1.5 p-2.5 bg-white dark:bg-[#22252d] rounded-2xl m-0.5">
        <p className={`font-bold ${c.bodyText}`}>Loading your follows…</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col items-center gap-1 p-2.5 bg-[#BACD32] dark:bg-[#2c3510] rounded-2xl m-0.5  mb-1.5">
        <div className="flex items-center gap-0.5 flex-wrap justify-center">
          <p className={`text-lg font-bold ${c.bodyText}`}>
            Share this link so people can follow you
          </p>
        </div>
        <div className="bg-white dark:bg-[#1d3015] rounded-2xl m-0.5  p-2">
          <img src={qrSrc} alt="Follow-me QR code" width="320" height="320" />
        </div>
        <div className="flex items-center gap-[3px]">
          <button
            onClick={copyLink}
            className={`flex items-center gap-0.5 py-[7px] px-2.5 font-bold rounded-2xl m-0.5  transition-all ${copied ? 'bg-[#71AD44] text-white' : 'bg-white dark:bg-[#22252d] text-[#4A4A4A] dark:text-[#e9e9e9] hover:bg-[#BACD32] dark:hover:bg-[#2c3510]'}`}
          >
            {copied ? (
              <>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                Copy Link
              </>
            )}
          </button>
        </div>
        <p className={`text-sm font-bold text-center max-w-[340px] ${c.bodyText}`}>
          Whoever opens it follows you — they'll see the picks and shared extras on your schedule.
          Follow them back to see theirs.
        </p>
      </div>

      {requests.length > 0 && (
        <div className="mb-1.5 p-2.5 bg-[#BACD32] dark:bg-[#2c3510] rounded-2xl m-0.5 ">
          <h3 className={`text-xl font-black mb-1 ${c.bodyText}`}>
            Follow requests ({requests.length})
          </h3>
          <p className={`text-sm font-bold mb-1 ${c.bodyText}`}>
            Your account is private — approve a request to let that person see your picks.
          </p>
          <div className="flex flex-wrap gap-[3px]">
            {requests.map((r) => (
              <div
                key={`req-${r.handle}`}
                className="flex items-center gap-0.5 p-0.5 rounded-full m-0.5 bg-white dark:bg-[#22252d]"
              >
                <ViewerTag userHandle={r.handle} />
                <button
                  onClick={() => mutate(approve, r.handle)}
                  disabled={busy.has(r.handle)}
                  className={c.btnPink}
                >
                  Approve
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-1.5 p-2.5 bg-white dark:bg-[#22252d] rounded-2xl m-0.5 ">
        <p className={`text-sm font-bold mb-1 ${c.bodyText} italic`}>
          {followingActive.length > 0
            ? 'Tap someone you follow to see their schedule'
            : 'Follow someone to see their schedule'}
        </p>
        {followingActive.length > 0 && (
          <div className="flex items-center flex-wrap gap-0.5 mb-1.5">
            <button
              onClick={() => setSelectedFriend(selectedFriend === ALL_FRIENDS ? null : ALL_FRIENDS)}
              className={`py-[5px] px-2 font-black rounded-full m-0.5 transition-all ${selectedFriend === ALL_FRIENDS ? 'bg-[#CD6C0C] text-white' : 'bg-[#71AD44] dark:bg-[#1d3015] text-white hover:opacity-90'}`}
            >
              All
            </button>
            <span className={`text-sm font-bold ${c.bodyText}`}>
              everyone you follow, as one schedule
            </span>
            <label
              className={`flex items-center gap-0.5 text-sm font-bold ${c.bodyText} cursor-pointer`}
            >
              <input
                type="checkbox"
                checked={!!includeMyFaves}
                onChange={(e) => setIncludeMyFaves(e.target.checked)}
                className="w-4 h-4 accent-[#CD6C0C]"
              />
              include my faves
            </label>
          </div>
        )}

        <h3 className={`text-xl font-black mb-1 ${c.bodyText}`}>Following ({following.length})</h3>
        {following.length === 0 ? (
          <p className={`font-bold ${c.bodyText} mb-1.5`}>
            Not following anyone yet — scan a friend's QR code to follow them.
          </p>
        ) : (
          <div className="flex flex-wrap gap-[3px] mb-1.5">
            {followingActive.map((f) => (
              <div
                key={`fw-${f.handle}`}
                className={`flex items-center gap-0.5 p-0.5 rounded-full m-0.5  transition-all ${selectedFriend === f.handle ? 'bg-[#CD6C0C]' : 'bg-[#BACD32] dark:bg-[#2c3510]'}`}
              >
                <button
                  onClick={() => setSelectedFriend(selectedFriend === f.handle ? null : f.handle)}
                  className="flex items-center"
                >
                  <ViewerTag userHandle={f.handle} />
                </button>
                <button
                  onClick={() => mutate(unfollow, f.handle)}
                  disabled={busy.has(f.handle)}
                  className="px-0.5 py-[1px] rounded-full m-0.5 text-xs font-bold bg-white dark:bg-[#22252d] text-[#4A4A4A] dark:text-[#e9e9e9] hover:bg-[#B22222] hover:text-white transition-all"
                  title="Unfollow"
                >
                  ×
                </button>
              </div>
            ))}
            {followingRequested.map((f) => (
              <div
                key={`fw-${f.handle}`}
                className="flex items-center gap-0.5 p-0.5 rounded-full m-0.5 bg-white dark:bg-[#22252d] opacity-80"
                title="They have a private account — waiting for approval"
              >
                <ViewerTag userHandle={f.handle} />
                <span className={`text-xs font-bold pr-0.5 ${c.bodyText}`}>requested</span>
                <button
                  onClick={() => mutate(unfollow, f.handle)}
                  disabled={busy.has(f.handle)}
                  className="px-0.5 py-[1px] rounded-full m-0.5 text-xs font-bold bg-white dark:bg-[#181a20] text-[#4A4A4A] dark:text-[#e9e9e9] hover:bg-[#B22222] hover:text-white transition-all"
                  title="Cancel request"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <h3 className={`text-xl font-black mb-1 ${c.bodyText}`}>Followers ({followers.length})</h3>
        <p className={`text-sm font-bold mb-1 ${c.bodyText}`}>
          Followers can see your picks and shared extras.
        </p>
        {followers.length === 0 ? (
          <p className={`font-bold ${c.bodyText}`}>Nobody follows you yet — share your QR above.</p>
        ) : (
          <div className="flex flex-wrap gap-[3px]">
            {followers.map((f) => (
              <div
                key={`fb-${f.handle}`}
                className="flex items-center gap-0.5 p-0.5 rounded-full m-0.5 bg-[#71AD44] dark:bg-[#1d3015]"
              >
                <ViewerTag userHandle={f.handle} />
                {canWrite && !followingSet.has(f.handle) && (
                  <button
                    onClick={() => mutate(follow, f.handle)}
                    disabled={busy.has(f.handle)}
                    className="py-[1px] px-1 rounded-full m-0.5 text-xs font-bold bg-white dark:bg-[#22252d] text-[#4A4A4A] dark:text-[#e9e9e9] hover:bg-[#CD6C0C] hover:text-white transition-all"
                  >
                    Follow back
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedFriend && (
        <div id="friend-schedule" className="mb-1.5 scroll-mt-4">
          <div className="flex items-center justify-between mb-1 flex-wrap gap-0.5">
            <div className="flex items-center gap-0.5 flex-wrap">
              {selectedFriend === ALL_FRIENDS ? (
                <h3 className={`text-2xl font-black ${c.bodyText}`}>Everyone You Follow</h3>
              ) : (
                <>
                  <h3 className={`text-2xl font-black ${c.bodyText}`}>Picks by</h3>
                  <ViewerTag userHandle={selectedFriend} />
                </>
              )}
            </div>
            <button onClick={() => setSelectedFriend(null)} className={c.btnCyan}>
              Close
            </button>
          </div>
          <ScheduleView
            days={displayDays}
            getDateForDay={getDateForDay}
            buildSchedule={makeFriendSchedule}
            fmtTime={fmtTime}
            notes={null}
            c={c}
            shiftStartRaw={shiftStartRaw}
            shiftEndRaw={shiftEndRaw}
            emptyMessage={
              selectedFriend === ALL_FRIENDS
                ? 'Nobody you follow has picked any events yet.'
                : "They haven't picked any events yet — or their account is private and hasn't approved you yet."
            }
            canWrite={false}
            onToggleFavorite={canWrite ? toggleFavorite : null}
            myFavIds={myFavIds}
            ViewerTag={ViewerTag}
          />
        </div>
      )}
    </div>
  );
}
