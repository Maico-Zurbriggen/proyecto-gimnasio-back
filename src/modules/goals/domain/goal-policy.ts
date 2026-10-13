export const goalTypes = [
  'FUERZA',
  'HIPERTROFIA',
  'RESISTENCIA_MUSCULAR',
  'ACONDICIONAMIENTO_GENERAL',
] as const;
export type TrainingPurpose = (typeof goalTypes)[number];
export function requiresGoalConfirmation(
  routineType: TrainingPurpose,
  goal: TrainingPurpose | null,
): boolean {
  return (
    goal !== null &&
    routineType !== 'ACONDICIONAMIENTO_GENERAL' &&
    routineType !== goal
  );
}
export const purposeSchemes = {
  FUERZA: {
    minSets: 3,
    maxSets: 5,
    minRepetitions: 3,
    maxRepetitions: 6,
    restSeconds: 180,
  },
  HIPERTROFIA: {
    minSets: 3,
    maxSets: 4,
    minRepetitions: 6,
    maxRepetitions: 12,
    restSeconds: 60,
  },
  RESISTENCIA_MUSCULAR: {
    minSets: 2,
    maxSets: 4,
    minRepetitions: 12,
    maxRepetitions: 20,
    restSeconds: 30,
  },
  ACONDICIONAMIENTO_GENERAL: {
    minSets: 2,
    maxSets: 3,
    minRepetitions: 8,
    maxRepetitions: 15,
    restSeconds: 45,
  },
} as const;
