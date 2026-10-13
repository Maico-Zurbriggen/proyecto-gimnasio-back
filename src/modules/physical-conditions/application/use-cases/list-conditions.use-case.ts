import type { Clock } from '../../../routines/application/ports/clock';
import {
  toConditionDto,
  type PhysicalConditionDto,
} from '../dto/condition.dto';
import type { PhysicalConditionsRepository } from '../ports/physical-conditions.repository';

export interface ListConditionsInput {
  studentId: string;
  /** `YYYY-MM-DD`: devuelve sólo las que regían en esa fecha. */
  vigentesEn?: string;
}

/**
 * Historial de condiciones con su vigencia (HU11 - T2).
 *
 * Devuelve el historial completo, cada condición marcada como vigente o no. Con
 * `vigentesEn` responde **qué regía en una fecha dada**, que es lo que exige
 * RF-085 para auditar una prescripción pasada.
 */
export class ListConditionsUseCase {
  constructor(
    private readonly conditions: PhysicalConditionsRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: ListConditionsInput): Promise<PhysicalConditionDto[]> {
    const records = await this.conditions.listByStudent(input.studentId);
    const now = this.clock.now();

    const referencia = input.vigentesEn
      ? new Date(`${input.vigentesEn}T00:00:00.000Z`)
      : now;

    const dtos = records.map((record) => toConditionDto(record, referencia));

    return input.vigentesEn ? dtos.filter((dto) => dto.vigente) : dtos;
  }
}
