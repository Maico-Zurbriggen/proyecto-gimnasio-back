import { describe, expect, it } from 'vitest';

import {
  calculateConsecutiveFaltasFromMonths,
  calculateMonthsBetween,
  evaluateInactivity,
  shouldBlockUser,
} from './inactivity-strikes.service';

describe('inactivity-strikes.service', () => {
  describe('calculateConsecutiveFaltasFromMonths', () => {
    it('returns 0 faltas when inactive for less than 3 months', () => {
      expect(calculateConsecutiveFaltasFromMonths(0)).toBe(0);
      expect(calculateConsecutiveFaltasFromMonths(1)).toBe(0);
      expect(calculateConsecutiveFaltasFromMonths(2)).toBe(0);
    });

    it('returns 1 falta when inactive between 3 and 5 months (1ª falta)', () => {
      expect(calculateConsecutiveFaltasFromMonths(3)).toBe(1);
      expect(calculateConsecutiveFaltasFromMonths(4)).toBe(1);
      expect(calculateConsecutiveFaltasFromMonths(5)).toBe(1);
    });

    it('returns 2 faltas when inactive between 6 and 8 months (2ª falta)', () => {
      expect(calculateConsecutiveFaltasFromMonths(6)).toBe(2);
      expect(calculateConsecutiveFaltasFromMonths(7)).toBe(2);
      expect(calculateConsecutiveFaltasFromMonths(8)).toBe(2);
    });

    it('returns 3 faltas when reaching 9 months (3ª falta consecutiva)', () => {
      expect(calculateConsecutiveFaltasFromMonths(9)).toBe(3);
      expect(calculateConsecutiveFaltasFromMonths(10)).toBe(3);
      expect(calculateConsecutiveFaltasFromMonths(11)).toBe(3);
    });

    it('returns 4 or more faltas for 12 months or beyond', () => {
      expect(calculateConsecutiveFaltasFromMonths(12)).toBe(4);
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

  describe('calculateMonthsBetween', () => {
    it('calculates exact 3 months between two dates', () => {
      const from = new Date('2026-01-15T00:00:00Z');
      const to = new Date('2026-04-15T00:00:00Z');
      expect(calculateMonthsBetween(from, to)).toBe(3);
    });

    it('calculates 6 months between two dates', () => {
      const from = new Date('2026-01-15T00:00:00Z');
      const to = new Date('2026-07-15T00:00:00Z');
      expect(calculateMonthsBetween(from, to)).toBe(6);
    });

    it('calculates 9 months between two dates', () => {
      const from = new Date('2026-01-15T00:00:00Z');
      const to = new Date('2026-10-15T00:00:00Z');
      expect(calculateMonthsBetween(from, to)).toBe(9);
    });

    it('accounts for day of month when month is not fully completed', () => {
      const from = new Date('2026-01-20T00:00:00Z');
      const to = new Date('2026-04-10T00:00:00Z'); // 2 months and 21 days
      expect(calculateMonthsBetween(from, to)).toBe(2);
    });
  });

  describe('evaluateInactivity', () => {
    it('does not block on 1ª falta (3 months inactive)', () => {
      const result = evaluateInactivity({ monthsInactive: 3 });
      expect(result.consecutiveFaltas).toBe(1);
      expect(result.monthsInactive).toBe(3);
      expect(result.shouldBlock).toBe(false);
      expect(result.reason).toBeUndefined();
    });

    it('does not block on 2ª falta (6 months inactive)', () => {
      const result = evaluateInactivity({ monthsInactive: 6 });
      expect(result.consecutiveFaltas).toBe(2);
      expect(result.monthsInactive).toBe(6);
      expect(result.shouldBlock).toBe(false);
      expect(result.reason).toBeUndefined();
    });

    it('blocks user at the 3ª falta consecutiva (9 months inactive) (T5)', () => {
      const result = evaluateInactivity({ monthsInactive: 9 });
      expect(result.consecutiveFaltas).toBe(3);
      expect(result.monthsInactive).toBe(9);
      expect(result.shouldBlock).toBe(true);
      expect(result.reason).toContain('3ª falta consecutiva');
    });

    it('blocks user when consecutiveFaltas is directly passed as 3', () => {
      const result = evaluateInactivity({ consecutiveFaltas: 3 });
      expect(result.consecutiveFaltas).toBe(3);
      expect(result.shouldBlock).toBe(true);
    });

    it('evaluates correctly using dates', () => {
      const lastDataDate = new Date('2025-12-08T00:00:00Z');
      const currentDate = new Date('2026-09-08T00:00:00Z'); // 9 months difference
      const result = evaluateInactivity({ lastDataDate, currentDate });

      expect(result.monthsInactive).toBe(9);
      expect(result.consecutiveFaltas).toBe(3);
      expect(result.shouldBlock).toBe(true);
    });
  });
});
