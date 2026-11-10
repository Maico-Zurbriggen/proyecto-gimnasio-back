import type {
  SesionDelDiagnostico,
  Situacion,
} from '../../domain/services/evolution-diagnosis';

/** Alumno con rutina vigente, candidato a diagnóstico (RN-78). */
export interface StudentToDiagnose {
  studentId: string;
  routineVersionId: string;
}

/** Un ejercicio de la rutina vigente, con las sesiones del período. */
export interface ExercisePeriodData {
  exerciseId: string;
  sesiones: SesionDelDiagnostico[];
}

/** Lo que el diagnóstico necesita leer del período de un alumno. */
export interface StudentPeriodData {
  routineVersionId: string;
  /** Todos los ejercicios de la versión vigente, tengan sesiones o no. */
  ejercicios: ExercisePeriodData[];
  /** Adherencia del período; `null` si no está disponible (RN-68). */
  adherencia: number | null;
  /** Cumplimiento de repeticiones medio; `null` si no hay series de trabajo. */
  cumplimientoMedio: number | null;
}

export interface ExerciseDiagnosticToSave {
  exerciseId: string;
  situation: Situacion;
  metrics: unknown;
}

export interface DiagnosticToSave {
  studentId: string;
  routineVersionId: string;
  periodStart: Date;
  periodEnd: Date;
  globalSituation: Situacion;
  adherence: number | null;
  componentVersion: string;
  /** RN-81: qué criterios no se pudieron evaluar, para declararlos. */
  criteriaNotEvaluated: string[];
  exercises: ExerciseDiagnosticToSave[];
}

export interface EvolutionDiagnosticsRepository {
  /** Alumnos con rutina VIGENTE: los únicos diagnosticables (RN-78). */
  listStudentsWithCurrentRoutine(): Promise<StudentToDiagnose[]>;

  /**
   * Datos del período para un alumno. `null` si ya no tiene rutina vigente
   * —puede haber cambiado entre el listado y el cálculo.
   */
  loadPeriodData(
    studentId: string,
    desde: Date,
    hasta: Date,
  ): Promise<StudentPeriodData | null>;

  /**
   * Fecha del último diagnóstico del alumno. `null` si nunca se le hizo uno.
   *
   * Es lo que hace idempotente al job: con periodicidad de dos semanas (RN-78),
   * volver a correrlo el mismo día no produce un segundo diagnóstico.
   */
  findLastDiagnosticDate(studentId: string): Promise<Date | null>;

  /** Persiste el diagnóstico con sus ejercicios. Devuelve su id. */
  save(diagnostic: DiagnosticToSave): Promise<string>;
}
