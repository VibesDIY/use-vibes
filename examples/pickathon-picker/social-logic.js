// The decisions behind the social surfaces — who can see what, which follow control to
// render, which copy to show. Pure so the matrix can be pinned by tests instead of by
// clicking through six states in a browser.

// Whose picks I can see = handles I follow with an ACTIVE edge. A follow into a private
// account sits at "requested" until they approve — it grants no reads, so including it
// would only render empty schedule sections.
export const activeFollowHandles = (following) =>
  new Set(following.filter((f) => f.state === 'active').map((f) => f.handle));

export const followStateMap = (following) => new Map(following.map((f) => [f.handle, f.state]));

// Your OWN profile deliberately reads through the follower-visible path, not your local
// favorites: the point of previewing it is to see what OTHERS get, and an un-armed
// account (#3484) shows its followers nothing.
export const profilePicksVisible = ({ isSelf, followersEnabled, followedHandles, handle }) => {
  if (!handle) return false;
  return isSelf ? Boolean(followersEnabled) : followedHandles.has(handle);
};

// The follow control is state selection, not a boolean: 'none' on your own profile,
// 'signin' for a visitor with no identity, 'loading' until the graph snapshot lands.
// The button can't offer "Request to follow" up front — a target handle's account
// privacy isn't in the protocol, so the private case can only surface AFTER the tap,
// as 'requested' (platform #4319).
export const followButtonState = ({ isSelf, signedIn, socialReady, followState }) => {
  if (isSelf) return 'none';
  if (!signedIn) return 'signin';
  if (!socialReady) return 'loading';
  if (followState === 'active') return 'following';
  if (followState === 'requested') return 'requested';
  return 'follow';
};

// Follower-facing copy deliberately never names pick-sharing: that's a control the
// VIEWER can't reach, so naming it only tells them to go badger someone. The self arms
// do name it, because there it's actionable.
export const profileEmptyMessage = ({ isSelf, sharingOff, followState, signedIn }) => {
  if (isSelf)
    return sharingOff
      ? "Your followers see nothing here — you haven't turned on pick-sharing yet."
      : "You haven't picked any events yet — your followers see an empty schedule.";
  if (followState === 'active') return "No picks to show — they haven't shared any yet.";
  if (followState === 'requested')
    return 'Their account is private — once they approve your request, their picks show up here.';
  return signedIn
    ? 'Follow to see the events they picked and the extras they share with followers.'
    : 'Sign in and follow to see the events they picked and the extras they share.';
};

// Turning pick-sharing back ON has two paths and the social snapshot can't tell them
// apart. Someone who disarmed in this session has already consented, so re-arming is a
// plain level flip — routing them back through the consent matrix would let a prior
// standing deny no-op confusingly. A first-ever arm is the invite the platform owns.
export const armPath = ({ disarmed, canSetVisibility }) =>
  disarmed && canSetVisibility ? 'level' : 'consent';
