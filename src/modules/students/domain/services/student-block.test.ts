import { describe, expect, it } from 'vitest';

import { evaluateStudentBlock } from './student-block';

const now = new Date('2026-09-15T12:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

describe('evaluateStudentBlock (HU05 - T2)', () => {
  it('Esc. 1: a suspended student is blocked with a reason and the derived strikes', () => {
    const status = evaluateStudentBlock({
      state: 'SUSPENDIDO',
      lastMeasurementOn: daysAgo(200),
      registeredAt: daysAgo(400),
      now,
    });

    expect(status.bloqueado).toBe(true);
    expect(status.faltasConsecutivas).toBe(3);
    expect(status.motivoBloqueo).toContain('3ª falta consecutiva');
  });

  it('an active student is not blocked and has no reason', () => {
    const status = evaluateStudentBlock({
      state: 'ACTIVO',
      lastMeasurementOn: daysAgo(10),
      registeredAt: daysAgo(400),
      now,
    });

    expect(status).toEqual({
      bloqueado: false,
      motivoBloqueo: null,
      faltasConsecutivas: 0,
    });
  });

  it('Esc. 4: a measurement registered today resets the strikes to 0', () => {
    const status = evaluateStudentBlock({
      state: 'ACTIVO',
      lastMeasurementOn: now,
      registeredAt: daysAgo(400),
      now,
    });

    expect(status.faltasConsecutivas).toBe(0);
  });

  it('uses the registration date when the student never measured', () => {
    const status = evaluateStudentBlock({
      state: 'SUSPENDIDO',
      lastMeasurementOn: null,
      registeredAt: daysAgo(130),
      now,
    });

    expect(status.faltasConsecutivas).toBe(2);
    expect(status.motivoBloqueo).toBe(
      'Bloqueado por faltas consecutivas a la renovación de rutina.',
    );
  });
});
