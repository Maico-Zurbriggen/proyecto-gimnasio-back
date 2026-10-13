export const EXERCISE_STATES = [
  'PROPUESTO',
  'APROBADO',
  'RECHAZADO',
  'DESACTIVADO',
] as const;
export type ExerciseState = (typeof EXERCISE_STATES)[number];
export const LEVELS = ['PRINCIPIANTE', 'INTERMEDIO', 'AVANZADO'] as const;
export const PATTERNS = [
  'EMPUJE_HORIZONTAL',
  'EMPUJE_VERTICAL',
  'TRACCION_HORIZONTAL',
  'TRACCION_VERTICAL',
  'DOMINANTE_RODILLA',
  'DOMINANTE_CADERA',
  'CORE',
  'AISLAMIENTO_SUPERIOR',
  'AISLAMIENTO_INFERIOR',
] as const;
export const MEDIA_POSES = ['INICIO', 'FINAL', 'PRINCIPAL'] as const;

export interface ExerciseInput {
  name: string;
  description: string | null;
  instructions: string;
  tips: string[];
  movementPattern: (typeof PATTERNS)[number];
  difficultyLevel: (typeof LEVELS)[number];
  unilateral: boolean;
  equipment: string[];
  primaryMuscles: string[];
  secondaryMuscles: string[];
  joints: string[];
  media: { pose: (typeof MEDIA_POSES)[number]; url: string }[];
}

export interface CatalogExercise extends ExerciseInput {
  id: string;
  origin: 'CATALOGO_BASE' | 'GIMNASIO';
  state: ExerciseState;
  revision: number;
  authorUserId: string | null;
  source: string | null;
  reviewObservation: string | null;
  enabled: boolean;
  availabilityUpdatedAt: string | null;
  availabilityRevision: number | null;
  updatedAt: string;
}

export interface CatalogQuery {
  search?: string;
  muscle?: string;
  equipment?: string;
  pattern?: (typeof PATTERNS)[number];
  difficulty?: (typeof LEVELS)[number];
  state?: ExerciseState;
  origin?: 'CATALOGO_BASE' | 'GIMNASIO';
  enabled?: boolean;
  page: number;
  pageSize: number;
}

export interface AvailabilityChange {
  exerciseId: string;
  enabled: boolean;
  expectedRevision: number | null;
}

export interface CatalogActor {
  id: string;
  gymId: string;
  roles: string[];
}

export class CatalogError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

export function requireCatalogRole(actor: CatalogActor, role: string): void {
  if (!actor.roles.includes(role)) throw new CatalogError('forbidden', 403);
}
