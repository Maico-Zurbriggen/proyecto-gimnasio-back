import { describe, expect, it } from 'vitest';

import {
  calculateConsecutiveFaltasFromDays,
  calculateDaysBetween,
  DAYS_PER_FALTA_CYCLE,
  evaluateInactivity,
  shouldBlockUser,
} from './inactivity-strikes.service';

describe('inactivity-strikes.service', () => {
  describe('DAYS_PER_FALTA_CYCLE', () => {
    it('uses the 60-day routine cycle as the falta unit', () => {
      expect(DAYS_PER_FALTA_CYCLE).toBe(60);
    });
  });

  describe('calculateConsecutiveFaltasFromDays', () => {
    it('returns 0 faltas when inactive for less than 60 days', () => {
      expect(calculateConsecutiveFaltasFromDays(0)).toBe(0);
      expect(calculateConsecutiveFaltasFromDays(30)).toBe(0);
      expect(calculateConsecutiveFaltasFromDays(59)).toBe(0);
    });

    it('returns 1 falta when inactive between 60 and 119 days (1ª falta)', () => {
      expect(calculateConsecutiveFaltasFromDays(60)).toBe(1);
      expect(calculateConsecutiveFaltasFromDays(90)).toBe(1);
      expect(calculateConsecutiveFaltasFromDays(119)).toBe(1);
    });

    it('returns 2 faltas when inactive between 120 and 179 days (2ª falta)', () => {
      expect(calculateConsecutiveFaltasFromDays(120)).toBe(2);
      expect(calculateConsecutiveFaltasFromDays(150)).toBe(2);
      expect(calculateConsecutiveFaltasFromDays(179)).toBe(2);
    });

    it('returns 3 faltas when reaching 180 days (3ª falta consecutiva)', () => {
      expect(calculateConsecutiveFaltasFromDays(180)).toBe(3);
      expect(calculateConsecutiveFaltasFromDays(200)).toBe(3);
      expect(calculateConsecutiveFaltasFromDays(239)).toBe(3);
    });

    it('returns 4 or more faltas for 240 days or beyond', () => {
      expect(calculateConsecutiveFaltasFromDays(240)).toBe(4);
    });
  });

  describe('shouldBlockUser', () => {
    it('does not block for 0, 1, or 2 faltas', () => {
      expect(shouldBlockUser(0)).toBe(false);
      expect(shouldBlockUser(1)).toBe(false);
      expect(shouldBlockUser(2)).toBe(false);
    });

    it('blocks user when reaching 3 or more consecutive faltas (T5)', () => {
      expect(shouldBlockUser(3)).toBe(true);
      expect(shouldBlockUser(4)).toBe(true);
    });
  });

  describe('calculateDaysBetween', () => {
    it('calculates exactly one cycle between two dates', () => {
      const from = new Date('2026-01-15T00:00:00Z');
      const to = new Date('2026-03-16T00:00:00Z');
      expect(calculateDaysBetween(from, to)).toBe(60);
    });

    it('calculates two cycles between two dates', () => {
      const from = new Date('2026-01-15T00:00:00Z');
      const to = new Date('2026-05-15T00:00:00Z');
      expect(calculateDaysBetween(from, to)).toBe(120);
    });

    it('calculates three cycles between two dates', () => {
      const from = new Date('2026-01-15T00:00:00Z');
      const to = new Date('2026-07-14T00:00:00Z');
      expect(calculateDaysBetween(from, to)).toBe(180);
    });

    it('ignores the time of day and counts whole calendar days', () => {
      const from = new Date('2026-01-20T23:00:00Z');
      const to = new Date('2026-04-10T01:00:00Z');
      expect(calculateDaysBetween(from, to)).toBe(80);
    });

    it('returns 0 when the last data date is in the future', () => {
      const from = new Date('2026-09-08T00:00:00Z');
      const to = new Date('2026-09-01T00:00:00Z');
      expect(calculateDaysBetween(from, to)).toBe(0);
    });
  });

  describe('evaluateInactivity', () => {
    it('does not block on 1ª falta (60 days inactive)', () => {
      const result = evaluateInactivity({ daysInactive: 60 });
      expect(result.consecutiveFaltas).toBe(1);
      expect(result.daysInactive).toBe(60);
      expect(result.shouldBlock).toBe(false);
      expect(result.reason).toBeUndefined();
    });

    it('does not block on 2ª falta (120 days inactive)', () => {
      const result = evaluateInactivity({ daysInactive: 120 });
      expect(result.consecutiveFaltas).toBe(2);
      expect(result.daysInactive).toBe(120);
      expect(result.shouldBlock).toBe(false);
      expect(result.reason).toBeUndefined();
    });

    it('blocks user at the 3ª falta consecutiva (180 days inactive) (T5)', () => {
      const result = evaluateInactivity({ daysInactive: 180 });
      expect(result.consecutiveFaltas).toBe(3);
      expect(result.daysInactive).toBe(180);
      expect(result.shouldBlock).toBe(true);
      expect(result.reason).toContain('3ª falta consecutiva');
      expect(result.reason).toContain('180');
    });

    it('blocks user when consecutiveFaltas is directly passed as 3', () => {
      const result = evaluateInactivity({ consecutiveFaltas: 3 });
      expect(result.consecutiveFaltas).toBe(3);
      expect(result.daysInactive).toBe(180);
      expect(result.shouldBlock).toBe(true);
    });

    it('evaluates correctly using dates', () => {
      const lastDataDate = new Date('2026-03-12T00:00:00Z');
      const currentDate = new Date('2026-09-08T00:00:00Z'); // 180 days difference
      const result = evaluateInactivity({ lastDataDate, currentDate });

      expect(result.daysInactive).toBe(180);
      expect(result.consecutiveFaltas).toBe(3);
      expect(result.shouldBlock).toBe(true);
    });

    it('returns no faltas when no input is provided', () => {
      const result = evaluateInactivity({});
      expect(result.consecutiveFaltas).toBe(0);
      expect(result.daysInactive).toBe(0);
      expect(result.shouldBlock).toBe(false);
    });
  });
});
