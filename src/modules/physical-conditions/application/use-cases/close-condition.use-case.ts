import type { Clock } from '../../../routines/application/ports/clock';
import {
  ConditionNotClosableError,
  ConditionNotFoundError,
} from '../../domain/errors/condition-errors';
import { puedeCerrarse } from '../../domain/services/condition-validity';
import {
  toConditionDto,
  type PhysicalConditionDto,
} from '../dto/condition.dto';
import type { PhysicalConditionsRepository } from '../ports/physical-conditions.repository';

export interface CloseConditionInput {
  studentId: string;
  conditionId: string;
  /** Fecha de cierre en `YYYY-MM-DD`; por defecto, hoy. */
  endsOn?: string;
}

/**
 * Cierre de una condición física (HU11 - T2).
 *
 * Cerrarla no borra nada: el período queda registrado y la condición sigue
 * siendo consultable, porque es lo que explica una prescripción pasada (RN-11:
 * una condición cerrada deja de restringir **desde su fecha de fin**, sin efecto
 * retroactivo).
 */
export class CloseConditionUseCase {
  constructor(
    private readonly conditions: PhysicalConditionsRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: CloseConditionInput): Promise<PhysicalConditionDto> {
    const record = await this.conditions.findById(
      input.conditionId,
      input.studentId,
    );
    if (!record) {
      throw new ConditionNotFoundError();
    }

    const now = this.clock.now();
    const endsOn = input.endsOn
      ? new Date(`${input.endsOn}T00:00:00.000Z`)
      : new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
        );

    if (!puedeCerrarse(record, endsOn)) {
      throw new ConditionNotClosableError();
    }

    const closed = await this.conditions.close(record.id, endsOn);
    return toConditionDto(closed, now);
  }
}
