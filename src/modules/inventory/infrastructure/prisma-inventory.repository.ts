import type { PrismaClient } from '@prisma/client';

import type {
  EquipmentRecord,
  InventoryRepository,
} from '../application/inventory';
import {
  EQUIPAMIENTO_SIEMPRE_PRESENTE,
  equipamientoDisponible,
  esPrescribible,
  type EjercicioDelCatalogo,
} from '../domain/prescribable-catalog';

/** Prefijo con el que se marca la incompatibilidad causada por el inventario. */
const MOTIVO_EQUIPAMIENTO = 'Equipamiento retirado del inventario';

export class PrismaInventoryRepository implements InventoryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listEquipment(gymId: string): Promise<EquipmentRecord[]> {
    const equipment = await this.prisma.equipment.findMany({
      orderBy: { displayOrder: 'asc' },
      select: {
        code: true,
        name: true,
        gyms: { where: { gymId }, select: { present: true } },
      },
    });
    return equipment.map((item) => ({
      code: item.code,
      name: item.name,
      present: item.gyms[0]?.present ?? false,
    }));
  }

  async listCatalog(gymId: string): Promise<EjercicioDelCatalogo[]> {
    const exercises = await this.prisma.exercise.findMany({
      where: { OR: [{ gymId: null }, { gymId }] },
      select: {
        movementPattern: true,
        equipment: { select: { equipmentCode: true } },
      },
    });
    return exercises.map((exercise) => ({
      movementPattern: exercise.movementPattern,
      equipment: exercise.equipment.map((item) => item.equipmentCode),
    }));
  }

  async save(input: {
    gymId: string;
    actorUserId: string;
    present: string[];
  }): Promise<{ markedIncompatible: number; restored: number }> {
    return this.prisma.$transaction(async (tx) => {
      const anterior = await tx.gymEquipment.findMany({
        where: { gymId: input.gymId, present: true },
        select: { equipmentCode: true },
      });
      const codigos = await tx.equipment.findMany({ select: { code: true } });
      const presentes = new Set(input.present);

      for (const { code } of codigos) {
        if (code === EQUIPAMIENTO_SIEMPRE_PRESENTE) continue;
        await tx.gymEquipment.upsert({
          where: {
            gymId_equipmentCode: { gymId: input.gymId, equipmentCode: code },
          },
          create: {
            gymId: input.gymId,
            equipmentCode: code,
            present: presentes.has(code),
            updatedByUserId: input.actorUserId,
          },
          update: {
            present: presentes.has(code),
            updatedByUserId: input.actorUserId,
          },
        });
      }

      // RN-117: los ejercicios de rutinas vigentes que pierden su equipamiento
      // pasan a INCOMPATIBLE (no se detiene ninguna rutina); los que lo
      // recuperan vuelven a COMPATIBLE.
      const disponible = equipamientoDisponible(input.present);
      const enUso = await tx.routineExercise.findMany({
        where: {
          routineDay: {
            routineVersion: {
              current: true,
              routine: {
                state: 'VIGENTE',
                student: { user: { gymId: input.gymId } },
              },
            },
          },
        },
        select: {
          id: true,
          compatibilityState: true,
          compatibilityReason: true,
          exercise: {
            select: {
              movementPattern: true,
              equipment: { select: { equipmentCode: true } },
            },
          },
        },
      });

      let markedIncompatible = 0;
      let restored = 0;
      for (const item of enUso) {
        const requeridos = item.exercise.equipment.map((e) => e.equipmentCode);
        const prescribible = esPrescribible(
          {
            movementPattern: item.exercise.movementPattern,
            equipment: requeridos,
          },
          disponible,
        );
        if (!prescribible && item.compatibilityState !== 'INCOMPATIBLE') {
          const faltantes = requeridos.filter((code) => !disponible.has(code));
          await tx.routineExercise.update({
            where: { id: item.id },
            data: {
              compatibilityState: 'INCOMPATIBLE',
              compatibilityReason: `${MOTIVO_EQUIPAMIENTO}: ${faltantes.join(', ')}`,
            },
          });
          markedIncompatible += 1;
        } else if (
          prescribible &&
          item.compatibilityState === 'INCOMPATIBLE' &&
          item.compatibilityReason?.startsWith(MOTIVO_EQUIPAMIENTO)
        ) {
          await tx.routineExercise.update({
            where: { id: item.id },
            data: {
              compatibilityState: 'COMPATIBLE',
              compatibilityReason: null,
            },
          });
          restored += 1;
        }
      }

      // RN-108: los cambios del inventario quedan en auditoría.
      await tx.auditLog.create({
        data: {
          actorUserId: input.actorUserId,
          operation: 'INVENTARIO',
          entityType: 'GYM',
          entityId: input.gymId,
          previousValue: { presente: anterior.map((e) => e.equipmentCode) },
          newValue: {
            presente: [...presentes],
            ejerciciosIncompatibles: markedIncompatible,
            ejerciciosRestituidos: restored,
          },
        },
      });

      return { markedIncompatible, restored };
    });
  }

  async countActiveTrainers(gymId: string): Promise<number> {
    return this.prisma.trainerProfile.count({
      where: {
        user: {
          gymId,
          state: 'ACTIVO',
          roles: { some: { role: 'ENTRENADOR' } },
        },
      },
    });
  }

  async hasDeclaredInventory(gymId: string): Promise<boolean> {
    return (await this.prisma.gymEquipment.count({ where: { gymId } })) > 0;
  }
}
