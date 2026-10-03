export interface MuscleCountRequirement {
  muscle: string;
  count: number;
}

const MUSCLES: Record<string, string> = {
  pectoral: 'PECTORAL',
  pectorales: 'PECTORAL',
  pecho: 'PECTORAL',
  deltoides_anterior: 'DELTOIDES_ANTERIOR',
  deltoides_lateral: 'DELTOIDES_LATERAL',
  deltoides_posterior: 'DELTOIDES_POSTERIOR',
  biceps: 'BICEPS',
  triceps: 'TRICEPS',
  antebrazo: 'ANTEBRAZO',
  antebrazos: 'ANTEBRAZO',
  abdominales: 'ABDOMINALES',
  oblicuos: 'OBLICUOS',
  cuadriceps: 'CUADRICEPS',
  aductores: 'ADUCTORES',
  dorsal: 'DORSAL',
  dorsales: 'DORSAL',
  trapecio: 'TRAPECIO',
  erectores_lumbares: 'ERECTORES_LUMBARES',
  gluteo: 'GLUTEO',
  gluteos: 'GLUTEO',
  isquiotibiales: 'ISQUIOTIBIALES',
  gemelos: 'GEMELOS',
};
const COUNTS: Record<string, number> = {
  un: 1,
  uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
};

export function mentionedMuscles(text: string | null): string[] {
  const normalized = (text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/_/g, ' ');
  return [
    ...new Set(
      Object.entries(MUSCLES)
        .filter(([name]) =>
          new RegExp(`\\b${name.replace(/_/g, ' ')}\\b`).test(normalized),
        )
        .map(([, muscle]) => muscle),
    ),
  ];
}

export class GenerationPreferencesUnsatisfiableError extends Error {
  constructor(public readonly violations: string[]) {
    super('The requested preferences cannot be fulfilled');
    this.name = 'GenerationPreferencesUnsatisfiableError';
  }
}

/** Only explicit counts are interpreted here; free-form instructions still go to the LLM. */
export function extractMuscleCountRequirements(
  text: string | null,
): MuscleCountRequirement[] {
  const normalized = (text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const expression =
    /\b(\d+|un|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+ejercicios?\s+(?:de|para(?:\s+(?:el|los|las))?)\s+([a-z_ ]+?)\s+(?:por\s+(?:dia|sesion)|(?:en\s+)?cada\s+(?:dia|sesion)|diarios?)\b/g;
  const requirements = new Map<string, number>();
  for (const match of normalized.matchAll(expression)) {
    const muscle = MUSCLES[match[2]!.trim().replace(/\s+/g, '_')];
    if (!muscle) continue;
    const count = COUNTS[match[1]!] ?? Number(match[1]);
    const prefix = normalized.slice(Math.max(0, match.index - 30), match.index);
    if (
      /\b(?:no\s+(?:(?:quiero|incluyas|agregues|pongas|incluir)\s+)?|sin\s+)$/.test(
        prefix,
      ) ||
      !Number.isSafeInteger(count) ||
      count > 8
    ) {
      throw new GenerationPreferencesUnsatisfiableError([
        `La cantidad solicitada para ${muscle} es ambigua o supera 8 ejercicios por día. Reformulá el pedido.`,
      ]);
    }
    if (requirements.has(muscle) && requirements.get(muscle) !== count) {
      throw new GenerationPreferencesUnsatisfiableError([
        `El pedido contiene cantidades distintas para ${muscle} por día.`,
      ]);
    }
    requirements.set(muscle, count);
  }
  return [...requirements].map(([muscle, count]) => ({ muscle, count }));
}

export function validateMuscleCountRequirements(
  days: readonly {
    position: number;
    exercises: readonly { exerciseId: string }[];
  }[],
  catalog: readonly { id: string; primaryMuscles?: readonly string[] }[],
  requirements: readonly MuscleCountRequirement[],
): string[] {
  const byId = new Map(catalog.map((exercise) => [exercise.id, exercise]));
  return days.flatMap((day) =>
    requirements.flatMap(({ muscle, count }) => {
      const selected = day.exercises
        .filter((exercise) =>
          byId.get(exercise.exerciseId)?.primaryMuscles?.includes(muscle),
        )
        .map((exercise) => exercise.exerciseId);
      const actual = new Set(selected).size;
      return actual === count && selected.length === count
        ? []
        : [
            `Día ${day.position}: se pidieron ${count} ejercicios distintos de ${muscle}, pero la propuesta incluye ${selected.length} (${actual} distintos).`,
          ];
    }),
  );
}
