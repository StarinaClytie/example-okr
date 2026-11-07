import { describe, expect, it } from 'vitest';
import { currentBusinessDate } from './progressStatus';
import { currentWeekRange } from './hrWorkHours';
describe('organization calendar', () => {
  it('uses the organization date across a UTC boundary', () => {
    const now = new Date('2026-01-01T00:30:00Z');
    expect(currentBusinessDate(now, 'America/New_York')).toBe('2025-12-31');
    expect(currentBusinessDate(now, 'UTC')).toBe('2026-01-01');
  });
  it.each(['2026-03-08T07:30:00Z', '2026-11-01T06:30:00Z'])('keeps New York DST weeks as seven calendar days: %s', (instant) => {
    expect(currentWeekRange(new Date(instant), 'America/New_York', 0)).toEqual(instant.includes('03-08') ? { from: '2026-03-08', to: '2026-03-14' } : { from: '2026-11-01', to: '2026-11-07' });
  });
  it('uses London civil dates and Monday weeks across DST', () => {
    expect(currentBusinessDate(new Date('2026-03-29T23:30:00Z'), 'Europe/London')).toBe('2026-03-30');
    expect(currentWeekRange(new Date('2026-10-25T01:30:00Z'), 'Europe/London', 1)).toEqual({ from: '2026-10-19', to: '2026-10-25' });
  });
  it('supports either week start across the year boundary', () => {
    const now = new Date('2026-01-04T12:00:00Z');
    expect(currentWeekRange(now, 'UTC', 0)).toEqual({ from: '2026-01-04', to: '2026-01-10' });
    expect(currentWeekRange(now, 'UTC', 1)).toEqual({ from: '2025-12-29', to: '2026-01-04' });
  });
});
