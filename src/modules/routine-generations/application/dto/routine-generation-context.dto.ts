import type { generationPrescriptionConstraints } from '../../domain/services/generated-routine-validator';
import type { MuscleCountRequirement } from '../../domain/services/generation-request-requirements';

export interface MinimizedContext {
  nivelExperiencia: string;
  diasSemanalesDisponibles: number;
  objetivosActivos: string[];
  condiciones: string[];
}

export interface CatalogExerciseRef {
  id: string;
  nombre: string;
  patronMovimiento: string;
  musculosPrimarios?: string[];
}

export interface RoutineGenerationParameters {
  objetivo: string;
  frecuenciaSemanal: number;
  duracionMinutos: number;
  restricciones: string[];
  confianza: number;
}

export interface RoutineGenerationPreferences {
  muscle_counts_per_day?: MuscleCountRequirement[];
  local_test_regeneration?: { replaces_proposed_routine_id: string | null };
  prescription_constraints?: ReturnType<
    typeof generationPrescriptionConstraints
  >;
  free_text: string | null;
  parameters: {
    objective: string;
    weekly_frequency: number;
    duration_minutes: number;
    restrictions: string[];
    confidence: number;
  } | null;
  allowed_catalog: Array<{
    id: string;
    name: string;
    movement_pattern: string;
    primary_muscles?: string[];
  }>;
}
