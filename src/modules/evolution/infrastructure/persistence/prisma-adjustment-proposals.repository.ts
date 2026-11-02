import { Prisma, type PrismaClient } from '@prisma/client';

import type {
  AdjustmentProposalsRepository,
  DeliveredProposal,
} from '../../application/ports/adjustment-proposals.repository';
import type {
  DiagnosticInput,
  Elaboration,
  ExerciseFinding,
  GlobalFindings,
} from '../../domain/services/adjustment-table';
import type { TrainingPurpose } from '../../../routine-generations/domain/services/generated-routine-validator';
import { noticeEventKeys } from '../../../notifications/domain/notice-event';

const EMPTY_GLOBAL: GlobalFindings = {
  lowAdherenceWeeks: 0,
  imbalances: [],
  goalChange: null,
};

function parseGlobalFindings(value: unknown): GlobalFindings {
  if (typeof value !== 'object' || value === null) return EMPTY_GLOBAL;
  const raw = value as Partial<GlobalFindings>;
  return {
    lowAdherenceWeeks:
      typeof raw.lowAdherenceWeeks === 'number' ? raw.lowAdherenceWeeks : 0,
    imbalances: Array.isArray(raw.imbalances) ? raw.imbalances : [],
    goalChange: raw.goalChange ?? null,
  };
}

const json = (value: unknown) => value as Prisma.InputJsonValue;

