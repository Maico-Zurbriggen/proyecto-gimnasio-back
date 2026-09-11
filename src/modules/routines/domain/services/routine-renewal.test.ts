import { describe, expect, it } from 'vitest';

import {
  addDays,
  calculateDaysUntilRenewal,
  calculateRenewalDate,
  calculateRenewalNotice,
  determineNoticeState,
  DIAS_ANTELACION_AVISO,
  differenceInCalendarDays,
  DURACION_CICLO_DIAS,
  EstadoAvisoRenovacion,
  isNoticeDismissible,
  shouldDisplayNotice,
} from './routine-renewal';

describe('routine-renewal domain service', () => {
  describe('DURACION_CICLO_DIAS (T1)', () => {
    it('defines the routine cycle as 60 days', () => {
      expect(DURACION_CICLO_DIAS).toBe(60);
    });

    it('shows the renewal notice 7 days in advance', () => {
      expect(DIAS_ANTELACION_AVISO).toBe(7);
    });
  });

  describe('addDays', () => {
    it('adds days within the same month', () => {
      const start = new Date('2026-01-15T00:00:00Z');
      const result = addDays(start, 10);
      expect(result.toISOString().slice(0, 10)).toBe('2026-01-25');
    });

    it('rolls over into the following month', () => {
      const start = new Date('2026-05-31T00:00:00Z');
      const result = addDays(start, DURACION_CICLO_DIAS);
      expect(result.toISOString().slice(0, 10)).toBe('2026-07-30');
    });

    it('rolls over into the following year', () => {
      const start = new Date('2026-11-15T00:00:00Z');
      const result = addDays(start, DURACION_CICLO_DIAS);
      expect(result.toISOString().slice(0, 10)).toBe('2027-01-14');
    });

    it('counts February 29 in a leap year', () => {
      const start = new Date('2023-12-31T00:00:00Z');
      const result = addDays(start, DURACION_CICLO_DIAS);
      expect(result.toISOString().slice(0, 10)).toBe('2024-02-29');
    });

    it('preserves the time of day', () => {
      const start = new Date('2026-01-15T10:30:00Z');
      const result = addDays(start, DURACION_CICLO_DIAS);
      expect(result.toISOString()).toBe('2026-03-16T10:30:00.000Z');
    });

    it('does not mutate the received date', () => {
      const start = new Date('2026-01-15T00:00:00Z');
      addDays(start, DURACION_CICLO_DIAS);
      expect(start.toISOString().slice(0, 10)).toBe('2026-01-15');
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
    it('defaults to a 60-day cycle', () => {
      const start = new Date('2026-06-08T10:00:00Z');
      const renewal = calculateRenewalDate(start);
      expect(renewal.toISOString().slice(0, 10)).toBe('2026-08-07');
    });

    it('accepts an explicit cycle duration in days', () => {
      const start = new Date('2026-06-08T10:00:00Z');
      const renewal = calculateRenewalDate(start, 30);
      expect(renewal.toISOString().slice(0, 10)).toBe('2026-07-08');
    });

    it('yields a fixed duration regardless of the starting month', () => {
      // Es la diferencia con el ciclo en meses calendario: arrancando en febrero
      // o en julio, el ciclo siempre dura exactamente 60 días.
      const febrero = calculateRenewalDate(new Date('2026-02-01T00:00:00Z'));
      const julio = calculateRenewalDate(new Date('2026-07-01T00:00:00Z'));

      expect(
        differenceInCalendarDays(febrero, new Date('2026-02-01T00:00:00Z')),
      ).toBe(DURACION_CICLO_DIAS);
      expect(
        differenceInCalendarDays(julio, new Date('2026-07-01T00:00:00Z')),
      ).toBe(DURACION_CICLO_DIAS);
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

  describe('shouldDisplayNotice (HU01, Esc. 1 y 2)', () => {
    it('hides the notice when more than 7 days remain', () => {
      expect(shouldDisplayNotice(8)).toBe(false);
      expect(shouldDisplayNotice(30)).toBe(false);
    });

    it('shows the notice from 7 days out', () => {
      expect(shouldDisplayNotice(7)).toBe(true);
      expect(shouldDisplayNotice(1)).toBe(true);
    });

    it('keeps showing the notice on and after the renewal date', () => {
      expect(shouldDisplayNotice(0)).toBe(true);
      expect(shouldDisplayNotice(-5)).toBe(true);
    });
  });

  describe('isNoticeDismissible (HU01, Esc. 2.1 y 4)', () => {
    it('allows dismissing a pending notice', () => {
      expect(isNoticeDismissible(EstadoAvisoRenovacion.PENDIENTE)).toBe(true);
    });

    it('allows dismissing a notice expiring today', () => {
      expect(isNoticeDismissible(EstadoAvisoRenovacion.CERRADO_HOY)).toBe(true);
    });

    it('does not allow dismissing an expired notice', () => {
      expect(isNoticeDismissible(EstadoAvisoRenovacion.VENCIDO)).toBe(false);
    });
  });

  describe('calculateRenewalNotice - criterios de aceptacion HU01', () => {
    const hoy = new Date('2026-09-08T00:00:00Z');

    it('Esc. 1: cycle started 52 days ago -> no notice (8 days remain)', () => {
      const notice = calculateRenewalNotice(
        new Date('2026-07-18T00:00:00Z'),
        hoy,
      );

      expect(notice.diasRestantes).toBe(8);
      expect(shouldDisplayNotice(notice.diasRestantes)).toBe(false);
      expect(notice.estado).toBe(EstadoAvisoRenovacion.PENDIENTE);
    });

    it('Esc. 2: cycle started 53 days ago -> notice shown and dismissible (7 days remain)', () => {
      const notice = calculateRenewalNotice(
        new Date('2026-07-17T00:00:00Z'),
        hoy,
      );

      expect(notice.diasRestantes).toBe(7);
      expect(shouldDisplayNotice(notice.diasRestantes)).toBe(true);
      expect(isNoticeDismissible(notice.estado)).toBe(true);
      expect(notice.estado).toBe(EstadoAvisoRenovacion.PENDIENTE);
    });

    it('Esc. 3: exact renewal day -> "cerrado hoy", distinct from "pendiente"', () => {
      const notice = calculateRenewalNotice(
        new Date('2026-07-10T00:00:00Z'),
        hoy,
      );

      expect(notice.diasRestantes).toBe(0);
      expect(notice.estado).toBe(EstadoAvisoRenovacion.CERRADO_HOY);
      expect(notice.estado).not.toBe(EstadoAvisoRenovacion.PENDIENTE);
      expect(shouldDisplayNotice(notice.diasRestantes)).toBe(true);
      expect(notice.fechaVencimiento.toISOString().slice(0, 10)).toBe(
        '2026-09-08',
      );
    });

    it('Esc. 4: cycle already expired -> "vencido" and not dismissible', () => {
      const notice = calculateRenewalNotice(
        new Date('2026-06-30T00:00:00Z'),
        hoy,
      );

      expect(notice.diasRestantes).toBe(-10);
      expect(notice.estado).toBe(EstadoAvisoRenovacion.VENCIDO);
      expect(shouldDisplayNotice(notice.diasRestantes)).toBe(true);
      expect(isNoticeDismissible(notice.estado)).toBe(false);
    });

    it('produces a mid-cycle notice with 30 days remaining', () => {
      const notice = calculateRenewalNotice(
        new Date('2026-08-09T00:00:00Z'),
        hoy,
      );

      expect(notice.estado).toBe(EstadoAvisoRenovacion.PENDIENTE);
      expect(notice.diasRestantes).toBe(30);
      expect(shouldDisplayNotice(notice.diasRestantes)).toBe(false);
      expect(notice.fechaVencimiento.toISOString().slice(0, 10)).toBe(
        '2026-10-08',
      );
    });
  });
});
