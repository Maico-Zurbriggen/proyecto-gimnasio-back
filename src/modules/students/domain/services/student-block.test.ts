import { describe, expect, it } from 'vitest';

import { evaluateStudentBlock } from './student-block';

describe('evaluateStudentBlock', () => {
  it('reports the persisted block while the measurement is pending', () => {
    const status = evaluateStudentBlock({
      activeBlock: {
        state: 'PENDIENTE_MEDICION',
        reason: 'TRES_FALTAS_CONSECUTIVAS',
        consecutiveMissesAtBlock: 3,
        blockedAt: new Date('2026-09-15T12:00:00Z'),
        submittedAt: null,
      },
      checkpointResults: ['FALTA', 'FALTA', 'FALTA'],
    });

    expect(status).toMatchObject({
      bloqueado: true,
      measurementBlockState: 'PENDIENTE_MEDICION',
      faltasConsecutivas: 3,
      submittedAt: null,
    });
    expect(status.motivoBloqueo).toContain('faltas consecutivas');
  });

  it('remains blocked while trainer approval is pending', () => {
    const submittedAt = new Date('2026-09-16T09:00:00Z');
    const status = evaluateStudentBlock({
      activeBlock: {
        state: 'PENDIENTE_APROBACION',
        reason: 'TRES_FALTAS_CONSECUTIVAS',
        consecutiveMissesAtBlock: 3,
        blockedAt: new Date('2026-09-15T12:00:00Z'),
        submittedAt,
      },
      checkpointResults: ['FALTA', 'FALTA', 'FALTA'],
    });

    expect(status.bloqueado).toBe(true);
    expect(status.measurementBlockState).toBe('PENDIENTE_APROBACION');
    expect(status.submittedAt).toEqual(submittedAt);
  });

  it('counts only the latest consecutive misses without an active block', () => {
    const status = evaluateStudentBlock({
      activeBlock: null,
      checkpointResults: ['FALTA', 'FALTA', 'CUMPLIDO', 'FALTA'],
    });

    expect(status).toEqual({
      bloqueado: false,
      measurementBlockState: 'NORMAL',
      motivoBloqueo: null,
      faltasConsecutivas: 2,
      blockedAt: null,
      submittedAt: null,
    });
  });

  it('a fulfilled latest checkpoint resets the streak', () => {
    expect(
      evaluateStudentBlock({
        activeBlock: null,
        checkpointResults: ['CUMPLIDO', 'FALTA', 'FALTA'],
      }).faltasConsecutivas,
    ).toBe(0);
  });
});
