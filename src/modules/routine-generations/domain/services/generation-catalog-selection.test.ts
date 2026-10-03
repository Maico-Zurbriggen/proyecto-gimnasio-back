import { describe, expect, it } from 'vitest';
import { mentionedMuscles } from './generation-request-requirements';
import { selectGenerationCatalog } from './generation-catalog-selection';

const muscles = [
  'TRICEPS',
  'BICEPS',
  'GLUTEO',
  'PECTORAL',
  'DORSAL',
  'CUADRICEPS',
  'ISQUIOTIBIALES',
  'ABDOMINALES',
  'OBLICUOS',
  'GEMELOS',
  'TRAPECIO',
  'DELTOIDES_ANTERIOR',
  'DELTOIDES_LATERAL',
  'DELTOIDES_POSTERIOR',
  'ANTEBRAZO',
  'ERECTORES_LUMBARES',
  'ADUCTORES',
];
const catalog = muscles.flatMap((muscle, group) =>
  Array.from({ length: 8 }, (_, index) => ({
    id: `exercise-${String(group).padStart(2, '0')}-${index}`,
    musculosPrimarios: [muscle],
    patronMovimiento:
      (
        {
          PECTORAL: 'EMPUJE_HORIZONTAL',
          DORSAL: 'TRACCION_HORIZONTAL',
          CUADRICEPS: 'DOMINANTE_RODILLA',
          GLUTEO: 'DOMINANTE_CADERA',
        } as Record<string, string>
      )[muscle] ?? 'AISLAMIENTO_SUPERIOR',
  })),
);

describe('bounded generation catalog', () => {
  it('preserves a small catalog and sorts it deterministically', () => {
    const small = catalog.slice(0, 3);
    expect(selectGenerationCatalog([...small].reverse(), [], [])).toEqual(
      small,
    );
  });
  it('prioritizes the requested muscle while retaining coverage and diversity', () => {
    const selected = selectGenerationCatalog(
      catalog,
      [{ muscle: 'TRICEPS', count: 5 }],
      ['TRICEPS'],
    );
    expect(selected).toHaveLength(32);
    expect(
      selected.filter((exercise) =>
        exercise.musculosPrimarios.includes('TRICEPS'),
      ),
    ).toHaveLength(8);
    for (const pattern of [
      'EMPUJE_HORIZONTAL',
      'TRACCION_HORIZONTAL',
      'DOMINANTE_RODILLA',
      'DOMINANTE_CADERA',
    ]) {
      expect(
        selected.some((exercise) => exercise.patronMovimiento === pattern),
      ).toBe(true);
    }
    expect(
      new Set(selected.flatMap((exercise) => exercise.musculosPrimarios)).size,
    ).toBe(17);
    expect(
      selectGenerationCatalog(
        [...catalog].reverse(),
        [{ muscle: 'TRICEPS', count: 5 }],
        ['TRICEPS'],
      ),
    ).toEqual(selected);
  });
  it('includes every requested muscle count before filling the remainder', () => {
    const selected = selectGenerationCatalog(
      catalog,
      [
        { muscle: 'TRICEPS', count: 3 },
        { muscle: 'BICEPS', count: 3 },
      ],
      [],
    );
    expect(selected).toHaveLength(32);
    expect(
      selected.filter((exercise) =>
        exercise.musculosPrimarios.includes('TRICEPS'),
      ).length,
    ).toBeGreaterThanOrEqual(3);
    expect(
      selected.filter((exercise) =>
        exercise.musculosPrimarios.includes('BICEPS'),
      ).length,
    ).toBeGreaterThanOrEqual(3);
  });
  it('recognizes muscle focus in free text without prescribing extra counts', () => {
    expect(mentionedMuscles('Priorizar glúteos y bíceps')).toEqual(
      expect.arrayContaining(['GLUTEO', 'BICEPS']),
    );
    const selected = selectGenerationCatalog(
      catalog,
      [],
      mentionedMuscles('Rutina de glúteos'),
    );
    expect(
      selected.filter((exercise) =>
        exercise.musculosPrimarios.includes('GLUTEO'),
      ),
    ).toHaveLength(8);
  });
});
