import type { NextFunction, Request, Response } from 'express';

import type { RecordMeasurementUseCase } from '../../application/use-cases/record-measurement.use-case';
import {
  MeasurementOutOfRangeError,
  StudentNotFoundError,
} from '../../domain/errors/measurement-errors';
import {
  measurementParamsSchema,
  recordMeasurementBodySchema,
} from './measurements.schemas';

function sendMeasurementError(
  error: unknown,
  res: Response,
  next: NextFunction,
): void {
  // Esc. 1.1 y 1.2: el mensaje nombra el rango admitido y no se persiste nada.
  if (error instanceof MeasurementOutOfRangeError) {
    res.status(400).json({
      error: 'measurement_out_of_range',
      violations: error.violations.map((violation) => ({
        field: violation.campo,
        value: violation.valor,
        min: violation.min,
        max: violation.max,
        unit: violation.unidad,
        message: violation.mensaje,
      })),
    });
    return;
  }
  if (error instanceof StudentNotFoundError) {
    res.status(404).json({ error: 'student_not_found' });
    return;
  }
  next(error);
}

export class MeasurementsController {
  constructor(private readonly recordMeasurement: RecordMeasurementUseCase) {}

  record = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const params = measurementParamsSchema.safeParse(req.params);
      if (!params.success) {
        res.status(400).json({
          error: 'invalid_request_parameters',
          details: params.error.flatten(),
        });
        return;
      }

      const body = recordMeasurementBodySchema.safeParse(req.body ?? {});
      if (!body.success) {
        res.status(400).json({
          error: 'invalid_request_body',
          details: body.error.flatten(),
        });
        return;
      }

      const measurement = await this.recordMeasurement.execute({
        studentId: params.data.studentId,
        weightKg: body.data.weightKg,
        heightCm: body.data.heightCm,
      });

      res.status(201).json(measurement);
    } catch (error) {
      sendMeasurementError(error, res, next);
    }
  };
}