export class PrismaAdjustmentProposalsRepository implements AdjustmentProposalsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findProposalByDiagnostic(
    diagnosticId: string,
  ): Promise<DeliveredProposal | null> {
    const proposal = await this.prisma.adaptationProposal.findUnique({
      where: { diagnosticId },
      select: { id: true, state: true },
    });
    if (!proposal) return null;
    return {
      proposalId: proposal.id,
      state: proposal.state === 'BLOQUEADA' ? 'BLOQUEADA' : 'PENDIENTE',
      alreadyExisted: true,
    };
  }

  async loadDiagnostic(diagnosticId: string): Promise<DiagnosticInput | null> {
    const diagnostic = await this.prisma.evolutionDiagnostic.findUnique({
      where: { id: diagnosticId },
      include: {
        exerciseDiagnostics: true,
        routineVersion: {
          include: {
            routine: true,
            days: {
              orderBy: { position: 'asc' },
              include: {
                exercises: {
                  orderBy: { position: 'asc' },
                  include: {
                    exercise: true,
                    sets: { orderBy: { position: 'asc' } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!diagnostic) return null;

    const version = diagnostic.routineVersion;
    const exercises = version.days.flatMap((day) => day.exercises);
    const diagnosticByExercise = new Map(
      diagnostic.exerciseDiagnostics.map((item) => [item.exerciseId, item]),
    );

    // Diagnósticos previos de la misma versión, del más nuevo al más viejo, para
    // contar los ESTANCAMIENTO consecutivos de cada ejercicio.
    const previous = await this.prisma.evolutionDiagnostic.findMany({
      where: {
        studentId: diagnostic.studentId,
        routineVersionId: diagnostic.routineVersionId,
        id: { not: diagnostic.id },
        calculatedAt: { lt: diagnostic.calculatedAt },
      },
      orderBy: { calculatedAt: 'desc' },
      include: { exerciseDiagnostics: true },
    });

    const student = await this.prisma.user.findUnique({
      where: { id: diagnostic.studentId },
      select: { gymId: true },
    });
    const today = diagnostic.periodEnd;
    const conditions = await this.prisma.physicalCondition.findMany({
      where: {
        studentId: diagnostic.studentId,
        startsOn: { lte: today },
        OR: [{ endsOn: null }, { endsOn: { gt: today } }],
      },
      select: { bodyZoneCode: true },
    });
    const blockedRegions = conditions.map((c) => c.bodyZoneCode);
    const inRoutine = exercises.map((e) => e.exerciseId);

    const findings: ExerciseFinding[] = [];
    for (const routineExercise of exercises) {
      const current = diagnosticByExercise.get(routineExercise.exerciseId);
      if (!current) continue;

      let consecutive = current.situation === 'ESTANCAMIENTO' ? 1 : 0;
      if (consecutive === 1) {
        for (const earlier of previous) {
          const item = earlier.exerciseDiagnostics.find(
            (candidate) => candidate.exerciseId === routineExercise.exerciseId,
          );
          if (item?.situation !== 'ESTANCAMIENTO') break;
          consecutive += 1;
        }
      }

      const needsAlternative =
        current.situation === 'ESTANCAMIENTO' ||
        routineExercise.compatibilityState === 'INCOMPATIBLE' ||
        routineExercise.compatibilityState === 'EJERCICIO_DESACTIVADO';
      const alternative =
        needsAlternative && student
          ? await this.prisma.exercise.findFirst({
              where: {
                movementPattern: routineExercise.exercise.movementPattern,
                state: 'APROBADO',
                id: { notIn: inRoutine },
                OR: [{ gymId: null }, { gymId: student.gymId }],
                availability: {
                  some: { gymId: student.gymId, enabled: true },
                },
                ...(blockedRegions.length
                  ? {
                      joints: {
                        none: {
                          joint: { region: { in: blockedRegions } },
                        },
                      },
                    }
                  : {}),
              },
              orderBy: { name: 'asc' },
              select: { id: true, name: true },
            })
          : null;

      findings.push({
        routineExerciseId: routineExercise.id,
        exerciseId: routineExercise.exerciseId,
        exerciseName: routineExercise.exercise.name,
        situation: current.situation,
        compatibilityState: routineExercise.compatibilityState,
        consecutiveStagnations: consecutive,
        sets: routineExercise.sets.map((set) => ({
          position: set.position,
          minRepetitions: set.minRepetitions,
          maxRepetitions: set.maxRepetitions,
          suggestedLoad:
            set.suggestedLoad === null ? null : Number(set.suggestedLoad),
          restSeconds: set.restSeconds,
          warmup: set.warmup,
        })),
        metrics: current.metrics,
        alternativeExerciseId: alternative?.id ?? null,
        alternativeExerciseName: alternative?.name ?? null,
      });
    }

    return {
      diagnosticId: diagnostic.id,
      globalSituation: diagnostic.globalSituation,
      adherence:
        diagnostic.adherence === null ? null : Number(diagnostic.adherence),
      routine: {
        routineType: version.routine.routineType as TrainingPurpose,
        targetWeeklyFrequency: version.routine.targetWeeklyFrequency,
        exercisesPerDay: version.days.map((day) => day.exercises.length),
      },
      exercises: findings,
      global: parseGlobalFindings(diagnostic.globalFindings),
    };
  }

  async deliver(input: {
    diagnosticId: string;
    elaboration: Elaboration;
    componentVersion: string;
    at: Date;
  }): Promise<DeliveredProposal> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.adaptationProposal.findUnique({
          where: { diagnosticId: input.diagnosticId },
          select: { id: true, state: true },
        });
        if (existing) {
          return {
            proposalId: existing.id,
            state: existing.state === 'BLOQUEADA' ? 'BLOQUEADA' : 'PENDIENTE',
            alreadyExisted: true,
          } satisfies DeliveredProposal;
        }

        const diagnostic = await tx.evolutionDiagnostic.findUniqueOrThrow({
          where: { id: input.diagnosticId },
          select: { studentId: true },
        });
        const trainer = await tx.trainerStudentAssignment.findFirst({
          where: {
            studentId: diagnostic.studentId,
            endsAt: null,
            startsAt: { lte: input.at },
          },
          select: { trainerId: true },
        });
        const proposal = await tx.adaptationProposal.create({
          data: {
            diagnosticId: input.diagnosticId,
            studentId: diagnostic.studentId,
            state: trainer ? 'PENDIENTE' : 'BLOQUEADA',
            componentVersion: input.componentVersion,
            createdAt: input.at,
            adjustments: {
              create: input.elaboration.adjustments.map((adjustment) => ({
                type: adjustment.type,
                routineExerciseId: adjustment.routineExerciseId,
                previousValue: json(adjustment.previousValue),
                proposedValue: json(adjustment.proposedValue),
                criterion: adjustment.criterion,
                supportingData: json(adjustment.supportingData),
                state: 'PENDIENTE' as const,
              })),
            },
          },
        });

        const count = input.elaboration.adjustments.length;
        if (trainer) {
          await tx.notice.create({
            data: {
              recipientUserId: trainer.trainerId,
              eventKey: noticeEventKeys.adaptationProposal(
                proposal.id,
                'pending',
              ),
              audienceRole: 'ENTRENADOR',
              type: 'PROPUESTA_PENDIENTE',
              referenceType: 'ADAPTATION_PROPOSAL',
              referenceId: proposal.id,
              text: `Propuesta de ajuste pendiente de revisión (${String(count)} ${count === 1 ? 'ajuste' : 'ajustes'}).`,
              createdAt: input.at,
            },
          });
        } else {
          // Sin entrenador vigente: BLOQUEADA y se señala al administrador.
          const student = await tx.user.findUniqueOrThrow({
            where: { id: diagnostic.studentId },
            select: { gymId: true },
          });
          const admins = await tx.user.findMany({
            where: {
              gymId: student.gymId,
              state: 'ACTIVO',
              roles: { some: { role: 'ADMINISTRADOR' } },
            },
            select: { id: true },
          });
          if (admins.length > 0) {
            await tx.notice.createMany({
              data: admins.map(({ id }) => ({
                recipientUserId: id,
                eventKey: noticeEventKeys.adaptationProposal(
                  proposal.id,
                  'blocked',
                ),
                audienceRole: 'ADMINISTRADOR' as const,
                type: 'PROPUESTA_PENDIENTE' as const,
                referenceType: 'ADAPTATION_PROPOSAL',
                referenceId: proposal.id,
                text: 'Propuesta de ajuste bloqueada: el alumno no tiene entrenador vigente.',
                createdAt: input.at,
              })),
              skipDuplicates: true,
            });
          }
        }
        return {
          proposalId: proposal.id,
          state: trainer ? 'PENDIENTE' : 'BLOQUEADA',
          alreadyExisted: false,
        } satisfies DeliveredProposal;
      });
    } catch (error) {
      // Reejecución concurrente: el diagnóstico ya tiene propuesta (RN-83).
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.findProposalByDiagnostic(
          input.diagnosticId,
        );
        if (existing) return existing;
      }
      throw error;
    }
  }
}
