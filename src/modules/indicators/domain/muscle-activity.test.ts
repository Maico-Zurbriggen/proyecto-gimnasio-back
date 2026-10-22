import { describe, expect, it } from 'vitest';
import {
  GRUPOS_MUSCULARES,
  presentMuscleActivity,
  validClassification,
} from './muscle-activity';
import { volumenPorGrupo } from './volume';

const muscles = [
  { group: 'PECTORAL', participation: 'PRIMARIA' as const },
  { group: 'TRICEPS', participation: 'SECUNDARIA' as const },
  { group: 'DELTOIDES_ANTERIOR', participation: 'SECUNDARIA' as const },
];

describe('HU25 muscle activity', () => {
  it('counts 1.0/0.5 effective sets and excludes warmup/incomplete sets', () => {
    const series = Array.from({ length: 3 }, () => ({
      completed: true,
      warmup: false,
      musculos: muscles.map((m) => ({
        grupo: m.group,
        participacion: m.participation,
      })),
    }));
    const result = volumenPorGrupo([
      ...series,
      { ...series[0]!, warmup: true },
      { ...series[0]!, completed: false },
    ]);
    expect([...result]).toEqual([
      ['PECTORAL', 3],
      ['TRICEPS', 1.5],
      ['DELTOIDES_ANTERIOR', 1.5],
    ]);
  });

  it('returns the official 17 groups and separates missing data from calculated zero', () => {
    const empty = presentMuscleActivity(0, [], []);
    expect(empty.groups.map((g) => g.group)).toEqual(GRUPOS_MUSCULARES);
    expect(empty.groups).toHaveLength(17);
    expect(
      empty.groups.every(
        (g) =>
          g.volume === null && g.frequency === null && g.status === 'SIN_DATOS',
      ),
    ).toBe(true);
    const zero = presentMuscleActivity(1, [], []);
    expect(
      zero.groups.every(
        (g) => g.volume === 0 && g.frequency === 0 && g.status === 'CALCULADO',
      ),
    ).toBe(true);
  });

  it('keeps exercise work sets separate from weighted volume and session frequency', () => {
    const result = presentMuscleActivity(
      2,
      [{ group: 'PECTORAL', primarySets: 3, secondarySets: 1, sessions: 2 }],
      [{ exerciseId: 'press', completedWorkSets: 4, sessions: 2, muscles }],
    );
    expect(result.groups[0]).toEqual({
      group: 'PECTORAL',
      volume: 3.5,
      frequency: 2,
      status: 'CALCULADO',
    });
    expect(result.exerciseVolumes[0]).toMatchObject({
      completedWorkSets: 4,
      unit: 'SERIES_DE_TRABAJO',
      classification: 'CLASIFICADO',
    });
  });

  it('identifies invalid classifications without assigning arbitrary groups or reporting zero', () => {
    const result = presentMuscleActivity(
      1,
      [],
      [
        {
          exerciseId: 'unknown',
          completedWorkSets: 1,
          sessions: 1,
          muscles: [],
        },
      ],
    );
    expect(result.exerciseVolumes[0]!.classification).toBe('NO_CLASIFICADO');
    expect(result.groups.every((g) => g.volume === null)).toBe(true);
    expect(
      validClassification([{ group: 'INVENTADO', participation: 'PRIMARIA' }]),
    ).toBe(false);
    expect(
      validClassification([{ group: 'PECTORAL', participation: 'SECUNDARIA' }]),
    ).toBe(false);
    expect(validClassification([...muscles, muscles[0]!])).toBe(false);
  });
});
