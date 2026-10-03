import { generationPrescriptionConstraints } from './generated-routine-validator';
import {
  GenerationPreferencesUnsatisfiableError,
  type MuscleCountRequirement,
} from './generation-request-requirements';

interface ExerciseRef {
  id: string;
  patronMovimiento: string;
  musculosPrimarios?: string[];
}

export const GENERATION_CATALOG_LIMIT = 32;

/** The entire selected catalog is persisted; a large gym catalog is not a prompt. */
export function selectGenerationCatalog<T extends ExerciseRef>(
  catalog: readonly T[],
  requirements: readonly MuscleCountRequirement[],
  focusMuscles: readonly string[],
): T[] {
  const sorted = [...catalog].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
  if (sorted.length <= GENERATION_CATALOG_LIMIT) return sorted;
  const selected = new Map<string, T>();
  const add = (exercise: T | undefined) => {
    if (exercise && selected.size < GENERATION_CATALOG_LIMIT)
      selected.set(exercise.id, exercise);
  };
  for (const { muscle, count } of requirements) {
    const candidates = sorted.filter((exercise) =>
      exercise.musculosPrimarios?.includes(muscle),
    );
    if (
      selected.size + count > GENERATION_CATALOG_LIMIT ||
      candidates.length < count
    ) {
      throw new GenerationPreferencesUnsatisfiableError([
        `No se pueden incluir ${count} ejercicios de ${muscle} en el catálogo de esta solicitud.`,
      ]);
    }
    candidates.slice(0, count).forEach(add);
  }
  // Reserve coverage before adding optional alternatives or unrelated muscles.
  for (const alternatives of generationPrescriptionConstraints()
    .required_pattern_groups) {
    if (
      ![...selected.values()].some((exercise) =>
        alternatives.includes(
          exercise.patronMovimiento as (typeof alternatives)[number],
        ),
      )
    ) {
      add(
        sorted.find((exercise) =>
          alternatives.includes(
            exercise.patronMovimiento as (typeof alternatives)[number],
          ),
        ),
      );
    }
  }
  const excluded = new Set(
    requirements
      .filter((requirement) => requirement.count === 0)
      .map((requirement) => requirement.muscle),
  );
  for (const muscle of [
    ...new Set([
      ...requirements.map((requirement) => requirement.muscle),
      ...focusMuscles,
    ]),
  ]) {
    if (!excluded.has(muscle))
      sorted
        .filter((exercise) => exercise.musculosPrimarios?.includes(muscle))
        .slice(0, 8)
        .forEach(add);
  }
  const groups = new Map<string, T[]>();
  for (const exercise of sorted) {
    const key = exercise.musculosPrimarios?.[0] ?? exercise.patronMovimiento;
    const group = groups.get(key) ?? [];
    group.push(exercise);
    groups.set(key, group);
  }
  while (selected.size < GENERATION_CATALOG_LIMIT) {
    let added = false;
    for (const group of groups.values()) {
      const next = group.find((exercise) => !selected.has(exercise.id));
      if (next && selected.size < GENERATION_CATALOG_LIMIT) {
        add(next);
        added = true;
      }
    }
    if (!added) break;
  }
  return [...selected.values()].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
}
