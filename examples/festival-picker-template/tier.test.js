import { describe, it, expect } from 'vitest';
import { visibleTabs } from './festival-utils.js';

describe('visibleTabs', () => {
  it('full tier shows the whole picker', () => {
    expect(visibleTabs('full')).toEqual(['browse', 'favorites', 'shifts', 'schedule']);
  });
  it('lineup tier hides time-based views', () => {
    expect(visibleTabs('lineup')).toEqual(['browse', 'favorites']);
  });
});
