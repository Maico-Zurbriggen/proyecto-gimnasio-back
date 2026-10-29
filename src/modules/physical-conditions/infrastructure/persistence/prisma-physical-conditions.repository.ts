import type { Prisma, PrismaClient } from '@prisma/client';
import { noticeEventKeys } from '../../../notifications/domain/notice-event';

import { isUuid } from '../../../../shared/types/uuid';
import type {
  DeclareConditionCommand,
  PhysicalConditionRecord,
  PhysicalConditionsRepository,
} from '../../application/ports/physical-conditions.repository';
import type { Severidad, ZonaCorporal } from '../../domain/services/body-zones';
import { estabaVigenteEn } from '../../domain/services/condition-validity';
import { evaluateExerciseCompatibility } from '../../domain/services/exercise-compatibility';
import {
  conditionProposalState,
  conditionSubstitutionValue,
} from '../../domain/services/condition-proposal';

interface Row {
  id: string;
  studentId: string;
  bodyZoneCode: string;
  severity: string;
  description: string | null;
  startsOn: Date;
  endsOn: Date | null;
}

function toRecord(row: Row): PhysicalConditionRecord {
  return {
    id: row.id,
    studentId: row.studentId,
    bodyZoneCode: row.bodyZoneCode as ZonaCorporal,
    severity: row.severity as Severidad,
    description: row.description,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
  };
}

