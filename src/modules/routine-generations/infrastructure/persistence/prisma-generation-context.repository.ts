import type { PrismaClient } from '@prisma/client';
import { equipamientoDisponible } from '../../../inventory/domain/prescribable-catalog';

import type {
  CatalogExerciseRef,
  MinimizedContext,
} from '../../application/dto/routine-generation-context.dto';
import type {
  GenerationContextRepository,
  StudentGenerationContext,
} from '../../application/ports/generation-context.repository';

export class PrismaGenerationContextRepository implements GenerationContextRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getStudentContext(
    studentId: string,
    asOf: Date,
  ): Promise<StudentGenerationContext | null> {
    const student = await this.prisma.studentProfile.findUnique({
      where: { userId: studentId },
      include: {
        user: { select: { gymId: true } },
        goals: true,
        physicalConditions: true,
      },
    });

    if (!student) {
      return null;
    }

    const isActive = (endsOn: Date | null): boolean =>
      endsOn === null || endsOn >= asOf;

    const objetivosActivos = student.goals
      .filter(
        (goal) =>
          goal.startsOn <= asOf && (goal.endsOn === null || goal.endsOn > asOf),
      )
      .map((goal) => goal.type.toLowerCase());

    const condiciones = student.physicalConditions
      .filter((condition) => isActive(condition.endsOn))
      .map((condition) =>
        (condition.description ?? condition.bodyZoneCode).toLowerCase(),
      );

    const minimizedContext: MinimizedContext = {
      // Un perfil recién creado por el alta (HU06) todavía no declaró su
      // contexto (FL-01): vacío y cero hacen que `goalContext` lo informe como
      // faltante en lugar de inventar un valor.
      nivelExperiencia: student.experienceLevel?.toLowerCase() ?? '',
      diasSemanalesDisponibles: student.availableDaysPerWeek ?? 0,
      objetivosActivos,
      condiciones,
    };

    return {
      gymId: student.user.gymId,
      minimizedContext,
    };
  }

  async getPrefilteredCatalog(
    studentId: string,
    gymId: string,
    asOf: Date,
  ): Promise<CatalogExerciseRef[]> {
    const [student, exercises, presentEquipment] = await Promise.all([
      this.prisma.studentProfile.findUnique({
        where: { userId: studentId },
        include: { physicalConditions: true },
      }),
      this.prisma.exercise.findMany({
        where: { OR: [{ gymId }, { origin: 'CATALOGO_BASE' }] },
        include: { equipment: true, muscles: true, joints: true },
      }),
      this.prisma.gymEquipment.findMany({
        where: { gymId, present: true },
        select: { equipmentCode: true },
      }),
    ]);

    // RN-115: el peso corporal está siempre presente aunque no se declare.
    const availableEquipmentCodes = equipamientoDisponible(
      presentEquipment.map((equipment) => equipment.equipmentCode),
    );

    if (!student?.experienceLevel) {
      return [];
    }
    const studentLevel = student.experienceLevel;
    const levelRank = { PRINCIPIANTE: 0, INTERMEDIO: 1, AVANZADO: 2 } as const;
    const activeConditions = student.physicalConditions.filter(
      (condition) =>
        condition.startsOn <= asOf &&
        (condition.endsOn === null || condition.endsOn >= asOf),
    );

    return exercises
      .filter(
        (exercise) =>
          levelRank[exercise.difficultyLevel] <= levelRank[studentLevel] &&
          (exercise.equipment.length === 0 ||
            exercise.equipment.every((requirement) =>
              availableEquipmentCodes.has(requirement.equipmentCode),
            )) &&
          !activeConditions.some(
            (condition) =>
              condition.severity !== 'LEVE' &&
              (exercise.muscles.some(
                (muscle) =>
                  muscle.participation === 'PRIMARIA' &&
                  muscle.muscleCode === condition.bodyZoneCode,
              ) ||
                exercise.joints.some(
                  (joint) => joint.jointCode === condition.bodyZoneCode,
                )),
          ),
      )
      .map((exercise) => ({
        id: exercise.id,
        nombre: exercise.name,
        patronMovimiento: exercise.movementPattern,
        musculosPrimarios: exercise.muscles
          .filter((muscle) => muscle.participation === 'PRIMARIA')
          .map((muscle) => muscle.muscleCode),
      }));
  }
}
