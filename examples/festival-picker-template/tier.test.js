import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { visibleTabs } from './festival-utils.js';
import FriendsView, { ALL_FRIENDS } from './FriendsView.jsx';

describe('visibleTabs', () => {
  it('full tier shows the whole picker', () => {
    expect(visibleTabs('full')).toEqual(['browse', 'favorites', 'shifts', 'schedule', 'friends']);
  });
  // Following friends is the sharing loop these apps exist for, and a friend's
  // FAVORITES exist whether or not the festival has announced set times. Only the
  // time-based views (the day-by-day schedule and the extras planner built on it)
  // drop out on a lineup-tier festival.
  it('lineup tier hides only the time-based views, never follows', () => {
    expect(visibleTabs('lineup')).toEqual(['browse', 'favorites', 'friends']);
  });
});

const noop = () => Promise.resolve();
const friendsProps = (overrides) => ({
  socialReady: true,
  following: [{ handle: 'ada', state: 'active' }],
  followers: [],
  requests: [],
  follow: noop,
  unfollow: noop,
  approve: noop,
  removeFollower: noop,
  selectedFriend: 'ada',
  setSelectedFriend: () => {},
  includeMyFaves: false,
  setIncludeMyFaves: () => {},
  friendFavoriteEvents: [],
  friendShifts: [],
  canWrite: true,
  toggleFavorite: () => {},
  myFavIds: new Set(),
  displayDays: [],
  getDateForDay: () => '2026-07-30',
  makeFriendSchedule: () => [],
  shiftStartRaw: (s) => s.start,
  shiftEndRaw: (s) => s.end,
  fmtTime: () => '',
  connectUrl: 'https://example.test/?friend=ada',
  qrSrc: 'https://example.test/qr.png',
  ViewerTag: ({ userHandle }) => React.createElement('span', null, userHandle),
  c: {
    bodyText: '',
    btnPink: '',
    btnCyan: '',
    schedDay: '',
    schedShift: '',
    noteArea: '',
    noteBox: '',
  },
  ...overrides,
});

describe('FriendsView on a lineup-tier festival', () => {
  // Undated picks (start/end null) have no festival day, so they never reach the
  // day-grouped ScheduleView. They render as one undated group instead — the same
  // fallback BrowseView uses — so a follow's picks are visible before set times exist.
  it("renders a followed person's undated picks", () => {
    render(
      React.createElement(
        FriendsView,
        friendsProps({
          friendFavoriteEvents: [
            { eventId: 'e1', title: 'Khruangbin', start: null, end: null, venueTitle: null },
          ],
        })
      )
    );
    expect(screen.getByText('Khruangbin')).toBeTruthy();
  });

  it('still shows the empty message when a follow has picked nothing', () => {
    render(
      React.createElement(
        FriendsView,
        friendsProps({ selectedFriend: ALL_FRIENDS, friendFavoriteEvents: [] })
      )
    );
    expect(screen.getByText(/Nobody you follow has picked any events yet/)).toBeTruthy();
  });
});
