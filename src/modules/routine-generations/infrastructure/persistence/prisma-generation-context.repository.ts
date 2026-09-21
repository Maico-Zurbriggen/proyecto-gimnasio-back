import type { PrismaClient } from '@prisma/client';

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
      .filter((goal) => isActive(goal.endsOn))
      .map((goal) => goal.type.toLowerCase());

    const condiciones = student.physicalConditions
      .filter((condition) => isActive(condition.endsOn))
      .map((condition) =>
        (condition.description ?? condition.bodyZoneCode).toLowerCase(),
      );

    const minimizedContext: MinimizedContext = {
      nivelExperiencia: student.experienceLevel.toLowerCase(),
      diasSemanalesDisponibles: student.availableDaysPerWeek,
      objetivosActivos,
      condiciones,
    };

    return {
      gymId: student.user.gymId,
      minimizedContext,
    };
  }

  async getPrefilteredCatalog(gymId: string): Promise<CatalogExerciseRef[]> {
    const [exercises, presentEquipment] = await Promise.all([
      this.prisma.exercise.findMany({
        where: { OR: [{ gymId }, { origin: 'CATALOGO_BASE' }] },
        include: { equipment: true },
      }),
      this.prisma.gymEquipment.findMany({
        where: { gymId, present: true },
        select: { equipmentCode: true },
      }),
    ]);

    const availableEquipmentCodes = new Set(
      presentEquipment.map((equipment) => equipment.equipmentCode),
    );

    return exercises
      .filter(
        (exercise) =>
          exercise.equipment.length === 0 ||
          exercise.equipment.every((requirement) =>
            availableEquipmentCodes.has(requirement.equipmentCode),
          ),
      )
      .map((exercise) => ({
        id: exercise.id,
        nombre: exercise.name,
        patronMovimiento: exercise.movementPattern,
      }));
  }
}
