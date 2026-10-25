import type { PrismaClient } from '@prisma/client';

import { isUuid } from '../../../../shared/types/uuid';
import type {
  RevaluationOutcome,
  RoutineRevaluation,
} from '../../application/ports/routine-revaluation.port';
import { SIN_CAMBIOS } from '../../application/ports/routine-revaluation.port';
import type { Severidad, ZonaCorporal } from '../../domain/services/body-zones';
import {
  evaluarContraindicacion,
  proximoEstado,
  type EstadoCompatibilidad,
} from '../../domain/services/exercise-contraindication';

/** Una condición rige hoy si empezó y no terminó (RN-10). */
function vigenteHoy(
  condicion: { startsOn: Date; endsOn: Date | null },
  hoy: Date,
): boolean {
  if (condicion.startsOn.getTime() > hoy.getTime()) return false;
  return (
    condicion.endsOn === null || condicion.endsOn.getTime() > hoy.getTime()
  );
}

/**
 * Reevaluación de la rutina vigente contra las condiciones del alumno (RN-91).
 *
 * Marca los ejercicios afectados **sin retirarlos** de la rutina (RN-92): una
 * rutina vigente no se desarma sola, se señala para que el entrenador decida.
 */
export class PrismaRoutineRevaluation implements RoutineRevaluation {
  constructor(private readonly prisma: PrismaClient) {}

  async revaluateForStudent(studentId: string): Promise<RevaluationOutcome> {
    if (!isUuid(studentId)) {
      return SIN_CAMBIOS;
    }

    const ahora = new Date();
    const hoy = new Date(
      Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate()),
    );

    const condiciones = (
      await this.prisma.physicalCondition.findMany({
        where: { studentId },
        select: {
          bodyZoneCode: true,
          severity: true,
          startsOn: true,
          endsOn: true,
        },
      })
    )
      .filter((condicion) => vigenteHoy(condicion, hoy))
      .map((condicion) => ({
        bodyZoneCode: condicion.bodyZoneCode as ZonaCorporal,
        severity: condicion.severity as Severidad,
      }));

    const enUso = await this.prisma.routineExercise.findMany({
      where: {
        routineDay: {
          routineVersion: {
            current: true,
            routine: { studentId, state: 'VIGENTE' },
          },
        },
      },
      select: {
        id: true,
        compatibilityState: true,
        compatibilityReason: true,
        exercise: {
          select: {
            muscles: { select: { muscleCode: true } },
            joints: { select: { jointCode: true } },
          },
        },
      },
    });

    const resultado = { ...SIN_CAMBIOS };

    for (const item of enUso) {
      const contraindicacion = evaluarContraindicacion(
        {
          musculos: item.exercise.muscles.map((m) => m.muscleCode),
          articulaciones: item.exercise.joints.map((j) => j.jointCode),
        },
        condiciones,
      );

      const siguiente = proximoEstado(
        {
          estado: item.compatibilityState as EstadoCompatibilidad,
          motivo: item.compatibilityReason,
        },
        contraindicacion,
      );
      if (siguiente === null) {
        continue;
      }

      await this.prisma.routineExercise.update({
        where: { id: item.id },
        data: {
          compatibilityState: siguiente.estado,
          compatibilityReason: siguiente.motivo,
        },
      });

      if (siguiente.estado === 'ADVERTIDO') resultado.advertidos += 1;
      else if (siguiente.estado === 'INCOMPATIBLE')
        resultado.incompatibles += 1;
      else resultado.restaurados += 1;
    }

    return resultado;
  }
}
