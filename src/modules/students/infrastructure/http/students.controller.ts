import type { NextFunction, Request, Response } from 'express';

import type { GetStudentStatusUseCase } from '../../application/use-cases/get-student-status.use-case';
import type { GetOwnMeasurementBlockUseCase } from '../../application/use-cases/get-own-measurement-block.use-case';
import type { ListTrainerStudentsUseCase } from '../../application/use-cases/list-trainer-students.use-case';
import type { UnlockStudentUseCase } from '../../application/use-cases/unlock-student.use-case';
import {
  MeasurementBlockAlreadyResolvedError,
  PendingMeasurementRequiredError,
  StudentNotBlockedError,
  StudentNotFoundError,
  TrainerNotAssignedError,
} from '../../domain/errors/student-errors';
import { studentParamsSchema } from './students.schemas';

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
  if (error instanceof PendingMeasurementRequiredError) {
    res.status(409).json({ error: 'pending_measurement_required' });
    return;
  }
  if (error instanceof MeasurementBlockAlreadyResolvedError) {
    res.status(409).json({ error: 'measurement_block_already_resolved' });
    return;
  }
  next(error);
}

export class StudentsController {
  constructor(
    private readonly listTrainerStudents: ListTrainerStudentsUseCase,
    private readonly getStudentStatus: GetStudentStatusUseCase,
    private readonly getOwnMeasurementBlock: GetOwnMeasurementBlockUseCase,
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

  getOwnBlock = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const status = await this.getOwnMeasurementBlock.execute(
        req.user?.id ?? '',
      );
      res.status(200).json(status);
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

      const status = await this.unlockStudent.execute({
        trainerId: req.user?.id ?? '',
        studentId: params.data.studentId,
      });
      res.status(200).json(status);
    } catch (error) {
      sendStudentError(error, res, next);
    }
  };
}
