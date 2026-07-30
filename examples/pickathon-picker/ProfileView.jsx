import React, { useState } from 'react';
import ScheduleView from './ScheduleView.jsx';
import { followButtonState, profileEmptyMessage } from './social-logic.js';

// A handle's public profile — what a FOLLOWER sees of them: identity, a follow
// button, and their follower-visible picks/shared extras.
//
// It is reachable signed-out (a scanned QR is usually someone's first contact with
// the app), so nothing here may assume a viewer identity. The picks it renders come
// from the same read path FriendsView uses — the live query only ever returns docs
// the platform already decided this viewer may read, so "empty" here is honest:
// they haven't picked, their picks aren't shared, or they haven't approved this
// viewer's request. The client can't tell those apart, and the follower-facing copy
// deliberately doesn't guess at a cause the viewer can't fix (see social-logic.js).
//
// OWN profile is deliberately rendered through the same follower-visible path rather
// than the owner's local favorites: the point of previewing your profile is to see
// what OTHERS get. The pick-sharing control lives here for the same reason — it's
// what governs everything below it.

// ViewerTag has no size or avatar-only prop: it always renders a pill whose avatar is a
// fixed 30px circle, inset from the pill's top-left by its 1px border + 5px padding.
// So scale the WHOLE pill 4× from its top-left corner (the same transform-scale trick
// the platform's own AccountView uses at 1.3×) — the avatar becomes 120px sitting 24px
// in (4 × 6px) — then pull the pill back by exactly that 24px so the avatar lands on the
// 120px clipping circle. The pill's background and username scale out of the circle and
// are clipped away, leaving avatar only.
const BIG_AVATAR = 120;
const BIG_AVATAR_SCALE = 4;
const BIG_AVATAR_INSET = -(BIG_AVATAR_SCALE * 6); // border + padding, scaled
const bigAvatarTagStyle = {
  position: 'absolute',
  top: BIG_AVATAR_INSET,
  left: BIG_AVATAR_INSET,
  transform: `scale(${BIG_AVATAR_SCALE})`,
  transformOrigin: 'top left',
};

// Your OWN avatar renders the propless "me" tag, which is the editable shape — that's
// how you set your photo, so it must not be wrapped in anything that eats the click.
function BigAvatar({ ViewerTag, handle, isSelf }) {
  return (
    <div
      className="relative shrink-0 rounded-full overflow-hidden"
      style={{ width: BIG_AVATAR, height: BIG_AVATAR }}
      title={isSelf ? 'Tap your photo to change it' : undefined}
    >
      {isSelf ? (
        <ViewerTag style={bigAvatarTagStyle} />
      ) : (
        <ViewerTag userHandle={handle} style={bigAvatarTagStyle} />
      )}
    </div>
  );
}

