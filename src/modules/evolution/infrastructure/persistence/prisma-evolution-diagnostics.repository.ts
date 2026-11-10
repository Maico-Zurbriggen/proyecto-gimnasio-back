import type { PrismaClient } from '@prisma/client';

import { isUuid } from '../../../../shared/types/uuid';
import {
  calcularAdherencia,
  type FrecuenciaVigente,
} from '../../../indicators/domain/adherence';
import type {
  DiagnosticToSave,
  EvolutionDiagnosticsRepository,
  StudentPeriodData,
  StudentToDiagnose,
} from '../../application/ports/evolution-diagnostics.repository';
import {
  cumplimientoDeSesion,
  type SerieDelDiagnostico,
  type SesionDelDiagnostico,
} from '../../domain/services/evolution-diagnosis';

export class PrismaEvolutionDiagnosticsRepository implements EvolutionDiagnosticsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listStudentsWithCurrentRoutine(): Promise<StudentToDiagnose[]> {
    const versions = await this.prisma.routineVersion.findMany({
      where: { current: true, routine: { state: 'VIGENTE' } },
      select: { id: true, routine: { select: { studentId: true } } },
    });

    return versions.map((version) => ({
      studentId: version.routine.studentId,
      routineVersionId: version.id,
    }));
  }

  async findLastDiagnosticDate(studentId: string): Promise<Date | null> {
    if (!isUuid(studentId)) {
      return null;
    }

    const last = await this.prisma.evolutionDiagnostic.findFirst({
      where: { studentId },
      orderBy: { calculatedAt: 'desc' },
      select: { calculatedAt: true },
    });

    return last?.calculatedAt ?? null;
  }

  async loadPeriodData(
    studentId: string,
    desde: Date,
    hasta: Date,
  ): Promise<StudentPeriodData | null> {
    if (!isUuid(studentId)) {
      return null;
    }

    const version = await this.prisma.routineVersion.findFirst({
      where: { current: true, routine: { studentId, state: 'VIGENTE' } },
      select: {
        id: true,
        days: {
          select: {
            exercises: {
              select: { exerciseId: true },
            },
          },
        },
      },
    });
    if (version === null) {
      return null;
    }

    const sessions = await this.prisma.trainingSession.findMany({
      where: {
        studentId,
        occurredOn: { gte: desde, lte: hasta },
        state: { in: ['COMPLETADA', 'BLOQUEADA'] },
        // RN-107: un registro simulado queda fuera de toda analítica real.
        simulated: false,
      },
      select: {
        occurredOn: true,
        setRecords: {
          select: {
            warmup: true,
            additional: true,
            completed: true,
            performedLoad: true,
            performedRepetitions: true,
            prescribedMaxRepetitions: true,
            perceivedEffort: true,
            prescribedExerciseId: true,
            performedExerciseId: true,
          },
        },
      },
      orderBy: { occurredOn: 'asc' },
    });

    // Un ejercicio por cada uno de la rutina vigente, aunque no tenga sesiones:
    // la ausencia de registros es en sí misma un dato (DATOS_INSUFICIENTES).
    const ejercicios = [
      ...new Set(
        version.days.flatMap((day) =>
          day.exercises.map((exercise) => exercise.exerciseId),
        ),
      ),
    ].map((exerciseId) => ({
      exerciseId,
      sesiones: sessions
        .map((session) => ({
          occurredOn: session.occurredOn,
          series: session.setRecords
            // RN-56: la serie sustituida se imputa al ejercicio ejecutado.
            .filter(
              (record) =>
                (record.performedExerciseId ?? record.prescribedExerciseId) ===
                exerciseId,
            )
            .map((record): SerieDelDiagnostico => ({
              warmup: record.warmup,
              additional: record.additional,
              completed: record.completed,
              performedLoad:
                record.performedLoad === null
                  ? null
                  : record.performedLoad.toNumber(),
              performedRepetitions: record.performedRepetitions,
              prescribedMaxRepetitions: record.prescribedMaxRepetitions,
              perceivedEffort: record.perceivedEffort,
            })),
        }))
        .filter((session) => session.series.length > 0),
    }));

    return {
      routineVersionId: version.id,
      ejercicios,
      adherencia: await this.adherenciaDelPeriodo(studentId, desde, hasta),
      cumplimientoMedio: cumplimientoMedioDelPeriodo(
        sessions.map((session) => ({
          occurredOn: session.occurredOn,
          series: session.setRecords.map((record): SerieDelDiagnostico => ({
            warmup: record.warmup,
            additional: record.additional,
            completed: record.completed,
            performedLoad:
              record.performedLoad === null
                ? null
                : record.performedLoad.toNumber(),
            performedRepetitions: record.performedRepetitions,
            prescribedMaxRepetitions: record.prescribedMaxRepetitions,
            perceivedEffort: record.perceivedEffort,
          })),
        })),
      ),
    };
  }

  async save(diagnostic: DiagnosticToSave): Promise<string> {
    // El diagnóstico y sus ejercicios van juntos: un diagnóstico global sin
    // detalle no se podría sustentar (RN-84).
    const created = await this.prisma.evolutionDiagnostic.create({
      data: {
        studentId: diagnostic.studentId,
        routineVersionId: diagnostic.routineVersionId,
        periodStart: diagnostic.periodStart,
        periodEnd: diagnostic.periodEnd,
        globalSituation: diagnostic.globalSituation,
        adherence: diagnostic.adherence,
        componentVersion: diagnostic.componentVersion,
        criteriaNotEvaluated: diagnostic.criteriaNotEvaluated,
        exerciseDiagnostics: {
          create: diagnostic.exercises.map((exercise) => ({
            exerciseId: exercise.exerciseId,
            situation: exercise.situation,
            metrics: exercise.metrics as object,
          })),
        },
      },
      select: { id: true },
    });

    return created.id;
  }

  /** Adherencia del período, con las frecuencias objetivo que rigieron (RN-67). */
  private async adherenciaDelPeriodo(
    studentId: string,
    desde: Date,
    hasta: Date,
  ): Promise<number | null> {
    const routines = await this.prisma.routine.findMany({
      where: { studentId, state: { in: ['VIGENTE', 'ARCHIVADA'] } },
      select: {
        targetWeeklyFrequency: true,
        requestedAt: true,
        state: true,
      },
      orderBy: { requestedAt: 'asc' },
    });

    const frecuencias: FrecuenciaVigente[] = routines.map(
      (routine, indice): FrecuenciaVigente => ({
        desde: routine.requestedAt,
        hasta:
          routine.state === 'VIGENTE'
            ? null
            : (routines[indice + 1]?.requestedAt ?? null),
        sesionesPorSemana: routine.targetWeeklyFrequency,
      }),
    );

    const sesiones = await this.prisma.trainingSession.findMany({
      where: {
        studentId,
        occurredOn: { gte: desde, lte: hasta },
        simulated: false,
      },
      select: { occurredOn: true, state: true },
    });

    const adherencia = calcularAdherencia(
      sesiones.map((sesion) => ({
        occurredOn: sesion.occurredOn,
        completada:
          sesion.state === 'COMPLETADA' || sesion.state === 'BLOQUEADA',
      })),
      frecuencias,
      hasta,
    );

    return adherencia.disponible ? adherencia.porcentaje : null;
  }
}

/**
 * Cumplimiento de repeticiones medio del período.
 *
 * `null` si ninguna sesión tuvo series de trabajo prescriptas: promediar sobre
 * nada daría cero, y cero significaría que el alumno no cumplió (RN-73).
 */
function cumplimientoMedioDelPeriodo(
  sesiones: readonly SesionDelDiagnostico[],
): number | null {
  const valores = sesiones
    .map((sesion) => cumplimientoDeSesion(sesion))
    .filter((valor): valor is number => valor !== null);

  if (valores.length === 0) {
    return null;
  }

  const suma = valores.reduce((total, valor) => total + valor, 0);
  return Math.round((suma / valores.length) * 100) / 100;
}
