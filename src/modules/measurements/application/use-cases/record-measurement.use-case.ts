import type { Clock } from '../../../routines/application/ports/clock';
import {
  MeasurementOutOfRangeError,
  StudentNotFoundError,
} from '../../domain/errors/measurement-errors';
import { validarMedidas } from '../../domain/services/measurement-ranges';
import type { MeasurementResponseDto } from '../dto/measurement.dto';
import type { MeasurementsRepository } from '../ports/measurements.repository';

export interface RecordMeasurementInput {
  studentId: string;
  weightKg: number;
  heightCm: number;
}

/**
 * Registro de peso y altura desde el aviso de renovación (HU02 - T1).
 *
 * La medición se imputa al día de hoy en la zona horaria de referencia y sustituye
 * cualquier previa del mismo tipo y fecha (Esc. 1). Si algún valor está fuera de
 * rango no se persiste **nada** (Esc. 1.1 y 1.2): la validación corre antes de
 * tocar la base.
 *
 * [SUPUESTO] El Escenario 2 pide que el registro «quede asociado a esa renovación».
 * `body_measurements` no tiene columna hacia la propuesta, así que la asociación es
 * implícita: la medición cae dentro del ciclo abierto, que es como ya la interpreta
 * `hayMedicionEnElCiclo` (HU03 - T2). Si el vínculo explícito se vuelve necesario,
 * requiere una migración.
 */
export class RecordMeasurementUseCase {
  constructor(
    private readonly measurements: MeasurementsRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: RecordMeasurementInput,
  ): Promise<MeasurementResponseDto> {
    const violations = validarMedidas(input.weightKg, input.heightCm);
    if (violations.length > 0) {
      throw new MeasurementOutOfRangeError(violations);
    }

    const now = this.clock.now();
    const measuredOn = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );

    const record = await this.measurements.record({
      studentId: input.studentId,
      weightKg: input.weightKg,
      heightCm: input.heightCm,
      measuredOn,
    });

    if (!record) {
      throw new StudentNotFoundError();
    }

    return {
      studentId: record.studentId,
      weightKg: record.weightKg,
      heightCm: record.heightCm,
      measuredOn: record.measuredOn.toISOString().slice(0, 10),
      replacedPrevious: record.replacedPrevious,
    };
  }
}