export default function ProfileView({
  handle,
  isSelf,
  signedIn,
  socialReady,
  followState, // 'active' | 'requested' | null
  follow,
  unfollow,
  // The pick-sharing knob (NOT account privacy): whether it's armed, whether a
  // round-trip is in flight, and the two actions.
  sharing,
  // Everything ScheduleView needs to render one handle's days.
  schedule,
  // Raw tag for the header avatar (unwrapped: it's already this profile, and the self
  // one must keep its upload click); ProfileTag for handles that link elsewhere.
  ViewerTag,
  ProfileTag,
  c,
}) {
  // A follow mutation resolves only once the shell pushes a refreshed graph
  // snapshot, so this is a double-tap guard, not an optimistic state: when it
  // clears, followState already carries the answer. Refusals (blocked pair,
  // unknown handle) resolve quietly — there is no error to render.
  const [busy, setBusy] = useState(false);
  const mutate = (fn) => {
    setBusy(true);
    fn(handle).finally(() => setBusy(false));
  };

  const sharingOff = isSelf && !sharing.enabled;
  const emptyMessage = profileEmptyMessage({ isSelf, sharingOff, followState, signedIn });

  const followBtn = () => {
    // 'requested' can only appear AFTER the tap — a target handle's account privacy
    // isn't in the protocol, so the button can't offer "Request to follow" up front
    // (platform #4319).
    switch (followButtonState({ isSelf, signedIn, socialReady, followState })) {
      case 'none':
        return null;
      case 'signin':
        return (
          <span className={`text-sm font-bold ${c.bodyText}`}>
            Sign in via the Vibes DIY logo to follow
          </span>
        );
      case 'loading':
        return <span className={`text-sm font-bold ${c.bodyText}`}>…</span>;
      case 'following':
        return (
          <button
            onClick={() => mutate(unfollow)}
            disabled={busy}
            className={busy ? c.btnWorking : c.btnCyan}
            title="Tap to unfollow"
          >
            Following ✓
          </button>
        );
      case 'requested':
        return (
          <button
            onClick={() => mutate(unfollow)}
            disabled={busy}
            className={busy ? c.btnWorking : c.btnCyan}
            title="Their account is private — tap to cancel the request"
          >
            Requested
          </button>
        );
      default:
        return (
          <button
            onClick={() => mutate(follow)}
            disabled={busy}
            className={busy ? c.btnWorking : c.btnPink}
          >
            Follow
          </button>
        );
    }
  };

  // Ordinary page content, not an overlay: the app header and nav stay above it and any
  // tab press navigates away, so there is no Close button to get wrong.
  return (
    <div>
      <div
        className={`${c.headerBg} rounded-2xl m-0.5 mb-1.5 p-[14px] flex items-center gap-[14px]`}
      >
        <BigAvatar ViewerTag={ViewerTag} handle={handle} isSelf={isSelf} />
        <div className="flex flex-col gap-[6px] min-w-0">
          <h2 className={`text-2xl font-black ${c.bodyText}`}>
            {isSelf ? 'Your profile' : 'Profile'}
          </h2>
          {/* The scaled tag clips its own username away, so the handle is text here. */}
          <p className={`text-lg font-bold truncate ${c.bodyText}`}>@{handle}</p>
          <div>{followBtn()}</div>
        </div>
      </div>

      <div>
        {isSelf && (
          <div className="mb-1.5 p-[14px] bg-white dark:bg-[#22252d] rounded-2xl m-0.5">
            <p className={`font-bold ${c.bodyText}`}>
              This is your public profile — this is what others see.
            </p>
          </div>
        )}

        {/* Account privacy (whether follows need approval) is PLATFORM state with no
            setter on useSocial — it lives in Settings → Social, not here. This block is
            the separate per-app pick-sharing arm: without it, even approved followers
            see an empty schedule. */}
        {sharingOff && (
          <div className="mb-1.5 p-[14px] bg-[#CD6C0C] rounded-2xl m-0.5 flex flex-col items-center gap-[8px]">
            <p className="text-white font-bold text-center">
              Your picks are hidden from your followers — turn on sharing so your profile shows
              your schedule.
            </p>
            <button
              onClick={sharing.arm}
              disabled={sharing.busy}
              className="py-[7px] px-[14px] font-black rounded-2xl m-0.5 bg-white text-[#CD6C0C] hover:opacity-90 transition-all"
            >
              Share my picks with followers
            </button>
          </div>
        )}

        <h3 className={`text-2xl font-black mb-1 ${c.bodyText}`}>
          {isSelf ? 'What your followers see' : 'Their picks'}
        </h3>
        <ScheduleView
          days={schedule.days}
          getDateForDay={schedule.getDateForDay}
          buildSchedule={schedule.build}
          fmtTime={schedule.fmtTime}
          notes={null}
          c={c}
          shiftStartRaw={schedule.shiftStartRaw}
          shiftEndRaw={schedule.shiftEndRaw}
          emptyMessage={emptyMessage}
          canWrite={false}
          onToggleFavorite={null}
          myFavIds={null}
          ViewerTag={ProfileTag}
        />
        {/* The reverser for the arm CTA above, in the same place as what it governs.
            Picks-scoped by design: this is not account privacy. */}
        {isSelf && sharing.enabled && sharing.stop && (
          <div className="mt-1.5 text-center">
            <button
              onClick={sharing.stop}
              disabled={sharing.busy}
              className={c.quietLink(sharing.busy)}
              title="Turns pick-sharing back off — your picks stop being shared with followers. You can turn it on again any time."
            >
              Stop sharing my picks
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
