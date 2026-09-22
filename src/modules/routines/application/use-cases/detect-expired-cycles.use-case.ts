import { hayMedicionEnElCiclo } from '../../domain/services/cycle-renewal-data';
import {
  calculateDaysUntilRenewal,
  calculateRenewalDate,
  duracionCicloDias,
  isCycleExpired,
} from '../../domain/services/routine-renewal';
import type {
  DetectExpiredCyclesResultDto,
  ExpiredCycleDto,
} from '../dto/expired-cycle.dto';
import type { Clock } from '../ports/clock';
import type { RoutinesRepository } from '../ports/routines.repository';

/**
 * Job periódico de renovación (HU03 - T1).
 *
 * Detecta las rutinas vigentes cuyo ciclo cumplió su duración y devuelve, para
 * cada una, los insumos que las tareas siguientes necesitan: si hubo medición
 * nueva en el ciclo (HU03 - T2) y las propuestas anteriores (HU03 - T3/T4).
 *
 * Es un job separado del diagnóstico quincenal de RN-78, con el que comparte el
 * motor de dominio (`routine-renewal` y `cycle-renewal-data`). No persiste nada:
 * la generación de propuestas (HU03 - T6) y el bloqueo por faltas (HU03 - T5)
 * son tareas aparte que consumen este resultado.
 */
export class DetectExpiredCyclesUseCase {
  constructor(
    private readonly routinesRepository: RoutinesRepository,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<DetectExpiredCyclesResultDto> {
    const now = this.clock.now();
    const candidates =
      await this.routinesRepository.findVigentesForRenewalCheck();

    const expiredCycles: ExpiredCycleDto[] = [];

    for (const candidate of candidates) {
      const { routine } = candidate;
      const cicloDias = duracionCicloDias(routine.routineType);

      if (!isCycleExpired(routine.startDate, now, cicloDias)) {
        continue;
      }

      const dueDate = calculateRenewalDate(routine.startDate, cicloDias);
      const daysUntilRenewal = calculateDaysUntilRenewal(dueDate, now);
      const measurements = candidate.measurementDates.map((measuredOn) => ({
        measuredOn,
      }));

      expiredCycles.push({
        routineId: routine.id,
        studentId: routine.studentId,
        routineType: routine.routineType,
        cycleStart: routine.startDate.toISOString(),
        dueDate: dueDate.toISOString(),
        daysOverdue: Math.max(0, -daysUntilRenewal),
        measurementDates: candidate.measurementDates.map((date) =>
          date.toISOString(),
        ),
        hasNewMeasurement: hayMedicionEnElCiclo(
          measurements,
          routine.startDate,
        ),
        previousProposalDates: candidate.previousProposalDates.map((date) =>
          date.toISOString(),
        ),
      });
    }

    expiredCycles.sort(compareByDueDateThenRoutine);

    return {
      evaluatedAt: now.toISOString(),
      expiredCycles,
    };
  }
}

function compareByDueDateThenRoutine(
  left: ExpiredCycleDto,
  right: ExpiredCycleDto,
): number {
  if (left.dueDate !== right.dueDate) {
    return left.dueDate < right.dueDate ? -1 : 1;
  }

  if (left.routineId === right.routineId) {
    return 0;
  }

  return left.routineId < right.routineId ? -1 : 1;
}