/** RN-91/RN-92: recalcula marcas y deriva avisos/propuesta de sustitución. */
async function reevaluateCurrentRoutines(
  tx: Prisma.TransactionClient,
  studentId: string,
  evaluatedAt: Date,
): Promise<void> {
  const student = await tx.studentProfile.findUnique({
    where: { userId: studentId },
    select: {
      experienceLevel: true,
      user: { select: { gymId: true } },
      physicalConditions: {
        select: {
          bodyZoneCode: true,
          severity: true,
          startsOn: true,
          endsOn: true,
        },
      },
    },
  });
  if (!student) return;

  const [routines, equipment] = await Promise.all([
    tx.routine.findMany({
      where: { studentId, state: { in: ['VIGENTE', 'PROPUESTA'] } },
      select: {
        id: true,
        state: true,
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
          select: {
            id: true,
            days: {
              select: {
                exercises: {
                  select: {
                    id: true,
                    exercise: {
                      select: {
                        id: true,
                        name: true,
                        movementPattern: true,
                        state: true,
                        difficultyLevel: true,
                        equipment: { select: { equipmentCode: true } },
                        muscles: {
                          where: { participation: 'PRIMARIA' },
                          select: { muscleCode: true },
                        },
                        joints: { select: { jointCode: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
    tx.gymEquipment.findMany({
      where: { gymId: student.user.gymId, present: true },
      select: { equipmentCode: true },
    }),
  ]);

  const activeConditions = student.physicalConditions
    .filter((condition) => estabaVigenteEn(condition, evaluatedAt))
    .map((condition) => ({
      bodyZoneCode: condition.bodyZoneCode as ZonaCorporal,
      severity: condition.severity as Severidad,
    }));
  const presentEquipment = equipment.map((item) => item.equipmentCode);

  const catalog = await tx.gymExercise.findMany({
    where: {
      gymId: student.user.gymId,
      enabled: true,
      exercise: { state: 'APROBADO' },
    },
    select: {
      exercise: {
        select: {
          id: true,
          name: true,
          movementPattern: true,
          state: true,
          difficultyLevel: true,
          equipment: { select: { equipmentCode: true } },
          muscles: {
            where: { participation: 'PRIMARIA' },
            select: { muscleCode: true },
          },
          joints: { select: { jointCode: true } },
        },
      },
    },
  });

  for (const routine of routines) {
    const version = routine.versions[0];
    if (!version) continue;
    const incompatibilities: Array<{
      routineExerciseId: string;
      exerciseId: string;
      exerciseName: string;
      reason: string;
      replacement: { id: string; name: string } | null;
    }> = [];
    for (const day of version.days) {
      for (const item of day.exercises) {
        const compatibility = evaluateExerciseCompatibility({
          exerciseState: item.exercise.state,
          exerciseDifficulty: item.exercise.difficultyLevel,
          studentExperience: student.experienceLevel,
          requiredEquipment: item.exercise.equipment.map(
            (requirement) => requirement.equipmentCode,
          ),
          presentEquipment,
          primaryMuscles: item.exercise.muscles.map(
            (muscle) => muscle.muscleCode,
          ),
          joints: item.exercise.joints.map((joint) => joint.jointCode),
          activeConditions,
        });
        await tx.routineExercise.update({
          where: { id: item.id },
          data: {
            compatibilityState: compatibility.state,
            compatibilityReason: compatibility.reason,
          },
        });

        if (
          routine.state === 'VIGENTE' &&
          compatibility.state === 'INCOMPATIBLE'
        ) {
          const replacement = catalog
            .map(({ exercise }) => ({
              exercise,
              compatibility: evaluateExerciseCompatibility({
                exerciseState: exercise.state,
                exerciseDifficulty: exercise.difficultyLevel,
                studentExperience: student.experienceLevel,
                requiredEquipment: exercise.equipment.map(
                  (requirement) => requirement.equipmentCode,
                ),
                presentEquipment,
                primaryMuscles: exercise.muscles.map(
                  (muscle) => muscle.muscleCode,
                ),
                joints: exercise.joints.map((joint) => joint.jointCode),
                activeConditions,
              }),
            }))
            .find(
              ({ exercise, compatibility: candidateCompatibility }) =>
                exercise.id !== item.exercise.id &&
                exercise.movementPattern === item.exercise.movementPattern &&
                candidateCompatibility.state === 'COMPATIBLE',
            )?.exercise;
          incompatibilities.push({
            routineExerciseId: item.id,
            exerciseId: item.exercise.id,
            exerciseName: item.exercise.name,
            reason:
              compatibility.reason ??
              'El ejercicio es incompatible con una condición física vigente.',
            replacement: replacement
              ? { id: replacement.id, name: replacement.name }
              : null,
          });
        }
      }
    }

    if (routine.state !== 'VIGENTE') continue;

    const superseded = await tx.adaptationProposal.findMany({
      where: {
        studentId,
        state: { in: ['PENDIENTE', 'BLOQUEADA'] },
      },
      select: { id: true },
    });
    if (superseded.length > 0) {
      const supersededIds = superseded.map((proposal) => proposal.id);
      await tx.adaptationProposal.updateMany({
        where: { id: { in: supersededIds } },
        data: {
          state: 'INVALIDADA',
          resolvedAt: evaluatedAt,
          resolutionReason: 'Cambió el contexto de condiciones físicas.',
        },
      });
      await tx.notice.updateMany({
        where: {
          referenceType: 'ADAPTATION_PROPOSAL',
          referenceId: { in: supersededIds },
          expired: false,
        },
        data: { expired: true },
      });
    }

    if (incompatibilities.length === 0) continue;

    const assignment = await tx.trainerStudentAssignment.findFirst({
      where: {
        studentId,
        startsAt: { lte: evaluatedAt },
        OR: [{ endsAt: null }, { endsAt: { gt: evaluatedAt } }],
      },
      select: { trainerId: true },
    });
    const day = new Date(
      `${evaluatedAt.toISOString().slice(0, 10)}T00:00:00.000Z`,
    );
    const diagnostic = await tx.evolutionDiagnostic.create({
      data: {
        studentId,
        routineVersionId: version.id,
        periodStart: day,
        periodEnd: day,
        globalSituation: 'DATOS_INSUFICIENTES',
        componentVersion: 'condition-context-v1',
        criteriaNotEvaluated: ['rendimiento'],
        calculatedAt: evaluatedAt,
      },
    });
    const proposal = await tx.adaptationProposal.create({
      data: {
        diagnosticId: diagnostic.id,
        studentId,
        // BLOQUEADA representa exclusivamente la falta de entrenador vigente.
        // Si no existe un reemplazo automático, el entrenador igualmente debe
        // recibir la propuesta y resolver el ejercicio de forma manual.
        state: conditionProposalState(assignment !== null),
        componentVersion: 'condition-context-v1',
        createdAt: evaluatedAt,
        resolutionReason: null,
        adjustments: {
          create: incompatibilities.map((item) => ({
            type: 'SUSTITUCION',
            routineExerciseId: item.routineExerciseId,
            previousValue: {
              exercise_id: item.exerciseId,
              exercise_name: item.exerciseName,
            },
            proposedValue: conditionSubstitutionValue(item.replacement),
            criterion: item.reason,
            supportingData: {
              motivo: item.reason,
              origen: 'condicion_fisica_vigente',
              requires_manual_intervention: item.replacement === null,
            },
          })),
        },
      },
    });
    const recipients = [
      studentId,
      ...(assignment ? [assignment.trainerId] : []),
    ];
    for (const recipientUserId of recipients) {
      await tx.notice.upsert({
        where: {
          recipientUserId_eventKey: {
            recipientUserId,
            eventKey: noticeEventKeys.physicalConditionProposal(proposal.id),
          },
        },
        update: {},
        create: {
          recipientUserId,
          eventKey: noticeEventKeys.physicalConditionProposal(proposal.id),
          audienceRole: recipientUserId === studentId ? 'ALUMNO' : 'ENTRENADOR',
          type: 'INCOMPATIBILIDAD_SOBREVENIDA',
          referenceType: 'ADAPTATION_PROPOSAL',
          referenceId: proposal.id,
          text: 'Una condición física vigente afecta ejercicios de la rutina. La rutina sigue disponible y requiere revisión del entrenador.',
          createdAt: evaluatedAt,
        },
      });
    }
  }
}

export class PrismaPhysicalConditionsRepository implements PhysicalConditionsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async declare(
    command: DeclareConditionCommand,
  ): Promise<PhysicalConditionRecord | null> {
    if (!isUuid(command.studentId)) return null;

    return this.prisma.$transaction(
      async (tx) => {
        const profile = await tx.studentProfile.findUnique({
          where: { userId: command.studentId },
          select: { userId: true },
        });
        if (!profile) return null;

        const created = await tx.physicalCondition.create({
          data: {
            studentId: command.studentId,
            bodyZoneCode: command.bodyZoneCode,
            severity: command.severity,
            description: command.description,
            startsOn: command.startsOn,
          },
        });
        // FL-01/A1: declarar una condición anula la declaración de "ninguna".
        await tx.studentProfile.update({
          where: { userId: command.studentId },
          data: { noConditionsDeclaredAt: null },
        });
        await reevaluateCurrentRoutines(tx, command.studentId, new Date());
        return toRecord(created);
      },
      { timeout: 20000 },
    );
  }

  async listByStudent(studentId: string): Promise<PhysicalConditionRecord[]> {
    if (!isUuid(studentId)) return [];
    const rows = await this.prisma.physicalCondition.findMany({
      where: { studentId },
      orderBy: { startsOn: 'desc' },
    });
    return rows.map(toRecord);
  }

  async findById(
    conditionId: string,
    studentId: string,
  ): Promise<PhysicalConditionRecord | null> {
    if (!isUuid(conditionId) || !isUuid(studentId)) return null;
    const row = await this.prisma.physicalCondition.findFirst({
      where: { id: conditionId, studentId },
    });
    return row ? toRecord(row) : null;
  }

  async close(
    conditionId: string,
    endsOn: Date,
  ): Promise<PhysicalConditionRecord> {
    return this.prisma.$transaction(
      async (tx) => {
        const updated = await tx.physicalCondition.update({
          where: { id: conditionId },
          data: { endsOn },
        });
        await reevaluateCurrentRoutines(tx, updated.studentId, new Date());
        return toRecord(updated);
      },
      { timeout: 20000 },
    );
  }

  async hasHealthConsent(studentId: string): Promise<boolean> {
    if (!isUuid(studentId)) return false;
    const consent = await this.prisma.consent.findFirst({
      where: { userId: studentId, type: 'DATOS_SALUD' },
      orderBy: { recordedAt: 'desc' },
      select: { granted: true },
    });
    return consent?.granted ?? false;
  }

  async findNoConditionsDeclaration(
    studentId: string,
  ): Promise<Date | null | undefined> {
    if (!isUuid(studentId)) return undefined;
    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId: studentId },
      select: { noConditionsDeclaredAt: true },
    });
    return profile ? profile.noConditionsDeclaredAt : undefined;
  }

  async declareNoConditions(studentId: string, at: Date): Promise<void> {
    await this.prisma.studentProfile.update({
      where: { userId: studentId },
      data: { noConditionsDeclaredAt: at },
    });
  }
}
