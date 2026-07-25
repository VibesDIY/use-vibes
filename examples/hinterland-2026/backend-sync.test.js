import { describe, it, expect } from 'vitest';
import { FESTIVAL, SCHEDULE } from './festival-config.js';
import { SCHEDULE_BY_ID, BACKEND_TZ, BACKEND_DB, BACKEND_NAME } from './backend.js';

// The backend isolate runs alone (no imports), so its schedule is a duplicated
// snapshot. This is the only thing keeping the duplicate honest.
describe('backend snapshot stays in sync with festival-config', () => {
  it("has exactly the config's entries", () => {
    expect(Object.keys(SCHEDULE_BY_ID).sort()).toEqual(SCHEDULE.map((e) => e.id).sort());
  });

  // Live-app deviation from the template: the snapshot keeps the SHIPPED field
  // names (`title`/`location`, no `day`) because scheduleItemsFor() reads them into
  // calendar items that already exist in subscribers' calendar clients.
  it('agrees field-for-field', () => {
    for (const e of SCHEDULE) {
      expect(SCHEDULE_BY_ID[e.id]).toEqual({
        title: e.band,
        start: e.start,
        end: e.end,
        location: e.stage,
        url: e.url,
      });
    }
  });

  it('agrees on the timezone', () => {
    expect(BACKEND_TZ).toBe(FESTIVAL.tz);
  });

  it('agrees on the database name', () => {
    expect(BACKEND_DB).toBe(FESTIVAL.dbName);
  });

  it('agrees on the festival name', () => {
    expect(BACKEND_NAME).toBe(FESTIVAL.name);
  });
});
