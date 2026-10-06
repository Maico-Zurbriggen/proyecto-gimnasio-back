import type { Clock } from '../../../routines/application/ports/clock';
import {
  FutureStartDateError,
  InvalidBodyZoneError,
  StudentNotFoundError,
} from '../../domain/errors/condition-errors';
import {
  esZonaCorporalValida,
  type Severidad,
} from '../../domain/services/body-zones';
import { fechaDeInicioAdmisible } from '../../domain/services/condition-validity';
import type { PhysicalConditionDto } from '../dto/condition.dto';
import { toConditionDto } from '../dto/condition.dto';
import type { PhysicalConditionsRepository } from '../ports/physical-conditions.repository';

export interface DeclareConditionInput {
  studentId: string;
  bodyZoneCode: string;
  severity: Severidad;
  description?: string | null;
  /** Fecha de inicio en `YYYY-MM-DD`; por defecto, hoy. */
  startsOn?: string;
}

/** Interpreta `YYYY-MM-DD` como un día en UTC, sin corrimiento por zona horaria. */
function parseDia(valor: string): Date {
  return new Date(`${valor}T00:00:00.000Z`);
}

function hoyUtc(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/**
 * Declaración de una condición física (HU11 - T1).
 *
 * Zona corporal y severidad son tipadas: la zona se valida contra la enumeración
 * cerrada de D2 y la severidad contra las tres de D2/§4.6. La descripción libre
 * se guarda pero **no participa de ningún cálculo** (RN-10a).
 *
 * Varias condiciones pueden estar vigentes a la vez (RN-10): declarar una nueva
 * no cierra las anteriores.
 */
export class DeclareConditionUseCase {
  constructor(
    private readonly conditions: PhysicalConditionsRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: DeclareConditionInput): Promise<PhysicalConditionDto> {
    if (!esZonaCorporalValida(input.bodyZoneCode)) {
      throw new InvalidBodyZoneError();
    }

    const now = this.clock.now();
    const startsOn = input.startsOn ? parseDia(input.startsOn) : hoyUtc(now);

    if (!fechaDeInicioAdmisible(startsOn, now)) {
      throw new FutureStartDateError();
    }

    const record = await this.conditions.declare({
      studentId: input.studentId,
      bodyZoneCode: input.bodyZoneCode,
      severity: input.severity,
      description: input.description?.trim() || null,
      startsOn,
    });

    if (!record) {
      throw new StudentNotFoundError();
    }

    return toConditionDto(record, now);
  }
}
