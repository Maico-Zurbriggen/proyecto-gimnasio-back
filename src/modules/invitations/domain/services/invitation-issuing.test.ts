import { describe, expect, it } from 'vitest';

import { puedeOtorgarRoles, rolesQuePuedeOtorgar } from './invitation-issuing';

describe('invitation-issuing (FL-19, RN-02d)', () => {
  it('el administrador puede invitar con cualquier rol del gimnasio', () => {
    expect(rolesQuePuedeOtorgar(['ADMINISTRADOR'])).toEqual([
      'ALUMNO',
      'ENTRENADOR',
      'ADMINISTRADOR',
    ]);
    expect(puedeOtorgarRoles(['ADMINISTRADOR'], ['ALUMNO', 'ENTRENADOR'])).toBe(
      true,
    );
  });

  it('el entrenador sólo puede invitar alumnos', () => {
    expect(puedeOtorgarRoles(['ENTRENADOR'], ['ALUMNO'])).toBe(true);
    expect(puedeOtorgarRoles(['ENTRENADOR'], ['ENTRENADOR'])).toBe(false);
    expect(puedeOtorgarRoles(['ENTRENADOR'], ['ALUMNO', 'ADMINISTRADOR'])).toBe(
      false,
    );
  });

  it('nadie otorga SUPERADMIN ni invita sin roles', () => {
    expect(puedeOtorgarRoles(['ADMINISTRADOR'], ['SUPERADMIN'])).toBe(false);
    expect(puedeOtorgarRoles(['ADMINISTRADOR'], [])).toBe(false);
    expect(puedeOtorgarRoles(['ALUMNO'], ['ALUMNO'])).toBe(false);
  });
});
