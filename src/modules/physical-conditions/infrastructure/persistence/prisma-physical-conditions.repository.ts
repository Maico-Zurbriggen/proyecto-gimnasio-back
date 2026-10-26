import type { Prisma, PrismaClient } from '@prisma/client';

import { isUuid } from '../../../../shared/types/uuid';
import type {
  DeclareConditionCommand,
  PhysicalConditionRecord,
  PhysicalConditionsRepository,
} from '../../application/ports/physical-conditions.repository';
import type { Severidad, ZonaCorporal } from '../../domain/services/body-zones';
import { estabaVigenteEn } from '../../domain/services/condition-validity';
import { evaluateExerciseCompatibility } from '../../domain/services/exercise-compatibility';

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

/** RN-45: recalcula la última versión vigente o propuesta del alumno. */
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
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
          select: {
            days: {
              select: {
                exercises: {
                  select: {
                    id: true,
                    exercise: {
                      select: {
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

  for (const routine of routines) {
    const version = routine.versions[0];
    if (!version) continue;
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
      }
    }
  }
}

export class PrismaPhysicalConditionsRepository implements PhysicalConditionsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async declare(
    command: DeclareConditionCommand,
  ): Promise<PhysicalConditionRecord | null> {
    if (!isUuid(command.studentId)) return null;

    return this.prisma.$transaction(async (tx) => {
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
    });
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
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.physicalCondition.update({
        where: { id: conditionId },
        data: { endsOn },
      });
      await reevaluateCurrentRoutines(tx, updated.studentId, new Date());
      return toRecord(updated);
    });
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
