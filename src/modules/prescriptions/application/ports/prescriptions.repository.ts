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

/** Día, ejercicio y serie que el entrenador declara al crear una plantilla. */
export interface TemplateDayInput {
  name: string;
  exercises: TemplateExerciseInput[];
}

export interface TemplateExerciseInput {
  exerciseId: string;
  note: string | null;
  sets: TemplateSetInput[];
}

/** Serie declarada por el entrenador; la posición la da el orden enviado. */
export interface TemplateSetInput {
  minRepetitions: number;
  maxRepetitions: number;
  suggestedLoad: number | null;
  restSeconds: number;
  warmup: boolean;
}

/** Entrada de escritura de una plantilla (RF-019, RF-020, RF-082). */
export interface WriteTemplateCommand {
  name: string;
  routineType: TrainingPurpose;
  days: TemplateDayInput[];
}

/** Detalle de una plantilla del gimnasio, con su contenido editable. */
export interface RoutineTemplateDetail {
  id: string;
  gymId: string;
  authorTrainerId: string;
  name: string;
  routineType: TrainingPurpose;
  active: boolean;
  days: TemplateContentDay[];
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
  /** Nombre al momento de leer, para mostrar sin otra consulta. */
  exerciseName?: string;
  sets: PrescribedSetContent[];
}

export interface PrescribedSetContent {
  position: number;
  minRepetitions: number;
  maxRepetitions: number;
  suggestedLoad: number | null;
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
  confirmGoalMismatch?: boolean;
  reviewToken?: string;
  studentId: string;
  routineId: string;
  versionId: string;
  reviewerTrainerId: string;
  result: RoutineReviewResult;
  observation: string | null;
}

/**
 * Rutina PROPUESTA en la bandeja del entrenador (HU17): lo necesario para
 * decidir por dónde empezar sin abrir cada una.
 */
export interface PendingRoutineReview {
  routineId: string;
  studentId: string;
  studentName: string;
  routineType: TrainingPurpose;
  origin: string;
  targetWeeklyFrequency: number;
  requestedAt: Date;
  /** Quién la originó: el propio alumno, otro entrenador o el sistema. */
  requestedByName: string | null;
  requestedByStudent: boolean;
  versionId: string;
  versionNumber: number;
  dayCount: number;
  exerciseCount: number;
  /** Objetivo vigente del alumno, para anticipar la confirmación de RN-40. */
  currentGoal: TrainingPurpose | null;
  /** Si al aprobarla se archivará una rutina vigente. */
  replacesActiveRoutine: boolean;
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
  reviewToken?: string;
  generationExplanation?: string | null;
  generationWarnings?: string[];
  generationPrompt: string | null;
  days: {
    position: number;
    name: string;
    dominantPattern: MovementPattern;
    exercises: {
      position: number;
      exerciseId: string;
      exerciseName: string;
      available?: boolean;
      /**
       * HU11 - criterio 13: ADVERTIDO por condición leve, INCOMPATIBLE por
       * condición moderada/severa o por inventario (RN-44a, RN-44b, RN-117).
       */
      compatibilityState?:
        'COMPATIBLE' | 'ADVERTIDO' | 'INCOMPATIBLE' | 'EJERCICIO_DESACTIVADO';
      compatibilityReason?: string | null;
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

  /** Detalle editable de una plantilla del gimnasio del entrenador. */
  findTemplateDetail(
    trainerId: string,
    templateId: string,
  ): Promise<RoutineTemplateDetail | null>;

  /**
   * Crea una plantilla privada del gimnasio del entrenador (RF-019). Los
   * ejercicios referenciados deben estar aprobados en ese gimnasio.
   */
  createTemplate(
    trainerId: string,
    command: WriteTemplateCommand,
  ): Promise<{ templateId: string }>;

  /**
   * Reemplaza nombre, tipo y contenido de una plantilla activa del gimnasio
   * del entrenador. Las rutinas ya creadas no cambian (RN-33).
   */
  updateTemplate(
    trainerId: string,
    templateId: string,
    command: WriteTemplateCommand,
  ): Promise<void>;

  /** Activa o desactiva una plantilla del gimnasio. Idempotente. */
  setTemplateActive(
    trainerId: string,
    templateId: string,
    active: boolean,
  ): Promise<{ active: boolean }>;

  /** Gimnasio del alumno, para verificar que la plantilla sea de su gimnasio. */
  findStudentGymId(studentId: string): Promise<string | null>;

  /**
   * Crea la rutina en estado PROPUESTA con su versión 1, días, ejercicios y
   * series, en una sola transacción. Devuelve el id de la rutina y de la versión.
   */
  createProposedRoutine(
    command: CreateRoutineCommand,
  ): Promise<{ routineId: string; versionId: string }>;

  /**
   * Crea una rutina manual del entrenador para su alumno (sin plantilla):
   * valida que los ejercicios estén habilitados en el gimnasio y deriva el
   * patrón dominante de cada día desde el catálogo. Nace en PROPUESTA con
   * origen PLANTILLA_ENTRENADOR y sin plantilla de origen.
   */
  createManualRoutine(command: {
    trainerId: string;
    studentId: string;
    routineType: TrainingPurpose;
    days: TemplateDayInput[];
  }): Promise<{ routineId: string; versionId: string }>;

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
  review(
    command: ReviewRoutineCommand,
  ): Promise<{ archivedRoutineId: string | null }>;

  /**
   * Bandeja de revisión (HU17): rutinas PROPUESTA de los alumnos con asignación
   * vigente al entrenador, de la más antigua a la más reciente.
   */
  listPendingReviewsForTrainer(
    trainerId: string,
  ): Promise<PendingRoutineReview[]>;
}
