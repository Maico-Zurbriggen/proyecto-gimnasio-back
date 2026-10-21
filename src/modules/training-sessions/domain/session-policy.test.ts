import { describe, expect, it } from 'vitest';

import {
  ATYPICAL_LOAD_FACTOR,
  COMPLETED_CORRECTION_HOURS,
  INACTIVITY_ABANDON_HOURS,
  isAtypicalLoad,
  isBeyondCorrectionWindow,
  isInactiveSince,
  roundLoadToCent,
  validateCompletedSeries,
  validateSeriesRanges,
} from './session-policy';

describe('session-policy (D6/§4, RN-50 a RN-61)', () => {
  it('detecta inactividad de 8 horas para ABANDONADA (RN-53)', () => {
    const last = new Date('2026-09-01T10:00:00Z');
    expect(isInactiveSince(last, new Date('2026-09-01T17:59:59Z'))).toBe(false);
    expect(isInactiveSince(last, new Date('2026-09-01T18:00:00Z'))).toBe(true);
    expect(INACTIVITY_ABANDON_HOURS).toBe(8);
  });

  it('detecta ventana de corrección de 48 horas para BLOQUEADA (RN-58)', () => {
    const completed = new Date('2026-09-01T10:00:00Z');
    expect(
      isBeyondCorrectionWindow(completed, new Date('2026-09-03T09:59:59Z')),
    ).toBe(false);
    expect(
      isBeyondCorrectionWindow(completed, new Date('2026-09-03T10:00:00Z')),
    ).toBe(true);
    expect(COMPLETED_CORRECTION_HOURS).toBe(48);
  });

  it('rechaza valores fuera de RN-55 con el rango en el mensaje', () => {
    expect(
      validateSeriesRanges({
        performedLoad: -1,
        performedRepetitions: 10,
        perceivedEffort: 5,
      }),
    ).toHaveLength(1);
    expect(
      validateSeriesRanges({
        performedLoad: 1000.01,
        performedRepetitions: 10,
        perceivedEffort: 5,
      }),
    ).toHaveLength(1);
    expect(
      validateSeriesRanges({
        performedLoad: 20,
        performedRepetitions: 101,
        perceivedEffort: 5,
      }),
    ).toHaveLength(1);
    expect(
      validateSeriesRanges({
        performedLoad: 20,
        performedRepetitions: 10,
        perceivedEffort: 11,
      }),
    ).toHaveLength(1);
    expect(
      validateSeriesRanges({
        performedLoad: 0,
        performedRepetitions: 1,
        perceivedEffort: 1,
      }),
    ).toHaveLength(0);
  });

  it('marca atípico sólo por encima del 150% con histórico (RN-55a)', () => {
    expect(isAtypicalLoad(151, 100)).toBe(true);
    expect(isAtypicalLoad(150, 100)).toBe(false);
    expect(isAtypicalLoad(1000, null)).toBe(false);
    expect(isAtypicalLoad(1000, 0)).toBe(false);
    expect(ATYPICAL_LOAD_FACTOR).toBe(1.5);
  });

  it('redondea la carga una sola vez a 0,01', () => {
    expect(roundLoadToCent(20.005)).toBe(20.01);
    expect(roundLoadToCent(20.004)).toBe(20);
  });

  it('exige ejercicio, carga y repeticiones al completar (CHECK de base)', () => {
    expect(
      validateCompletedSeries({
        completed: false,
        performedExerciseId: null,
        performedLoad: null,
        performedRepetitions: null,
      }),
    ).toHaveLength(0);
    expect(
      validateCompletedSeries({
        completed: true,
        performedExerciseId: 'ej-1',
        performedLoad: 20,
        performedRepetitions: 10,
      }),
    ).toHaveLength(0);
    expect(
      validateCompletedSeries({
        completed: true,
        performedExerciseId: null,
        performedLoad: 20,
        performedRepetitions: 10,
      }),
    ).toHaveLength(1);
    expect(
      validateCompletedSeries({
        completed: true,
        performedExerciseId: 'ej-1',
        performedLoad: null,
        performedRepetitions: null,
      }),
    ).toHaveLength(2);
  });
});
