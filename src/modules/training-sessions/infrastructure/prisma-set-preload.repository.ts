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
          // Un registro simulado no vuelve como valor propuesto: RN-107 lo
          // excluye de toda presentación como real, y precargarlo sería
          // ofrecerle al alumno una carga que nunca levantó.
          simulated: false,
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
      orderBy: [{ session: { occurredOn: 'desc' } }, { position: 'desc' }],
    });

    // Una ejecución por ejercicio: la **última serie de trabajo completada**,
    // que es el supuesto que fijan los criterios de aceptación de T2. Las filas
    // llegan de la sesión más reciente a la más vieja y, dentro de cada sesión,
    // de la última posición a la primera, así que la primera que aparece para
    // un ejercicio es la que corresponde.
    //
    // [SUPUESTO] RF-030 dice «la última ejecución» sin precisar cuál serie
    // cuando la sesión tuvo varias del mismo ejercicio con valores distintos.
    // RN-66 resuelve ese mismo problema para la carga máxima estimada tomando
    // la mayor, y ese criterio evitaría el sesgo a la baja de la última serie,
    // que es habitualmente la más fatigada: con datos del seed, la última da
    // 65 kg x 9 donde la mejor da 65 kg x 10. Se implementa la última porque
    // es lo que fija el criterio de aceptación; queda anotado por si el equipo
    // decide alinearlo con RN-66.
    const ultimas = new Map<string, EjecucionPrevia>();
    for (const row of rows) {
      const exerciseId = row.performedExerciseId ?? row.prescribedExerciseId;
      if (ultimas.has(exerciseId)) {
        continue;
      }

      ultimas.set(exerciseId, {
        exerciseId,
        occurredOn: row.session.occurredOn,
        carga: row.performedLoad === null ? null : row.performedLoad.toNumber(),
        repeticiones: row.performedRepetitions,
      });
    }

    return [...ultimas.values()];
  }
}
