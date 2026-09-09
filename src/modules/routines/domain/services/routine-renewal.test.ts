import { describe, expect, it } from 'vitest';

import {
  addMonths,
  calculateDaysUntilRenewal,
  calculateRenewalDate,
  calculateRenewalNotice,
  determineNoticeState,
  differenceInCalendarDays,
  EstadoAvisoRenovacion,
} from './routine-renewal';

describe('routine-renewal domain service', () => {
  describe('addMonths', () => {
    it('adds months to a regular date', () => {
      const start = new Date('2026-01-15T00:00:00Z');
      const result = addMonths(start, 3);
      expect(result.toISOString().slice(0, 10)).toBe('2026-04-15');
    });

    it('handles month-end without overflow (May 31 -> August 31)', () => {
      const start = new Date('2026-05-31T00:00:00Z');
      const result = addMonths(start, 3);
      expect(result.toISOString().slice(0, 10)).toBe('2026-08-31');
    });

    it('clamps month-end overflow to the last day of target month (March 31 -> June 30)', () => {
      const start = new Date('2026-03-31T00:00:00Z');
      const result = addMonths(start, 3);
      expect(result.toISOString().slice(0, 10)).toBe('2026-06-30');
    });

    it('handles leap year correctly (Nov 30 2023 -> Feb 29 2024)', () => {
      const start = new Date('2023-11-30T00:00:00Z');
      const result = addMonths(start, 3);
      expect(result.toISOString().slice(0, 10)).toBe('2024-02-29');
    });
  });

  describe('differenceInCalendarDays', () => {
    it('computes positive difference when target is in the future', () => {
      const from = new Date('2026-09-01T12:00:00Z');
      const target = new Date('2026-09-10T08:00:00Z');
      expect(differenceInCalendarDays(target, from)).toBe(9);
    });

    it('computes 0 when both dates fall on the same calendar day', () => {
      const from = new Date('2026-09-08T02:00:00Z');
      const target = new Date('2026-09-08T22:00:00Z');
      expect(differenceInCalendarDays(target, from)).toBe(0);
    });

    it('computes negative difference when target is in the past', () => {
      const from = new Date('2026-09-10T12:00:00Z');
      const target = new Date('2026-09-08T08:00:00Z');
      expect(differenceInCalendarDays(target, from)).toBe(-2);
    });
  });

  describe('calculateRenewalDate', () => {
    it('defaults to 3 months cycle', () => {
      const start = new Date('2026-06-08T10:00:00Z');
      const renewal = calculateRenewalDate(start);
      expect(renewal.toISOString().slice(0, 10)).toBe('2026-09-08');
    });
  });

  describe('calculateDaysUntilRenewal', () => {
    it('returns positive days when renewal date has not arrived yet', () => {
      const renewal = new Date('2026-09-15T00:00:00Z');
      const current = new Date('2026-09-08T00:00:00Z');
      expect(calculateDaysUntilRenewal(renewal, current)).toBe(7);
    });

    it('returns 0 days when renewal date is today', () => {
      const renewal = new Date('2026-09-08T00:00:00Z');
      const current = new Date('2026-09-08T15:30:00Z');
      expect(calculateDaysUntilRenewal(renewal, current)).toBe(0);
    });

    it('returns negative days when renewal date is in the past', () => {
      const renewal = new Date('2026-09-05T00:00:00Z');
      const current = new Date('2026-09-08T00:00:00Z');
      expect(calculateDaysUntilRenewal(renewal, current)).toBe(-3);
    });
  });

  describe('determineNoticeState (T3)', () => {
    it('returns "pendiente" when days remaining > 0', () => {
      expect(determineNoticeState(15)).toBe(EstadoAvisoRenovacion.PENDIENTE);
      expect(determineNoticeState(1)).toBe(EstadoAvisoRenovacion.PENDIENTE);
    });

    it('returns "cerrado hoy" when days remaining === 0', () => {
      expect(determineNoticeState(0)).toBe(EstadoAvisoRenovacion.CERRADO_HOY);
    });

    it('returns "vencido" when days remaining < 0', () => {
      expect(determineNoticeState(-1)).toBe(EstadoAvisoRenovacion.VENCIDO);
      expect(determineNoticeState(-10)).toBe(EstadoAvisoRenovacion.VENCIDO);
    });
  });

  describe('calculateRenewalNotice (T2 + T3 combined)', () => {
    it('produces notice with "pendiente" when cycle is active and in mid-period', () => {
      const startDate = new Date('2026-07-01T00:00:00Z'); // Renewal: 2026-10-01
      const currentDate = new Date('2026-09-08T00:00:00Z');

      const notice = calculateRenewalNotice(startDate, currentDate);
      expect(notice.estado).toBe(EstadoAvisoRenovacion.PENDIENTE);
      expect(notice.diasRestantes).toBe(23);
      expect(notice.fechaVencimiento.toISOString().slice(0, 10)).toBe(
        '2026-10-01',
      );
    });

    it('produces notice with "cerrado hoy" when current date matches the 3-month renewal date', () => {
      const startDate = new Date('2026-06-08T00:00:00Z'); // Renewal: 2026-09-08
      const currentDate = new Date('2026-09-08T00:00:00Z');

      const notice = calculateRenewalNotice(startDate, currentDate);
      expect(notice.estado).toBe(EstadoAvisoRenovacion.CERRADO_HOY);
      expect(notice.diasRestantes).toBe(0);
      expect(notice.fechaVencimiento.toISOString().slice(0, 10)).toBe(
        '2026-09-08',
      );
    });

    it('produces notice with "vencido" when cycle renewal date is past', () => {
      const startDate = new Date('2026-05-01T00:00:00Z'); // Renewal: 2026-08-01
      const currentDate = new Date('2026-09-08T00:00:00Z');

      const notice = calculateRenewalNotice(startDate, currentDate);
      expect(notice.estado).toBe(EstadoAvisoRenovacion.VENCIDO);
      expect(notice.diasRestantes).toBe(-38);
      expect(notice.fechaVencimiento.toISOString().slice(0, 10)).toBe(
        '2026-08-01',
      );
    });
  });
});
