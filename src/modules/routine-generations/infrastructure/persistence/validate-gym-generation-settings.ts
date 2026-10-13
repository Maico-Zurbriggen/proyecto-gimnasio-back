import type { Prisma } from '@prisma/client';
import {
  generationSettingsViolations,
  type GenerationSettings,
} from '../../../gyms/domain/generation-settings';
import type { ValidGeneratedRoutine } from '../../domain/services/generated-routine-validator';
import { GeneratedRoutineInvalidError } from '../../domain/errors/routine-generation-errors';

export function generationPolicySnapshot(
  preferences: Prisma.JsonValue,
): Prisma.JsonValue | null {
  if (
    !preferences ||
    typeof preferences !== 'object' ||
    Array.isArray(preferences)
  )
    return null;
  return preferences.gym_generation_settings ?? null;
}

export function validateGymGenerationSettings(
  routine: ValidGeneratedRoutine,
  preferences: Prisma.JsonValue,
): void {
  if (
    !preferences ||
    typeof preferences !== 'object' ||
    Array.isArray(preferences)
  )
    return;
  const snapshot = preferences.gym_generation_settings;
  if (
    !snapshot ||
    typeof snapshot !== 'object' ||
    Array.isArray(snapshot) ||
    !snapshot.settings
  )
    return;
  const violations = generationSettingsViolations(
    routine,
    snapshot.settings as unknown as GenerationSettings,
  );
  if (violations.length) throw new GeneratedRoutineInvalidError(violations);
}
