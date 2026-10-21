import type { PrismaClient } from '@prisma/client';

import { isUuid } from '../../../shared/types/uuid';
import type { SetPreloadRepository } from '../application/set-preload.use-cases';
import type { EjecucionPrevia, SeriePrescripta } from '../domain/set-preload';

export class PrismaSetPreloadRepository implements SetPreloadRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findPrescribedSetsOfDay(
    studentId: string,
    routineDayId: string,
  ): Promise<SeriePrescripta[] | null> {
    if (!isUuid(studentId) || !isUuid(routineDayId)) {
      return null;
    }

    // El día tiene que pertenecer a la versión vigente de una rutina vigente
    // del alumno: RN-51 sólo admite abrir una sesión sobre la rutina VIGENTE.
    const day = await this.prisma.routineDay.findFirst({
      where: {
        id: routineDayId,
        routineVersion: {
          // `current` marca la versión vigente de la rutina; RN-51 sólo admite
          // abrir una sesión en tiempo real sobre la rutina VIGENTE.
          current: true,
          routine: { studentId, state: 'VIGENTE' },
        },
      },
      select: {
        exercises: {
          orderBy: { position: 'asc' },
          select: {
            position: true,
            exerciseId: true,
            sets: {
              orderBy: { position: 'asc' },
              select: {
                position: true,
                minRepetitions: true,
                maxRepetitions: true,
                suggestedLoad: true,
                warmup: true,
              },
            },
          },
        },
      },
    });

    if (day === null) {
      return null;
    }

    // Las series se numeran de corrido en el orden de ejecución del día, igual
    // que `SessionSetRecord.position`, que es la clave con la que RN-60
    // identifica un envío.
    let position = 0;
    return day.exercises.flatMap((ejercicio) =>
      ejercicio.sets.map((serie) => {
        position += 1;
        return {
          position,
          exerciseId: ejercicio.exerciseId,
          repeticionesMinimas: serie.minRepetitions,
          repeticionesMaximas: serie.maxRepetitions,
          cargaSugerida:
            serie.suggestedLoad === null
              ? null
              : serie.suggestedLoad.toNumber(),
          warmup: serie.warmup,
        };
      }),
    );
  }

  async findLastExecutions(
    studentId: string,
    exerciseIds: string[],
  ): Promise<EjecucionPrevia[]> {
    const ids = exerciseIds.filter((id) => isUuid(id));
    if (!isUuid(studentId) || ids.length === 0) {
      return [];
    }

    const rows = await this.prisma.sessionSetRecord.findMany({
      where: {
        completed: true,
        warmup: false,
        session: {
          studentId,
          state: { in: ['COMPLETADA', 'BLOQUEADA'] },
        },
        // RN-56: una serie sustituida se imputa al ejercicio *ejecutado*. El
        // historial del press no puede contener la carga de la sustitución que
        // se hizo en su lugar, así que se compara contra el ejecutado cuando
        // existe y contra el prescripto cuando no hubo sustitución.
        OR: [
          { performedExerciseId: { in: ids } },
          { performedExerciseId: null, prescribedExerciseId: { in: ids } },
        ],
      },
      select: {
        prescribedExerciseId: true,
        performedExerciseId: true,
        performedLoad: true,
        performedRepetitions: true,
        session: { select: { occurredOn: true } },
      },
      orderBy: [{ session: { occurredOn: 'desc' } }, { position: 'asc' }],
    });

    // Una ejecución por ejercicio: la de la sesión más reciente. Esa sesión
    // suele tener varias series del mismo ejercicio con valores distintos, y
    // de ellas se toma la de mayor carga, siguiendo el criterio que RN-66 ya
    // fija para el mismo problema en la carga máxima estimada. Tomar «la
    // última serie» sería arbitrario y además sesga a la baja: la última es
    // habitualmente la más fatigada.
    const ultimas = new Map<string, EjecucionPrevia>();
    for (const row of rows) {
      const exerciseId = row.performedExerciseId ?? row.prescribedExerciseId;
      const carga =
        row.performedLoad === null ? null : row.performedLoad.toNumber();
      const previa = ultimas.get(exerciseId);

      // Las filas llegan de la sesión más reciente a la más vieja, así que una
      // vez fijada la fecha sólo compiten las series de esa misma sesión.
      if (previa !== undefined) {
        const esOtraSesion =
          previa.occurredOn.getTime() !== row.session.occurredOn.getTime();
        if (esOtraSesion || carga === null || (previa.carga ?? 0) >= carga) {
          continue;
        }
      }

      ultimas.set(exerciseId, {
        exerciseId,
        occurredOn: row.session.occurredOn,
        carga,
        repeticiones: row.performedRepetitions,
      });
    }

    return [...ultimas.values()];
  }
}
