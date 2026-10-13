import { Prisma, type PrismaClient } from '@prisma/client';
import { validateGenerationV2 } from '../../../../integrations/ai/routine-generation-v2';
import {
  validateGymGenerationSettings,
  generationPolicySnapshot,
} from '../../../routine-generations/infrastructure/persistence/validate-gym-generation-settings';
import {
  duracionCicloDias,
  addDays,
} from '../../../routines/domain/services/routine-renewal';
import { hayDatosActualizadosEnElCiclo } from '../../../routines/domain/services/cycle-renewal-data';
import {
  localDateAt,
  updateConsecutiveMisses,
} from '../../../students/domain/services/measurement-cycle';
import {
  assertGenerationContextCurrent,
  generationCatalogSnapshot,
} from '../../../routine-generations/infrastructure/persistence/generation-context-validity';
import type {
  RenewalEvaluation,
  RenewalWork,
  RoutineRenewalsRepository,
} from '../../application/ports/routine-renewals.repository';

const VERSION = 'routine-cycle-renewal@1.0';
const LEASE_MS = 5 * 60 * 1000;
const BATCH_SIZE = 5;

async function currentRoutineStructure(
  tx: Prisma.TransactionClient,
  routineVersionId: string,
): Promise<NonNullable<RenewalEvaluation['estructuraVigente']>> {
  const source = await tx.routineVersion.findUniqueOrThrow({
    where: { id: routineVersionId },
    include: {
      routine: {
        select: { routineType: true, targetWeeklyFrequency: true },
      },
      days: {
        orderBy: { position: 'asc' },
        include: {
          exercises: {
            orderBy: { position: 'asc' },
            include: {
              sets: { orderBy: { position: 'asc' } },
              exercise: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  return {
    routineType: source.routine.routineType,
    targetWeeklyFrequency: source.routine.targetWeeklyFrequency,
    days: source.days.map((routineDay) => ({
      position: routineDay.position,
      name: routineDay.name,
      dominantPattern: routineDay.dominantPattern,
      exercises: routineDay.exercises.map((exercise) => ({
        position: exercise.position,
        exerciseId: exercise.exerciseId,
        exerciseName: exercise.exercise.name,
        note: exercise.note,
        sets: exercise.sets.map((set) => ({
          position: set.position,
          minRepetitions: set.minRepetitions,
          maxRepetitions: set.maxRepetitions,
          suggestedLoad:
            set.suggestedLoad === null ? null : Number(set.suggestedLoad),
          restSeconds: set.restSeconds,
          warmup: set.warmup,
        })),
      })),
    })),
  };
}

export class PrismaRoutineRenewalsRepository implements RoutineRenewalsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async claimDue(evaluatedAt: Date): Promise<RenewalWork[]> {
    return this.prisma.$transaction(
      async (tx) => {
        const [lock] = await tx.$queryRaw<
          Array<{ acquired: boolean }>
        >`SELECT pg_try_advisory_xact_lock(2609100901::bigint) AS acquired`;
        if (!lock?.acquired) return [];
        const versions = await tx.routineVersion.findMany({
          where: {
            current: true,
            routine: {
              state: 'VIGENTE',
              student: { user: { state: 'ACTIVO' } },
            },
          },
          include: {
            reviews: {
              where: { result: { in: ['APROBADA', 'APROBADA_CON_CAMBIOS'] } },
              orderBy: { reviewedAt: 'desc' },
              take: 1,
            },
            renewalCycles: { orderBy: { dueOn: 'desc' }, take: 1 },
            routine: {
              include: {
                student: {
                  include: {
                    user: { include: { gym: true } },
                    bodyMeasurements: { orderBy: { measuredOn: 'asc' } },
                    measurementCheckpoints: { orderBy: { dueOn: 'asc' } },
                    measurementBlocks: { orderBy: { blockedAt: 'desc' } },
                  },
                },
              },
            },
          },
        });
        for (const version of versions) {
          const profile = version.routine.student;
          const activeBlock = profile.measurementBlocks.find(
            (block) => block.state !== 'RESUELTO',
          );
          if (activeBlock) {
            await tx.routineRenewalCycle.updateMany({
              where: { routineVersionId: version.id, state: 'PENDIENTE' },
              data: { state: 'OMITIDA' },
            });
            continue;
          }
          const timeZone = profile.user.gym.timezone;
          const today = localDateAt(evaluatedAt, timeZone);
          const resolvedAt = profile.measurementBlocks.find(
            (block) => block.state === 'RESUELTO',
          )?.approvedAt;
          if (resolvedAt)
            await tx.routineRenewalCycle.updateMany({
              where: {
                routineVersionId: version.id,
                state: 'PENDIENTE',
                dueOn: { lte: localDateAt(resolvedAt, timeZone) },
              },
              data: { state: 'OMITIDA' },
            });
          const reviewDate = version.reviews[0]?.reviewedAt;
          if (!reviewDate) continue; // Only a reviewed active version starts a cycle.
          const start = localDateAt(
            resolvedAt && resolvedAt > reviewDate ? resolvedAt : reviewDate,
            timeZone,
          );
          const previousDueOn = version.renewalCycles[0]?.dueOn;
          let cycleStartsOn: Date =
            previousDueOn && previousDueOn >= start ? previousDueOn : start;
          const days = duracionCicloDias(version.routine.routineType);
          let estructuraVigente: RenewalEvaluation['estructuraVigente'];
          for (
            let dueOn = addDays(cycleStartsOn, days);
            dueOn <= today;
            dueOn = addDays(cycleStartsOn, days)
          ) {
            const measurements = profile.bodyMeasurements.filter(
              (m) => m.measuredOn > cycleStartsOn && m.measuredOn <= dueOn,
            );
            // T2 estricto RN-130: peso + altura en (inicio, fin]. `mediciones`
            // conserva todo lo medido como evidencia, pero el flag exige ambos
            // para no contradecir al checkpoint (un perímetro solo es FALTA).
            const alturaFechaLocal = localDateAt(
              profile.heightUpdatedAt,
              timeZone,
            );
            const tieneDatosActualizados = hayDatosActualizadosEnElCiclo(
              measurements,
              alturaFechaLocal,
              cycleStartsOn,
              dueOn,
            );
            const misses = profile.measurementCheckpoints
              .filter(
                (c) =>
                  c.dueOn <= dueOn &&
                  (!resolvedAt || c.evaluatedAt > resolvedAt),
              )
              .reduce(
                (streak, checkpoint) =>
                  updateConsecutiveMisses(streak, checkpoint.result),
                0,
              );
            if (!estructuraVigente)
              estructuraVigente = await currentRoutineStructure(tx, version.id);
            const evaluation: RenewalEvaluation = {
              sinDatosActualizados: !tieneDatosActualizados,
              estructuraVigente,
              faltasConsecutivas: misses,
              alcanzoTopeDeFaltas: misses >= 3,
              ...(!tieneDatosActualizados
                ? {
                    datoFaltante:
                      'medicion corporal posterior al inicio del ciclo',
                  }
                : {}),
              criterio:
                'Renovación automática por ciclo cumplido; cambio de estructura con el contexto disponible.',
              mediciones: measurements.map((m) => ({
                id: m.id,
                type: m.type,
                value: Number(m.value),
                measuredOn: m.measuredOn.toISOString().slice(0, 10),
              })),
            };
            await tx.routineRenewalCycle.upsert({
              where: {
                routineVersionId_dueOn: { routineVersionId: version.id, dueOn },
              },
              create: {
                routineVersionId: version.id,
                cycleStartsOn,
                dueOn,
                evaluation: JSON.parse(
                  JSON.stringify(evaluation),
                ) as Prisma.InputJsonValue,
                state: misses >= 3 ? 'OMITIDA' : 'PENDIENTE',
                createdAt: evaluatedAt,
              },
              update: {},
            });
            cycleStartsOn = dueOn;
          }
        }
        const pending = await tx.routineRenewalCycle.findMany({
          where: {
            state: 'PENDIENTE',
            routineVersion: { current: true, routine: { state: 'VIGENTE' } },
            OR: [{ leaseUntil: null }, { leaseUntil: { lte: evaluatedAt } }],
          },
          include: {
            routineVersion: {
              select: { routine: { select: { studentId: true } } },
            },
          },
          orderBy: [
            { leaseUntil: { sort: 'asc', nulls: 'first' } },
            { dueOn: 'asc' },
          ],
          take: BATCH_SIZE,
        });
        const work: RenewalWork[] = [];
        for (const cycle of pending) {
          let evaluation = cycle.evaluation as unknown as RenewalEvaluation;
          if (cycle.requestId === null && !evaluation.estructuraVigente) {
            evaluation = {
              ...evaluation,
              estructuraVigente: await currentRoutineStructure(
                tx,
                cycle.routineVersionId,
              ),
            };
            await tx.routineRenewalCycle.update({
              where: { id: cycle.id },
              data: {
                evaluation: JSON.parse(
                  JSON.stringify(evaluation),
                ) as Prisma.InputJsonValue,
              },
            });
          }
          await tx.routineRenewalCycle.update({
            where: { id: cycle.id },
            data: { leaseUntil: new Date(evaluatedAt.getTime() + LEASE_MS) },
          });
          work.push({
            id: cycle.id,
            studentId: cycle.routineVersion.routine.studentId,
            requestId: cycle.requestId,
            cycleStartsOn: cycle.cycleStartsOn,
            dueOn: cycle.dueOn,
            evaluation,
          });
        }
        return work;
      },
      { timeout: 60_000 },
    );
  }

  async attachRequest(cycleId: string, requestId: string): Promise<void> {
    await this.prisma.routineRenewalCycle.update({
      where: { id: cycleId },
      data: { requestId },
    });
  }

  async finalize(
    cycleId: string,
    evaluatedAt: Date,
  ): Promise<'generated' | 'waiting' | 'skipped'> {
    return this.prisma.$transaction(
      async (tx) => {
        const cycle = await tx.routineRenewalCycle.findUniqueOrThrow({
          where: { id: cycleId },
          include: {
            routineVersion: {
              include: {
                routine: true,
                days: { include: { exercises: true } },
              },
            },
            request: {
              include: {
                attempts: {
                  orderBy: { attemptNumber: 'desc' },
                  take: 1,
                  include: { result: true },
                },
              },
            },
          },
        });
        const { routineVersion: source, request } = cycle;
        const studentId = source.routine.studentId;
        // Keep the same lock order as approval: catalog, student, cycle.
        const student = await tx.user.findUniqueOrThrow({
          where: { id: studentId },
          select: { gymId: true },
        });
        await tx.$queryRaw`SELECT id FROM app.gyms WHERE id = ${student.gymId}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT user_id FROM app.student_profiles WHERE user_id = ${studentId}::uuid FOR UPDATE`;
        const [locked] = await tx.$queryRaw<
          Array<{ state: string }>
        >`SELECT state FROM app.routine_renewal_cycles WHERE id = ${cycleId}::uuid FOR UPDATE`;
        if (locked?.state !== 'PENDIENTE') return 'skipped';
        const current = await tx.routineVersion.findUniqueOrThrow({
          where: { id: source.id },
          select: { current: true, routine: { select: { state: true } } },
        });
        const blocked = await tx.studentMeasurementBlock.findFirst({
          where: {
            studentId,
            state: { in: ['PENDIENTE_MEDICION', 'PENDIENTE_APROBACION'] },
          },
        });
        if (
          !current.current ||
          current.routine.state !== 'VIGENTE' ||
          blocked
        ) {
          await tx.routineRenewalCycle.update({
            where: { id: cycleId },
            data: { state: 'OMITIDA' },
          });
          return 'skipped';
        }
        if (!request) throw new Error('renewal_request_missing');
        if (
          request.state === 'NO_DISPONIBLE' ||
          request.state === 'CANCELADA'
        ) {
          await tx.routineRenewalCycle.update({
            where: { id: cycleId },
            data: { state: 'NO_DISPONIBLE' },
          });
          throw new Error(
            'Servicio de IA no disponible; no se generó la rutina de renovación.',
          );
        }
        if (request.state !== 'COMPLETADA') return 'waiting';
        const result = request.attempts[0]?.result;
        if (!result) throw new Error('renewal_result_missing');
        const validation = validateGenerationV2(
          result.structuredOutput,
          generationCatalogSnapshot(request.preferences),
        );
        if (!result.structurallyValid || !validation.routine)
          throw new Error(
            validation.unableReason ??
              validation.violations.join('; ') ??
              'invalid_renewal_result',
          );
        const candidate = validation.routine;
        validateGymGenerationSettings(candidate, request.preferences);
        const shape = (
          days: Array<{
            position: number;
            exercises: Array<{ position: number; exerciseId: string }>;
          }>,
        ) =>
          JSON.stringify(
            [...days]
              .sort((a, b) => a.position - b.position)
              .map((d) =>
                [...d.exercises]
                  .sort((a, b) => a.position - b.position)
                  .map((e) => e.exerciseId),
              ),
          );
        if (
          candidate.routineType === source.routine.routineType &&
          candidate.targetWeeklyFrequency ===
            source.routine.targetWeeklyFrequency &&
          shape(candidate.days) === shape(source.days)
        )
          // T6 / RN-89a (referencia, sin modificar la regla): la renovación
          // exige un cambio de estructura real; el vencimiento es motivo propio
          // y no demuestra estancamiento ni sobreexigencia (D5/§9.3).
          throw new Error('La IA no propuso un cambio de estructura.');
        await assertGenerationContextCurrent(
          tx,
          request,
          studentId,
          candidate.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)),
          evaluatedAt,
          true,
        );
        const evaluation = cycle.evaluation as unknown as RenewalEvaluation;
        const diagnostic = await tx.evolutionDiagnostic.create({
          data: {
            studentId,
            routineVersionId: source.id,
            periodStart: cycle.cycleStartsOn,
            periodEnd: cycle.dueOn,
            // T6 / RN-89a (referencia): diagnóstico técnico de renovación, no
            // reemplaza el diagnóstico quincenal RN-79a (D5/§9.3).
            globalSituation: 'DATOS_INSUFICIENTES',
            componentVersion: VERSION,
            criteriaNotEvaluated: [
              'Renovación de ciclo: no sustituye el diagnóstico quincenal RN-79a.',
              ...(evaluation.datoFaltante ? [evaluation.datoFaltante] : []),
            ],
            calculatedAt: evaluatedAt,
          },
        });
        const trainer = await tx.trainerStudentAssignment.findFirst({
          where: { studentId, endsAt: null, startsAt: { lte: evaluatedAt } },
          select: { trainerId: true },
        });
        const exerciseNames = new Map(
          generationCatalogSnapshot(request.preferences).map((entry) => [
            entry.id,
            entry.name,
          ]),
        );
        const proposal = await tx.adaptationProposal.create({
          data: {
            diagnosticId: diagnostic.id,
            studentId,
            state: trainer ? 'PENDIENTE' : 'BLOQUEADA',
            componentVersion: VERSION,
            createdAt: evaluatedAt,
            adjustments: {
              create: {
                // T6 / RN-89a (referencia, sin modificar la regla): ajuste de
                // cambio de estructura por ciclo vencido; la evidencia que lo
                // sustenta es la del ciclo, no un disparador de RN-89a.
                type: 'ESTRUCTURA',
                criterion: evaluation.criterio,
                previousValue: {
                  routine_type: source.routine.routineType,
                  target_weekly_frequency: source.routine.targetWeeklyFrequency,
                },
                proposedValue: JSON.parse(
                  JSON.stringify({
                    ...candidate,
                    generationSettings: generationPolicySnapshot(
                      request.preferences,
                    ),
                    sourceExerciseNames: Object.fromEntries(
                      evaluation.estructuraVigente?.days.flatMap((day) =>
                        day.exercises.map((exercise) => [
                          exercise.exerciseId,
                          exercise.exerciseName ??
                            exerciseNames.get(exercise.exerciseId) ??
                            exercise.exerciseId,
                        ]),
                      ) ?? [],
                    ),
                    days: candidate.days.map((day) => ({
                      ...day,
                      exercises: day.exercises.map((exercise) => ({
                        ...exercise,
                        exerciseName: exerciseNames.get(exercise.exerciseId),
                      })),
                    })),
                  }),
                ) as Prisma.InputJsonValue,
                supportingData: cycle.evaluation as Prisma.InputJsonValue,
              },
            },
          },
        });
        await tx.routineRenewalCycle.update({
          where: { id: cycleId },
          data: { state: 'GENERADA', proposalId: proposal.id, lastError: null },
        });
        const recipients = trainer
          ? [{ id: trainer.trainerId }]
          : await tx.user.findMany({
              where: {
                gymId: student.gymId,
                state: 'ACTIVO',
                roles: { some: { role: 'ADMINISTRADOR' } },
              },
              select: { id: true },
            });
        await tx.notice.createMany({
          data: recipients.map(({ id }) => ({
            recipientUserId: id,
            type: 'PROPUESTA_PENDIENTE' as const,
            referenceType: 'ADAPTATION_PROPOSAL',
            referenceId: proposal.id,
            text:
              'Propuesta de renovación ESTRUCTURA pendiente de revisión.' +
              (evaluation.sinDatosActualizados
                ? ' Generada sin datos actualizados; falta una medición corporal posterior al inicio del ciclo.'
                : ''),
            createdAt: evaluatedAt,
          })),
        });
        return 'generated';
      },
      { timeout: 20_000 },
    );
  }

  async recordFailure(
    cycleId: string,
    message: string,
    evaluatedAt: Date,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<
        Array<{ alerted_at: Date | null }>
      >`SELECT alerted_at FROM app.routine_renewal_cycles WHERE id = ${cycleId}::uuid FOR UPDATE`;
      const cycle = await tx.routineRenewalCycle.findUniqueOrThrow({
        where: { id: cycleId },
        include: {
          request: { select: { state: true } },
          routineVersion: {
            include: {
              routine: { include: { student: { include: { user: true } } } },
            },
          },
        },
      });
      await tx.routineRenewalCycle.update({
        where: { id: cycleId },
        data: {
          lastError: message.slice(0, 1000),
          ...(cycle.request?.state === 'COMPLETADA' ||
          cycle.request?.state === 'NO_DISPONIBLE' ||
          cycle.request?.state === 'CANCELADA'
            ? { state: 'NO_DISPONIBLE' }
            : {}),
          alertedAt: cycle.alertedAt ?? evaluatedAt,
        },
      });
      if (locked?.alerted_at) return;
      const routine = cycle.routineVersion.routine;
      const assignment = await tx.trainerStudentAssignment.findFirst({
        where: {
          studentId: routine.studentId,
          endsAt: null,
          startsAt: { lte: evaluatedAt },
        },
        select: { trainerId: true },
      });
      const recipients = assignment
        ? [{ id: assignment.trainerId }]
        : await tx.user.findMany({
            where: {
              gymId: routine.student.user.gymId,
              state: 'ACTIVO',
              roles: { some: { role: 'ADMINISTRADOR' } },
            },
            select: { id: true },
          });
      await tx.notice.createMany({
        data: recipients.map(({ id }) => ({
          recipientUserId: id,
          type: 'SENAL_DETECTADA' as const,
          referenceType: 'ROUTINE_RENEWAL_CYCLE',
          referenceId: cycleId,
          text: 'No se generó la rutina de renovación ESTRUCTURA: el servicio de IA falló o no entregó una propuesta válida. Revisar el ciclo pendiente.',
          createdAt: evaluatedAt,
        })),
      });
    });
  }

  async release(cycleId: string, evaluatedAt: Date): Promise<void> {
    await this.prisma.routineRenewalCycle.update({
      where: { id: cycleId },
      data: { leaseUntil: evaluatedAt },
    });
  }
}
