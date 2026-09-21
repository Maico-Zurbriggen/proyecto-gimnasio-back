import { describe, expect, it } from 'vitest';

import {
  calcularVencimiento,
  debeRefrescarActividad,
  DIAS_INACTIVIDAD_SESION,
  esSesionVigente,
} from './session-policy';

describe('session-policy domain service (HU07 - T2 y T3)', () => {
  const ahora = new Date('2026-09-20T12:00:00Z');

  describe('DIAS_INACTIVIDAD_SESION', () => {
    it('expires sessions after 30 days of inactivity (RN-07)', () => {
      expect(DIAS_INACTIVIDAD_SESION).toBe(30);
    });
  });

  describe('calcularVencimiento', () => {
    it('adds 30 days to the last activity', () => {
      const vence = calcularVencimiento(new Date('2026-09-20T12:00:00Z'));
      expect(vence.toISOString()).toBe('2026-10-20T12:00:00.000Z');
    });

    it('counts from the last activity, not from the session start', () => {
      // Dos sesiones creadas el mismo día vencen distinto si una siguió usándose.
      const inactiva = calcularVencimiento(new Date('2026-09-01T00:00:00Z'));
      const activa = calcularVencimiento(new Date('2026-09-20T00:00:00Z'));
      expect(activa.getTime()).toBeGreaterThan(inactiva.getTime());
    });

    it('accepts an explicit window', () => {
      const vence = calcularVencimiento(new Date('2026-09-20T00:00:00Z'), 1);
      expect(vence.toISOString()).toBe('2026-09-21T00:00:00.000Z');
    });
  });

  describe('esSesionVigente', () => {
    it('accepts a session whose expiry is in the future', () => {
      const sesion = {
        expiresAt: new Date('2026-10-20T12:00:00Z'),
        revokedAt: null,
      };
      expect(esSesionVigente(sesion, ahora)).toBe(true);
    });

    it('T3: rejects a session whose expiry has passed', () => {
      const sesion = {
        expiresAt: new Date('2026-09-19T12:00:00Z'),
        revokedAt: null,
      };
      expect(esSesionVigente(sesion, ahora)).toBe(false);
    });

    it('rejects a session at the exact expiry instant', () => {
      const sesion = { expiresAt: ahora, revokedAt: null };
      expect(esSesionVigente(sesion, ahora)).toBe(false);
    });

    it('T4: rejects a revoked session even if it has not expired', () => {
      const sesion = {
        expiresAt: new Date('2026-10-20T12:00:00Z'),
        revokedAt: new Date('2026-09-20T11:00:00Z'),
      };
      expect(esSesionVigente(sesion, ahora)).toBe(false);
    });

    it('a session exactly 30 days idle is no longer valid', () => {
      const ultimaActividad = new Date('2026-08-21T12:00:00Z');
      const sesion = {
        expiresAt: calcularVencimiento(ultimaActividad),
        revokedAt: null,
      };
      expect(esSesionVigente(sesion, ahora)).toBe(false);
    });

    it('a session idle for 29 days is still valid', () => {
      const ultimaActividad = new Date('2026-08-22T12:00:00Z');
      const sesion = {
        expiresAt: calcularVencimiento(ultimaActividad),
        revokedAt: null,
      };
      expect(esSesionVigente(sesion, ahora)).toBe(true);
    });
  });

  describe('debeRefrescarActividad', () => {
    it('does not refresh when the last activity is recent', () => {
      const hace5min = new Date(ahora.getTime() - 5 * 60 * 1000);
      expect(debeRefrescarActividad(hace5min, ahora)).toBe(false);
    });

    it('refreshes once an hour has gone by', () => {
      const hace1h = new Date(ahora.getTime() - 60 * 60 * 1000);
      expect(debeRefrescarActividad(hace1h, ahora)).toBe(true);
    });

    it('accepts an explicit tolerance', () => {
      const hace2min = new Date(ahora.getTime() - 2 * 60 * 1000);
      expect(debeRefrescarActividad(hace2min, ahora, 60 * 1000)).toBe(true);
    });
  });
});
