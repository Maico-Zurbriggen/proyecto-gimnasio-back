import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

interface CatalogEntry {
  id: string;
  name: string;
  instructions: string;
  movementPattern: string;
  difficultyLevel: string;
  unilateral: boolean;
  visualResourceUrl: string;
  primaryMuscle: string;
  secondaryMuscles: string[];
  equipment: string[];
  joints: string[];
}
const { catalog, normalizeName, stableId } = createRequire(
  join(process.cwd(), 'package.json'),
)('./scripts/local-exercise-catalog.cjs') as {
  catalog: CatalogEntry[];
  normalizeName: (name: string) => string;
  stableId: (name: string) => string;
};
const muscles = [
  'PECTORAL',
  'DELTOIDES_ANTERIOR',
  'DELTOIDES_LATERAL',
  'BICEPS',
  'ANTEBRAZO',
  'ABDOMINALES',
  'OBLICUOS',
  'CUADRICEPS',
  'ADUCTORES',
  'DORSAL',
  'TRAPECIO',
  'DELTOIDES_POSTERIOR',
  'TRICEPS',
  'ERECTORES_LUMBARES',
  'GLUTEO',
  'ISQUIOTIBIALES',
  'GEMELOS',
];
const equipment = [
  'BARRA',
  'DISCOS',
  'MANCUERNAS',
  'PESAS_RUSAS',
  'BANCO_PLANO',
  'BANCO_INCLINADO',
  'BANCO_DECLINADO',
  'RACK_SENTADILLA',
  'JAULA_POTENCIA',
  'PRENSA_PIERNAS',
  'POLEA_ALTA',
  'POLEA_BAJA',
  'MAQUINA_PECHO',
  'MAQUINA_ESPALDA',
  'MAQUINA_HOMBRO',
  'MAQUINA_CUADRICEPS',
  'MAQUINA_ISQUIOTIBIALES',
  'MAQUINA_GEMELOS',
  'BARRA_DOMINADAS',
  'PARALELAS',
  'BANDAS_ELASTICAS',
];
const joints = [
  'HOMBRO',
  'CODO',
  'MUNECA',
  'COLUMNA_CERVICAL',
  'COLUMNA_LUMBAR',
  'CADERA',
  'RODILLA',
  'TOBILLO',
];
const patterns = [
  'EMPUJE_HORIZONTAL',
  'EMPUJE_VERTICAL',
  'TRACCION_HORIZONTAL',
  'TRACCION_VERTICAL',
  'DOMINANTE_RODILLA',
  'DOMINANTE_CADERA',
  'CORE',
  'AISLAMIENTO_SUPERIOR',
  'AISLAMIENTO_INFERIOR',
];

describe('expanded local exercise catalog', () => {
  it('contains 132 distinct exercises and covers all 17 primary muscle groups', () => {
    expect(catalog).toHaveLength(132);
    expect(new Set(catalog.map((exercise) => exercise.primaryMuscle))).toEqual(
      new Set(muscles),
    );
    expect(new Set(catalog.map((exercise) => exercise.id)).size).toBe(
      catalog.length,
    );
    expect(
      new Set(catalog.map((exercise) => normalizeName(exercise.name))).size,
    ).toBe(catalog.length);
  });
  it.each(muscles)(
    'contains at least five primary exercises for %s',
    (muscle) => {
      expect(
        catalog.filter((exercise) => exercise.primaryMuscle === muscle).length,
      ).toBeGreaterThanOrEqual(5);
    },
  );
  it('uses only closed vocabulary values and complete exercise metadata', () => {
    for (const exercise of catalog) {
      expect(exercise.id).toMatch(
        /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-8[a-f0-9]{3}-[a-f0-9]{12}$/,
      );
      expect(exercise.name.trim().length).toBeGreaterThan(2);
      expect(exercise.instructions.length).toBeGreaterThan(35);
      expect(patterns).toContain(exercise.movementPattern);
      expect(['PRINCIPIANTE', 'INTERMEDIO', 'AVANZADO']).toContain(
        exercise.difficultyLevel,
      );
      expect(typeof exercise.unilateral).toBe('boolean');
      expect(exercise.visualResourceUrl).toBe('');
      expect(exercise.joints.length).toBeGreaterThan(0);
      expect(new Set(exercise.equipment).size).toBe(exercise.equipment.length);
      expect(new Set(exercise.joints).size).toBe(exercise.joints.length);
      expect(new Set(exercise.secondaryMuscles).size).toBe(
        exercise.secondaryMuscles.length,
      );
      expect(exercise.secondaryMuscles).not.toContain(exercise.primaryMuscle);
      exercise.equipment.forEach((code) => expect(equipment).toContain(code));
      exercise.joints.forEach((code) => expect(joints).toContain(code));
      exercise.secondaryMuscles.forEach((code) =>
        expect(muscles).toContain(code),
      );
    }
  });
  it('deduplicates accented names and produces stable identifiers across repeated imports', () => {
    expect(normalizeName('  Curl de BÍCEPS  con mancuernas ')).toBe(
      'curl de biceps con mancuernas',
    );
    expect(stableId('Curl de bíceps con mancuernas')).toBe(
      stableId('Curl de biceps con mancuernas'),
    );
    expect(stableId('Curl alternado de bíceps con mancuernas')).not.toBe(
      stableId('Curl de bíceps con mancuernas'),
    );
  });
});
