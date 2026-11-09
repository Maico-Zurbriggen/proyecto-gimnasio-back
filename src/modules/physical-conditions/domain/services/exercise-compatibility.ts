import type { Severidad, ZonaCorporal } from './body-zones';

export type CompatibilityState =
  'EJERCICIO_DESACTIVADO' | 'COMPATIBLE' | 'ADVERTIDO' | 'INCOMPATIBLE';

type ExperienceLevel = 'PRINCIPIANTE' | 'INTERMEDIO' | 'AVANZADO';

export interface CompatibilityCondition {
  bodyZoneCode: ZonaCorporal;
  severity: Severidad;
}

export interface ExerciseCompatibilityInput {
  exerciseState: 'PROPUESTO' | 'APROBADO' | 'RECHAZADO' | 'DESACTIVADO';
  exerciseDifficulty: ExperienceLevel;
  studentExperience: ExperienceLevel | null;
  requiredEquipment: readonly string[];
  presentEquipment: readonly string[];
  primaryMuscles: readonly string[];
  joints: readonly string[];
  activeConditions: readonly CompatibilityCondition[];
}

export interface ExerciseCompatibility {
  state: CompatibilityState;
  reason: string | null;
}

const LEVEL_RANK: Record<ExperienceLevel, number> = {
  PRINCIPIANTE: 0,
  INTERMEDIO: 1,
  AVANZADO: 2,
};

function conditionReason(condition: CompatibilityCondition): string {
  const zone = condition.bodyZoneCode.replaceAll('_', ' ').toLowerCase();
  return `Condición física ${condition.severity.toLowerCase()} en ${zone}`;
}

/** Evalúa conjuntamente RN-44a a RN-44d sin depender de Prisma. */
export function evaluateExerciseCompatibility(
  input: ExerciseCompatibilityInput,
): ExerciseCompatibility {
  if (input.exerciseState !== 'APROBADO') {
    return {
      state: 'EJERCICIO_DESACTIVADO',
      reason: 'El ejercicio ya no está aprobado en el catálogo.',
    };
  }

  const incompatibleReasons: string[] = [];
  const warningReasons: string[] = [];
  const studentExperience = input.studentExperience ?? 'PRINCIPIANTE';
  if (LEVEL_RANK[input.exerciseDifficulty] > LEVEL_RANK[studentExperience]) {
    incompatibleReasons.push(
      `Nivel ${input.exerciseDifficulty.toLowerCase()} superior al nivel ${studentExperience.toLowerCase()} del alumno`,
    );
  }

  // RN-115: el peso corporal está siempre disponible aunque no se inventaríe.
  const availableEquipment = new Set([
    ...input.presentEquipment,
    'PESO_CORPORAL',
  ]);
  const missingEquipment = input.requiredEquipment.filter(
    (code) => !availableEquipment.has(code),
  );
  if (missingEquipment.length > 0) {
    incompatibleReasons.push(
      `Equipamiento ausente del inventario: ${missingEquipment.join(', ')}`,
    );
  }

  for (const condition of input.activeConditions) {
    const affectsExercise =
      input.primaryMuscles.includes(condition.bodyZoneCode) ||
      input.joints.includes(condition.bodyZoneCode);
    if (!affectsExercise) continue;
    if (condition.severity === 'LEVE') {
      warningReasons.push(conditionReason(condition));
    } else {
      incompatibleReasons.push(conditionReason(condition));
    }
  }

  if (incompatibleReasons.length > 0) {
    return { state: 'INCOMPATIBLE', reason: incompatibleReasons.join('. ') };
  }
  if (warningReasons.length > 0) {
    return { state: 'ADVERTIDO', reason: warningReasons.join('. ') };
  }
  return { state: 'COMPATIBLE', reason: null };
}
