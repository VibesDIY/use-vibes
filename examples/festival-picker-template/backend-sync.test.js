import { describe, it, expect } from 'vitest';
import { FESTIVAL, SCHEDULE } from './festival-config.js';
import { SCHEDULE_BY_ID, BACKEND_TZ, BACKEND_DB, BACKEND_NAME } from './backend.js';

describe('backend snapshot stays in sync with festival-config', () => {
  it("has exactly the config's entries", () => {
    expect(Object.keys(SCHEDULE_BY_ID).sort()).toEqual(SCHEDULE.map((e) => e.id).sort());
  });
  it('agrees field-for-field', () => {
    for (const e of SCHEDULE) {
      expect(SCHEDULE_BY_ID[e.id]).toEqual({
        band: e.band,
        day: e.day,
        start: e.start,
        end: e.end,
        stage: e.stage,
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
