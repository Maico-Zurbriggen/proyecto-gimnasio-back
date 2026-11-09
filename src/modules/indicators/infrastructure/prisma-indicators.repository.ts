import type { PrismaClient } from '@prisma/client';

import { isUuid } from '../../../shared/types/uuid';
import type { IndicatorsRepository } from '../application/indicators.use-cases';
import type {
  FrecuenciaVigente,
  SesionDeAdherencia,
} from '../domain/adherence';
import type { RegistroDeSerie } from '../domain/compliance';
import type { SesionDelPeriodo } from '../domain/signals';
import type { Participacion } from '../domain/volume';

/**
 * Lectura de lo registrado para derivar los indicadores.
 *
 * Todas las consultas excluyen las sesiones simuladas (RN-107): un registro
 * simulado está marcado de forma inequívoca y queda fuera de toda analítica
 * presentada como real. Si se colaran, inflarían adherencia y cumplimiento y
 * podrían apagar una señal de HU26 que corresponde emitir.
 */
export class PrismaIndicatorsRepository implements IndicatorsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findSessionsSince(
    studentId: string,
    desde: Date,
  ): Promise<SesionDeAdherencia[]> {
    if (!isUuid(studentId)) {
      return [];
    }

    const rows = await this.prisma.trainingSession.findMany({
      where: { studentId, occurredOn: { gte: desde }, simulated: false },
      select: { occurredOn: true, state: true },
      orderBy: { occurredOn: 'desc' },
    });

    return rows.map((row) => ({
      occurredOn: row.occurredOn,
      // Sólo COMPLETADA y BLOQUEADA cuentan para indicadores: EN_CURSO todavía
      // no terminó y ABANDONADA no se completó (D6/§4).
      completada: row.state === 'COMPLETADA' || row.state === 'BLOQUEADA',
    }));
  }

  async findGymTimeZone(studentId: string): Promise<string | null> {
    if (!isUuid(studentId)) {
      return null;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: { gym: { select: { timezone: true } } },
    });

    return user?.gym.timezone ?? null;
  }

  async findTargetFrequencies(studentId: string): Promise<FrecuenciaVigente[]> {
    if (!isUuid(studentId)) {
      return [];
    }

    // El ciclo de una rutina arranca con su revisión favorable, que es cuando
    // entró en vigencia; si no la hubiera, se cae a la creación de su versión.
    const routines = await this.prisma.routine.findMany({
      where: { studentId, state: { in: ['VIGENTE', 'ARCHIVADA'] } },
      select: {
        targetWeeklyFrequency: true,
        requestedAt: true,
        reviews: {
          where: { result: { in: ['APROBADA', 'APROBADA_CON_CAMBIOS'] } },
          orderBy: { reviewedAt: 'asc' },
          take: 1,
          select: { reviewedAt: true },
        },
        versions: {
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { createdAt: true },
        },
      },
    });

    const vigencias = routines
      .map((routine) => ({
        desde:
          routine.reviews[0]?.reviewedAt ??
          routine.versions[0]?.createdAt ??
          routine.requestedAt,
        sesionesPorSemana: routine.targetWeeklyFrequency,
      }))
      .sort((a, b) => a.desde.getTime() - b.desde.getTime());

    // Cada rutina rige hasta que empieza la siguiente; la última queda abierta.
    return vigencias.map((vigencia, indice) => ({
      desde: vigencia.desde,
      hasta: vigencias[indice + 1]?.desde ?? null,
      sesionesPorSemana: vigencia.sesionesPorSemana,
    }));
  }

  async findSessionSetRecords(
    sessionId: string,
    studentId: string,
  ): Promise<RegistroDeSerie[] | null> {
    if (!isUuid(sessionId) || !isUuid(studentId)) {
      return null;
    }

    // El filtro por alumno es parte de la consulta: una sesión ajena responde
    // «no existe», sin revelar si existe (RNF-14).
    const session = await this.prisma.trainingSession.findFirst({
      where: { id: sessionId, studentId, simulated: false },
      select: {
        setRecords: {
          select: {
            warmup: true,
            additional: true,
            completed: true,
            prescribedMaxRepetitions: true,
            performedRepetitions: true,
          },
        },
      },
    });

    if (!session) {
      return null;
    }

    return session.setRecords;
  }

  async findSessionsWithSeriesSince(
    studentId: string,
    desde: Date,
  ): Promise<SesionDelPeriodo[]> {
    if (!isUuid(studentId)) {
      return [];
    }

    const rows = await this.prisma.trainingSession.findMany({
      where: { studentId, occurredOn: { gte: desde }, simulated: false },
      select: {
        occurredOn: true,
        state: true,
        setRecords: {
          select: {
            warmup: true,
            completed: true,
            performedLoad: true,
            performedRepetitions: true,
            prescribedExerciseId: true,
            performedExerciseId: true,
            // El volumen se imputa al ejercicio EJECUTADO, no al prescripto
            // (RN-56): si hubo sustitución, el trabajo fue del sustituto.
            performedExercise: {
              select: {
                muscles: { select: { muscleCode: true, participation: true } },
              },
            },
            prescribedExercise: {
              select: {
                muscles: { select: { muscleCode: true, participation: true } },
              },
            },
          },
        },
      },
      orderBy: { occurredOn: 'asc' },
    });

    return rows.map((row) => ({
      occurredOn: row.occurredOn,
      completada: row.state === 'COMPLETADA' || row.state === 'BLOQUEADA',
      series: row.setRecords.map((record) => {
        const ejercicio = record.performedExercise ?? record.prescribedExercise;

        return {
          exerciseId: record.performedExerciseId ?? record.prescribedExerciseId,
          warmup: record.warmup,
          completed: record.completed,
          performedLoad:
            record.performedLoad === null ? null : Number(record.performedLoad),
          performedRepetitions: record.performedRepetitions,
          musculos: ejercicio.muscles.map((muscle) => ({
            grupo: muscle.muscleCode,
            participacion: muscle.participation as Participacion,
          })),
        };
      }),
    }));
  }
}
