import {
  RoutineNotActiveError,
  RoutineNotFoundError,
} from '../../domain/errors/routine-errors';
import { calculateRenewalNotice } from '../../domain/services/routine-renewal';
import type { ActiveRoutineResponseDto } from '../dto/active-routine.dto';
import type { Clock } from '../ports/clock';
import type { RoutinesRepository } from '../ports/routines.repository';

export interface GetActiveRoutineQuery {
  studentId: string;
}

export class GetActiveRoutineUseCase {
  constructor(
    private readonly routinesRepository: RoutinesRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    query: GetActiveRoutineQuery,
  ): Promise<ActiveRoutineResponseDto> {
    const routine = await this.routinesRepository.findActiveByStudentId(
      query.studentId,
    );

    if (!routine) {
      throw new RoutineNotFoundError(
        `Active routine not found for student ${query.studentId}`,
      );
    }

    if (!routine.isVigente()) {
      throw new RoutineNotActiveError(
        `Routine ${routine.id} is not in VIGENTE state`,
      );
    }

    const currentDate = this.clock.now();
    const notice = calculateRenewalNotice(routine.startDate, currentDate);

    return {
      id: routine.id,
      studentId: routine.studentId,
      routineType: routine.routineType,
      targetWeeklyFrequency: routine.targetWeeklyFrequency,
      state: routine.state,
      origin: routine.origin,
      startDate: routine.startDate.toISOString(),
      renewalDate: notice.fechaVencimiento.toISOString(),
      diasRestantesParaRenovacion: notice.diasRestantes,
      avisoRenovacion: {
        estado: notice.estado,
        diasRestantes: notice.diasRestantes,
        fechaVencimiento: notice.fechaVencimiento.toISOString(),
      },
      currentVersionNumber: routine.currentVersionNumber,
    };
  }
}
