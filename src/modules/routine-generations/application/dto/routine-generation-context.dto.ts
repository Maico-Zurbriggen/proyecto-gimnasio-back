import type { generationPrescriptionConstraints } from '../../domain/services/generated-routine-validator';
import type { MuscleCountRequirement } from '../../domain/services/generation-request-requirements';

export interface MinimizedContext {
  nivelExperiencia: string;
  diasSemanalesDisponibles: number;
  objetivosActivos: string[];
  condiciones: string[];
  schema_version?: '2.0';
  captured_at?: string;
  profile_hash?: string;
  profile?: {
    age_years: number;
    sex: string;
    height_cm: number;
    weight_kg: number | null;
  };
  physical_conditions?: {
    body_zone: string;
    severity: string;
    starts_on: string;
    ends_on: string | null;
  }[];
  available_equipment?: string[];
  fitness_clearance?: 'VIGENTE' | 'VENCIDA' | 'AUSENTE';
  inventory_revision?: number;
  history?: {
    period_start: string;
    period_end: string;
    completed_sessions: number;
    work_sets: number;
    effort_mean: number | null;
    latest_session: string | null;
    current_routine: {
      routine_type: string;
      weekly_frequency: number;
      exercise_ids: string[];
    } | null;
    exercise_performance?: {
      exercise_id: string;
      exercise_name?: string | null;
      work_sets: number;
      average_load: number | null;
      average_repetitions: number | null;
      average_effort: number | null;
    }[];
  };
}

export interface CatalogExerciseRef {
  id: string;
  nombre: string;
  patronMovimiento: string;
  musculosPrimarios?: string[];
  musculosSecundarios?: string[];
  instrucciones?: string;
  descripcion?: string | null;
  consejos?: string[];
  dificultad?: string;
  unilateral?: boolean;
  equipamiento?: string[];
  articulaciones?: string[];
  revision?: number;
  availabilityUpdatedAt?: string;
  availabilityRevision?: number;
}

export interface RoutineGenerationParameters {
  objetivo: string;
  frecuenciaSemanal: number;
  duracionMinutos: number;
  restricciones: string[];
  confianza: number;
}

export interface RoutineGenerationPreferences {
  schema_version?: '2.0';
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
    secondary_muscles?: string[];
    instructions?: string;
    description?: string | null;
    tips?: string[];
    difficulty_level?: string;
    unilateral?: boolean;
    equipment?: string[];
    joints?: string[];
    revision?: number;
    availability_updated_at?: string;
    availability_revision?: number;
  }>;
}
