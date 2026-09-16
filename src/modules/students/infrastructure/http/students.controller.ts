import type { NextFunction, Request, Response } from 'express';

import type { GetStudentStatusUseCase } from '../../application/use-cases/get-student-status.use-case';
import type { ListTrainerStudentsUseCase } from '../../application/use-cases/list-trainer-students.use-case';
import type { UnlockStudentUseCase } from '../../application/use-cases/unlock-student.use-case';
import {
  StudentNotBlockedError,
  StudentNotFoundError,
  TrainerNotAssignedError,
} from '../../domain/errors/student-errors';
import { studentParamsSchema, unlockBodySchema } from './students.schemas';

function sendStudentError(
  error: unknown,
  res: Response,
  next: NextFunction,
): void {
  if (error instanceof TrainerNotAssignedError) {
    res.status(403).json({ error: 'forbidden_not_assigned' });
    return;
  }
  if (error instanceof StudentNotFoundError) {
    res.status(404).json({ error: 'student_not_found' });
    return;
  }
  if (error instanceof StudentNotBlockedError) {
    res.status(409).json({ error: 'student_not_blocked' });
    return;
  }
  next(error);
}

export class StudentsController {
  constructor(
    private readonly listTrainerStudents: ListTrainerStudentsUseCase,
    private readonly getStudentStatus: GetStudentStatusUseCase,
    private readonly unlockStudent: UnlockStudentUseCase,
  ) {}

  listMine = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const students = await this.listTrainerStudents.execute({
        trainerId: req.user?.id ?? '',
      });
      res.status(200).json(students);
    } catch (error) {
      sendStudentError(error, res, next);
    }
  };

  getStatus = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const params = studentParamsSchema.safeParse(req.params);
      if (!params.success) {
        res.status(400).json({
          error: 'invalid_request_parameters',
          details: params.error.flatten(),
        });
        return;
      }

      const status = await this.getStudentStatus.execute({
        trainerId: req.user?.id ?? '',
        studentId: params.data.studentId,
      });
      res.status(200).json(status);
    } catch (error) {
      sendStudentError(error, res, next);
    }
  };

  unlock = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const params = studentParamsSchema.safeParse(req.params);
      if (!params.success) {
        res.status(400).json({
          error: 'invalid_request_parameters',
          details: params.error.flatten(),
        });
        return;
      }

      const rawBody: unknown = req.body ?? {};
      const hasMeasurement =
        typeof rawBody === 'object' &&
        rawBody !== null &&
        'weightKg' in rawBody &&
        'heightCm' in rawBody;
      // HU05, Esc. 2: sin la medición adeudada el desbloqueo se rechaza.
      if (!hasMeasurement) {
        res.status(400).json({ error: 'pending_measurement_required' });
        return;
      }

      const body = unlockBodySchema.safeParse(rawBody);
      if (!body.success) {
        res.status(400).json({
          error: 'invalid_request_body',
          details: body.error.flatten(),
        });
        return;
      }

      const status = await this.unlockStudent.execute({
        trainerId: req.user?.id ?? '',
        studentId: params.data.studentId,
        weightKg: body.data.weightKg,
        heightCm: body.data.heightCm,
      });
      res.status(200).json(status);
    } catch (error) {
      sendStudentError(error, res, next);
    }
  };
}
