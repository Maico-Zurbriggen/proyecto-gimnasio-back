import { describe, expect, it } from 'vitest';

import {
  calcularVencimiento,
  DIAS_VIGENCIA_INVITACION,
  estadoEfectivo,
  normalizarCorreo,
  puedeOtorgarRoles,
  puedeRevocarInvitacion,
  puedeRevocarse,
  rolesQuePuedeOtorgar,
} from './invitation-issuing';

describe('invitation-issuing domain service (HU08)', () => {
  const ahora = new Date('2026-10-05T12:00:00Z');

  describe('vencimiento (criterio 6)', () => {
    it('una invitación vence a los 14 días (RN-02b)', () => {
      expect(DIAS_VIGENCIA_INVITACION).toBe(14);
    });

    it('calcula el vencimiento desde la emisión', () => {
      expect(calcularVencimiento(ahora).toISOString()).toBe(
        '2026-10-19T12:00:00.000Z',
      );
    });

    it('conserva la hora de emisión', () => {
      const emitida = new Date('2026-10-05T08:30:00Z');
      expect(calcularVencimiento(emitida).toISOString()).toBe(
        '2026-10-19T08:30:00.000Z',
      );
    });
  });

  describe('rolesQuePuedeOtorgar (criterios 2 y 3)', () => {
    it('un administrador puede otorgar cualquier rol', () => {
      expect(rolesQuePuedeOtorgar(['ADMINISTRADOR'])).toEqual([
        'ALUMNO',
        'ENTRENADOR',
        'ADMINISTRADOR',
      ]);
    });

    it('un entrenador sólo puede otorgar ALUMNO (RN-02d, RA-10)', () => {
      expect(rolesQuePuedeOtorgar(['ENTRENADOR'])).toEqual(['ALUMNO']);
    });

    it('un alumno no puede otorgar ningún rol', () => {
      expect(rolesQuePuedeOtorgar(['ALUMNO'])).toEqual([]);
    });

    it('con roles acumulados manda el más amplio', () => {
      // DD-08: los roles son un conjunto. Un entrenador que además administra
      // invita como administrador.
      expect(rolesQuePuedeOtorgar(['ENTRENADOR', 'ADMINISTRADOR'])).toEqual([
        'ALUMNO',
        'ENTRENADOR',
        'ADMINISTRADOR',
      ]);
    });
  });

  describe('puedeOtorgarRoles', () => {
    it('el administrador puede emitir con varios roles a la vez', () => {
      expect(
        puedeOtorgarRoles(['ADMINISTRADOR'], ['ALUMNO', 'ENTRENADOR']),
      ).toBe(true);
    });

    it('criterio 2: el entrenador no puede emitir con rol ENTRENADOR', () => {
      expect(puedeOtorgarRoles(['ENTRENADOR'], ['ENTRENADOR'])).toBe(false);
    });

    it('criterio 2: ni con ADMINISTRADOR', () => {
      expect(puedeOtorgarRoles(['ENTRENADOR'], ['ADMINISTRADOR'])).toBe(false);
    });

    it('criterio 2: tampoco si cuela un rol válido junto a uno que no puede', () => {
      expect(
        puedeOtorgarRoles(['ENTRENADOR'], ['ALUMNO', 'ADMINISTRADOR']),
      ).toBe(false);
    });

    it('el entrenador sí puede emitir con rol ALUMNO', () => {
      expect(puedeOtorgarRoles(['ENTRENADOR'], ['ALUMNO'])).toBe(true);
    });

    it('criterio 3: un alumno no puede emitir', () => {
      expect(puedeOtorgarRoles(['ALUMNO'], ['ALUMNO'])).toBe(false);
    });

    it('criterio 7: una invitación sin ningún rol se rechaza', () => {
      expect(puedeOtorgarRoles(['ADMINISTRADOR'], [])).toBe(false);
    });
  });

  describe('normalizarCorreo (criterio 8)', () => {
    it('quita espacios y pasa a minúsculas', () => {
      expect(normalizarCorreo('  ALUMNO@Gym.Test  ')).toBe('alumno@gym.test');
    });

    it('deja igual un correo ya normalizado', () => {
      expect(normalizarCorreo('alumno@gym.test')).toBe('alumno@gym.test');
    });
  });

  describe('estadoEfectivo (criterio 15)', () => {
    const futuro = new Date('2026-10-19T12:00:00Z');
    const pasado = new Date('2026-10-01T12:00:00Z');

    it('una invitación dentro del plazo sigue VIGENTE', () => {
      expect(estadoEfectivo('VIGENTE', futuro, ahora)).toBe('VIGENTE');
    });

    it('una invitación cuyo plazo pasó se informa CADUCADA, sin proceso previo', () => {
      expect(estadoEfectivo('VIGENTE', pasado, ahora)).toBe('CADUCADA');
    });

    it('caduca en el instante exacto del vencimiento', () => {
      expect(estadoEfectivo('VIGENTE', ahora, ahora)).toBe('CADUCADA');
    });

    it('los estados terminales se informan tal como están', () => {
      expect(estadoEfectivo('USADA', pasado, ahora)).toBe('USADA');
      expect(estadoEfectivo('REVOCADA', pasado, ahora)).toBe('REVOCADA');
    });
  });

  describe('puedeRevocarse (criterios 11 y 12)', () => {
    const futuro = new Date('2026-10-19T12:00:00Z');
    const pasado = new Date('2026-10-01T12:00:00Z');

    it('criterio 11: una invitación vigente puede revocarse', () => {
      expect(puedeRevocarse('VIGENTE', futuro, ahora)).toBe(true);
    });

    it('criterio 12: una invitación usada no se revoca', () => {
      expect(puedeRevocarse('USADA', futuro, ahora)).toBe(false);
    });

    it('criterio 12: una ya revocada tampoco', () => {
      expect(puedeRevocarse('REVOCADA', futuro, ahora)).toBe(false);
    });

    it('criterio 12: una vencida tampoco', () => {
      expect(puedeRevocarse('VIGENTE', pasado, ahora)).toBe(false);
    });
  });

  describe('puedeRevocarInvitacion (criterio 13)', () => {
    const invitacion = { issuedByUserId: 'emisor-1' };

    it('el administrador puede revocar cualquier invitación del gimnasio', () => {
      expect(
        puedeRevocarInvitacion(
          { id: 'otro', roles: ['ADMINISTRADOR'] },
          invitacion,
        ),
      ).toBe(true);
    });

    it('el emisor puede revocar la suya', () => {
      expect(
        puedeRevocarInvitacion(
          { id: 'emisor-1', roles: ['ENTRENADOR'] },
          invitacion,
        ),
      ).toBe(true);
    });

    it('criterio 13: otro entrenador no puede revocarla', () => {
      expect(
        puedeRevocarInvitacion(
          { id: 'entrenador-2', roles: ['ENTRENADOR'] },
          invitacion,
        ),
      ).toBe(false);
    });
  });
});
