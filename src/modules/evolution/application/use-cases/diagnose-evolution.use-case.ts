import type { Clock } from '../../../routines/application/ports/clock';
import {
  SEMANAS_ENTRE_DIAGNOSTICOS,
  SEMANAS_PERIODO_DIAGNOSTICO,
  UMBRALES_POR_DEFECTO,
  type DiagnosticThresholds,
} from '../../domain/services/diagnostic-thresholds';
import {
  diagnosticarEjercicio,
  diagnosticarGlobal,
  type Situacion,
} from '../../domain/services/evolution-diagnosis';
import type {
  EvolutionDiagnosticsRepository,
  ExerciseDiagnosticToSave,
} from '../ports/evolution-diagnostics.repository';

const MS_POR_SEMANA = 7 * 24 * 60 * 60 * 1000;

/** Versión del componente que produjo el diagnóstico, para trazarlo (DD-04). */
export const DIAGNOSTIC_COMPONENT_VERSION = 'evolution-diagnosis@1';

export interface DiagnoseStudentResult {
  diagnosticId: string;
  globalSituation: Situacion;
  exerciseCount: number;
}

export class StudentNotDiagnosableError extends Error {
  constructor(message = 'El alumno no tiene rutina vigente') {
    super(message);
    this.name = 'StudentNotDiagnosableError';
  }
}

/**
 * Diagnóstico de evolución de un alumno (HU32 - T1 y T2, RN-78 a RN-85).
 *
 * Evalúa cada ejercicio de la rutina vigente sobre el período de diagnóstico,
 * le asigna una de las cinco situaciones de RN-79a y determina la situación
 * global. El resultado se persiste siempre, incluso cuando es
 * `DATOS_INSUFICIENTES`: un diagnóstico sin propuesta es un resultado, no un
 * fallo (FL-09/A1, RN-82), y además es lo que permite que la vista diga «no
 * disponible» con fundamento en lugar de quedarse muda.
 */
export class DiagnoseEvolutionUseCase {
  constructor(
    private readonly diagnostics: EvolutionDiagnosticsRepository,
    private readonly clock: Clock,
    private readonly umbrales: DiagnosticThresholds = UMBRALES_POR_DEFECTO,
  ) {}

  async execute(studentId: string): Promise<DiagnoseStudentResult> {
    const ahora = this.clock.now();
    const periodEnd = new Date(
      Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate()),
    );
    const periodStart = new Date(
      periodEnd.getTime() - SEMANAS_PERIODO_DIAGNOSTICO * MS_POR_SEMANA,
    );

    const datos = await this.diagnostics.loadPeriodData(
      studentId,
      periodStart,
      periodEnd,
    );
    if (datos === null) {
      throw new StudentNotDiagnosableError();
    }

    const porEjercicio: ExerciseDiagnosticToSave[] = datos.ejercicios.map(
      (ejercicio) => {
        const { situacion, metricas } = diagnosticarEjercicio(
          ejercicio.sesiones,
          periodEnd,
          this.umbrales,
        );
        return {
          exerciseId: ejercicio.exerciseId,
          situation: situacion,
          metrics: metricas,
        };
      },
    );

    const globalSituation = diagnosticarGlobal(
      {
        situaciones: porEjercicio.map((item) => item.situation),
        totalEjercicios: datos.ejercicios.length,
        adherencia: datos.adherencia,
        cumplimientoMedio: datos.cumplimientoMedio,
      },
      this.umbrales,
    );

    // RN-81: lo que no se pudo evaluar se declara a nivel del diagnóstico, no
    // sólo por ejercicio, para que el entrenador sepa con qué se concluyó.
    const criteriaNotEvaluated = [
      ...new Set(
        porEjercicio.flatMap((item) => {
          const metricas = item.metrics as { criteriosNoEvaluados?: string[] };
          return metricas.criteriosNoEvaluados ?? [];
        }),
      ),
    ];
    if (datos.adherencia === null) {
      criteriaNotEvaluated.push('adherencia_no_disponible');
    }

    const diagnosticId = await this.diagnostics.save({
      studentId,
      routineVersionId: datos.routineVersionId,
      periodStart,
      periodEnd,
      globalSituation,
      adherence: datos.adherencia,
      componentVersion: DIAGNOSTIC_COMPONENT_VERSION,
      criteriaNotEvaluated,
      exercises: porEjercicio,
    });

    return {
      diagnosticId,
      globalSituation,
      exerciseCount: porEjercicio.length,
    };
  }
}

export interface WeeklyDiagnosisResult {
  evaluated: number;
  skipped: number;
  failed: number;
  diagnosticIds: string[];
}

/**
 * Diagnóstico periódico de todos los alumnos con rutina vigente (HU32 - T3,
 * RN-78).
 *
 * Se saltea a quien ya tiene un diagnóstico de los últimos días: la
 * periodicidad es de dos semanas y reejecutar el job no debe producir un
 * segundo diagnóstico del mismo período. Eso hace que correrlo de más sea
 * inofensivo, que es lo que se le pide a un trabajo programado.
 *
 * Un alumno que falla no detiene a los demás: el diagnóstico de uno no depende
 * del de otro, y perder la tanda entera por un caso roto sería peor.
 */
export class DiagnoseWeeklyEvolutionUseCase {
  constructor(
    private readonly diagnostics: EvolutionDiagnosticsRepository,
    private readonly diagnoseOne: DiagnoseEvolutionUseCase,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<WeeklyDiagnosisResult> {
    const ahora = this.clock.now();
    const corte = new Date(
      ahora.getTime() - SEMANAS_ENTRE_DIAGNOSTICOS * MS_POR_SEMANA,
    );

    const alumnos = await this.diagnostics.listStudentsWithCurrentRoutine();
    const resultado: WeeklyDiagnosisResult = {
      evaluated: 0,
      skipped: 0,
      failed: 0,
      diagnosticIds: [],
    };

    for (const alumno of alumnos) {
      try {
        const ultimo = await this.diagnostics.findLastDiagnosticDate(
          alumno.studentId,
        );
        if (ultimo !== null && ultimo.getTime() > corte.getTime()) {
          resultado.skipped += 1;
          continue;
        }

        const { diagnosticId } = await this.diagnoseOne.execute(
          alumno.studentId,
        );
        resultado.evaluated += 1;
        resultado.diagnosticIds.push(diagnosticId);
      } catch (error) {
        resultado.failed += 1;
        console.error(
          `[diagnostics] fallo el diagnostico del alumno ${alumno.studentId}`,
          error,
        );
      }
    }

    return resultado;
  }
}
