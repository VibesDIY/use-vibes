import React, { useState } from 'react';
import ScheduleView from './ScheduleView.jsx';

// Sentinel for selectedFriend meaning "everyone I'm connected to" — the unified
// schedule. `*` can't appear in a real handle, so it can't collide.
export const ALL_FRIENDS = '*all*';

export default function FriendsView({
  friends,
  friendedBy,
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
  renderDeleteX,
  pendingDelete,
  ViewerTag,
  c,
}) {
  const [copied, setCopied] = useState(false);
  const copyLink = () => {
    navigator.clipboard.writeText(connectUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div>
      <div className="flex flex-col items-center gap-1 p-2.5 bg-[#d8e8c8] dark:bg-[#16220e] rounded-2xl m-0.5  mb-1.5">
        <div className="flex items-center gap-0.5 flex-wrap justify-center">
          <p className={`text-lg font-bold ${c.bodyText}`}>Share this link to connect schedules</p>
        </div>
        <div className="bg-white dark:bg-[#1c3012] rounded-2xl m-0.5  p-2">
          <img src={qrSrc} alt="Connect QR code" width="320" height="320" />
        </div>
        <div className="flex items-center gap-[3px]">
          <button
            onClick={copyLink}
            className={`flex items-center gap-0.5 py-[7px] px-2.5 font-bold rounded-2xl m-0.5  transition-all ${copied ? 'bg-[#4c7a34] text-white' : 'bg-white dark:bg-[#1b2913] text-[#2b3a24] dark:text-[#e9f0e3] hover:bg-[#d8e8c8] dark:hover:bg-[#16220e]'}`}
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
          Send this link to someone you want to add as a friend. When they open it, you'll be added
          to each other's crews and can see each other's schedules.
        </p>
      </div>

      <div className="mb-1.5 p-2.5 bg-white dark:bg-[#1b2913] rounded-2xl m-0.5 ">
        <p className={`text-sm font-bold mb-1 ${c.bodyText} italic`}>
          {friends.length + friendedBy.length > 0
            ? 'Click a friend to see their schedule'
            : 'Add a friend to see their schedule'}
        </p>
        {friends.length + friendedBy.length > 0 && (
          <div className="flex items-center flex-wrap gap-0.5 mb-1.5">
            <button
              onClick={() => setSelectedFriend(selectedFriend === ALL_FRIENDS ? null : ALL_FRIENDS)}
              className={`py-[5px] px-2 font-black rounded-full m-0.5 transition-all ${selectedFriend === ALL_FRIENDS ? 'bg-[#2d6a8f] text-white' : 'bg-[#4c7a34] dark:bg-[#1c3012] text-white hover:opacity-90'}`}
            >
              All
            </button>
            <span className={`text-sm font-bold ${c.bodyText}`}>
              everyone's picks as one schedule
            </span>
            <label
              className={`flex items-center gap-0.5 text-sm font-bold ${c.bodyText} cursor-pointer`}
            >
              <input
                type="checkbox"
                checked={!!includeMyFaves}
                onChange={(e) => setIncludeMyFaves(e.target.checked)}
                className="w-4 h-4 accent-[#2d6a8f]"
              />
              include my faves
            </label>
          </div>
        )}
        <h3 className={`text-xl font-black mb-1 ${c.bodyText}`}>Added You ({friendedBy.length})</h3>
        {friendedBy.length === 0 ? (
          <p className={`font-bold ${c.bodyText} mb-1.5`}>Nobody has scanned your QR yet.</p>
        ) : (
          <div className="flex flex-wrap gap-[3px] mb-1.5">
            {friendedBy.map((f) => (
              <div
                key={`by-${f._id}`}
                className={`flex items-center gap-0.5 p-0.5 rounded-full m-0.5  transition-all ${selectedFriend === f.userId ? 'bg-[#2d6a8f]' : 'bg-[#4c7a34] dark:bg-[#1c3012]'}`}
              >
                <button
                  onClick={() => setSelectedFriend(selectedFriend === f.userId ? null : f.userId)}
                  className="flex items-center"
                >
                  <ViewerTag userHandle={f.userId} />
                </button>
                {canWrite && renderDeleteX(f._id)}
              </div>
            ))}
          </div>
        )}

        <h3 className={`text-xl font-black mb-1 ${c.bodyText}`}>Following ({friends.length})</h3>
        {friends.length === 0 ? (
          <p className={`font-bold ${c.bodyText}`}>
            No friends yet — share your QR code above to connect.
          </p>
        ) : (
          <div className="flex flex-wrap gap-[3px]">
            {friends.map((f) => (
              <div
                key={f._id}
                className={`flex items-center gap-0.5 p-0.5 rounded-full m-0.5  transition-all ${selectedFriend === f.friendSlug ? 'bg-[#2d6a8f]' : 'bg-[#d8e8c8] dark:bg-[#16220e]'}`}
              >
                <button
                  onClick={() =>
                    setSelectedFriend(selectedFriend === f.friendSlug ? null : f.friendSlug)
                  }
                  className="flex items-center"
                >
                  <ViewerTag userHandle={f.friendSlug} />
                </button>
                {canWrite && renderDeleteX(f._id)}
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
                <h3 className={`text-2xl font-black ${c.bodyText}`}>Everyone's Picks</h3>
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
                ? "Your crew hasn't picked any talks yet."
                : "This friend hasn't picked any talks yet."
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
