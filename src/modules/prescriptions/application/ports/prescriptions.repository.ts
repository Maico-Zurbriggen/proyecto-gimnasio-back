/** Patrón de movimiento del glosario, tal como lo define el enum `MovementPattern`. */
export type MovementPattern =
  | 'EMPUJE_HORIZONTAL'
  | 'EMPUJE_VERTICAL'
  | 'TRACCION_HORIZONTAL'
  | 'TRACCION_VERTICAL'
  | 'DOMINANTE_RODILLA'
  | 'DOMINANTE_CADERA'
  | 'CORE'
  | 'AISLAMIENTO_SUPERIOR'
  | 'AISLAMIENTO_INFERIOR';

export type TrainingPurpose =
  | 'FUERZA'
  | 'HIPERTROFIA'
  | 'RESISTENCIA_MUSCULAR'
  | 'ACONDICIONAMIENTO_GENERAL';

export type RoutineState =
  | 'PROPUESTA'
  | 'BLOQUEADA'
  | 'VIGENTE'
  | 'RECHAZADA'
  | 'DESCARTADA'
  | 'ARCHIVADA';

export type RoutineReviewResult =
  'APROBADA' | 'APROBADA_CON_CAMBIOS' | 'RECHAZADA';

/** Plantilla como la ve el entrenador al elegir, sin su contenido completo. */
export interface RoutineTemplateSummary {
  id: string;
  name: string;
  routineType: TrainingPurpose;
  dayCount: number;
  exerciseCount: number;
}

/** Contenido de la plantilla que se copia al asignarla (RF-022). */
export interface TemplateContent {
  id: string;
  gymId: string;
  routineType: TrainingPurpose;
  days: TemplateContentDay[];
}

export interface TemplateContentDay {
  position: number;
  name: string;
  exercises: TemplateContentExercise[];
}

export interface TemplateContentExercise {
  exerciseId: string;
  position: number;
  note: string | null;
  /** Del ejercicio del catálogo; la plantilla no lo guarda por día. */
  movementPattern: MovementPattern;
  sets: PrescribedSetContent[];
}

export interface PrescribedSetContent {
  position: number;
  minRepetitions: number;
  maxRepetitions: number;
  suggestedLoad: number;
  restSeconds: number;
  warmup: boolean;
}

/** Rutina a crear, ya resuelta por el caso de uso. */
export interface CreateRoutineCommand {
  studentId: string;
  requestedByUserId: string;
  sourceTemplateId: string;
  routineType: TrainingPurpose;
  targetWeeklyFrequency: number;
  days: {
    position: number;
    name: string;
    dominantPattern: MovementPattern;
    exercises: {
      exerciseId: string;
      position: number;
      note: string | null;
      sets: PrescribedSetContent[];
    }[];
  }[];
}

export interface ReviewRoutineCommand {
  routineId: string;
  versionId: string;
  reviewerTrainerId: string;
  result: RoutineReviewResult;
  observation: string | null;
  /** Rutina VIGENTE del alumno que se archiva al aprobar esta. */
  previousActiveRoutineId: string | null;
}

/** Rutina en el listado del alumno. */
export interface RoutineSummary {
  id: string;
  studentId: string;
  routineType: TrainingPurpose;
  state: RoutineState;
  origin: string;
  targetWeeklyFrequency: number;
  requestedAt: Date;
  /** Última versión de la rutina: la que se muestra y la que se revisa. */
  versionId: string;
  versionNumber: number;
}

/** Rutina con su contenido, para la pantalla del alumno y la revisión. */
export interface RoutineContent extends RoutineSummary {
  days: {
    position: number;
    name: string;
    dominantPattern: MovementPattern;
    exercises: {
      position: number;
      exerciseId: string;
      exerciseName: string;
      movementPattern: MovementPattern;
      note: string | null;
      sets: PrescribedSetContent[];
    }[];
  }[];
}

export interface PrescriptionsRepository {
  /** Plantillas activas del gimnasio al que pertenece el entrenador. */
  listTemplatesForTrainer(trainerId: string): Promise<RoutineTemplateSummary[]>;

  /** Contenido completo de una plantilla activa. `null` si no existe. */
  findTemplateContent(templateId: string): Promise<TemplateContent | null>;

  /** Gimnasio del alumno, para verificar que la plantilla sea de su gimnasio. */
  findStudentGymId(studentId: string): Promise<string | null>;

  /**
   * Crea la rutina en estado PROPUESTA con su versión 1, días, ejercicios y
   * series, en una sola transacción. Devuelve el id de la rutina y de la versión.
   */
  createProposedRoutine(
    command: CreateRoutineCommand,
  ): Promise<{ routineId: string; versionId: string }>;

  /** Rutinas del alumno, de la más reciente a la más vieja. */
  listByStudent(studentId: string): Promise<RoutineSummary[]>;

  /** Una rutina con su contenido. `null` si no existe o no es del alumno. */
  findContent(
    studentId: string,
    routineId: string,
  ): Promise<RoutineContent | null>;

  /**
   * Registra la revisión y deja la rutina en su estado resultante, en una sola
   * transacción: al aprobar, la versión pasa a vigente y la rutina anterior se
   * archiva (RF-110).
   */
  review(command: ReviewRoutineCommand): Promise<void>;
}
