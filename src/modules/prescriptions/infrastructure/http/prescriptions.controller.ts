import type { NextFunction, Request, Response } from 'express';

import type { AssignRoutineFromTemplateUseCase } from '../../application/use-cases/assign-routine-from-template.use-case';
import type {
  GetRoutineContentUseCase,
  ListRoutineTemplatesUseCase,
  ListStudentRoutinesUseCase,
} from '../../application/use-cases/read-prescriptions.use-cases';
import type { ReviewRoutineUseCase } from '../../application/use-cases/review-routine.use-case';
import {
  EmptyTemplateError,
  PendingProposalError,
  RoutineNotFoundError,
  RoutineNotReviewableError,
  StudentNotFoundError,
  TemplateFromAnotherGymError,
  TemplateNotFoundError,
} from '../../domain/errors/prescription-errors';
import {
  assignRoutineBodySchema,
  reviewRoutineBodySchema,
  routineParamsSchema,
  studentParamsSchema,
} from './prescriptions.schemas';

function sendPrescriptionError(
  error: unknown,
  res: Response,
  next: NextFunction,
): void {
  if (error instanceof StudentNotFoundError) {
    res.status(404).json({ error: 'student_not_found' });
    return;
  }
  if (error instanceof TemplateNotFoundError) {
    res.status(404).json({ error: 'template_not_found' });
    return;
  }
  if (error instanceof RoutineNotFoundError) {
    res.status(404).json({ error: 'routine_not_found' });
    return;
  }
  if (error instanceof TemplateFromAnotherGymError) {
    res.status(403).json({ error: 'template_from_another_gym' });
    return;
  }
  if (error instanceof EmptyTemplateError) {
    res.status(409).json({ error: 'empty_template' });
    return;
  }
  if (error instanceof PendingProposalError) {
    res.status(409).json({ error: 'pending_proposal' });
    return;
  }
  if (error instanceof RoutineNotReviewableError) {
    res.status(409).json({ error: 'routine_not_reviewable' });
    return;
  }
  next(error);
}

export class PrescriptionsController {
  constructor(
    private readonly listTemplates: ListRoutineTemplatesUseCase,
    private readonly assignFromTemplate: AssignRoutineFromTemplateUseCase,
    private readonly listStudentRoutines: ListStudentRoutinesUseCase,
    private readonly getRoutineContent: GetRoutineContentUseCase,
    private readonly reviewRoutine: ReviewRoutineUseCase,
  ) {}

  /** Plantillas asignables del gimnasio del entrenador. */
  templates = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const templates = await this.listTemplates.execute(req.user?.id ?? '');
      res.status(200).json(templates);
    } catch (error) {
      sendPrescriptionError(error, res, next);
    }
  };

  /** Asigna una plantilla al alumno: la rutina nace en PROPUESTA. */
  assign = async (
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

      const body = assignRoutineBodySchema.safeParse(req.body ?? {});
      if (!body.success) {
        res.status(400).json({
          error: 'invalid_request_body',
          details: body.error.flatten(),
        });
        return;
      }

      const created = await this.assignFromTemplate.execute({
        trainerId: req.user?.id ?? '',
        studentId: params.data.studentId,
        templateId: body.data.templateId,
      });
      res.status(201).json(created);
    } catch (error) {
      sendPrescriptionError(error, res, next);
    }
  };

  /** Rutinas del alumno: la vigente, las propuestas y las archivadas. */
  list = async (
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

      const routines = await this.listStudentRoutines.execute(
        params.data.studentId,
      );
      res.status(200).json(routines);
    } catch (error) {
      sendPrescriptionError(error, res, next);
    }
  };

  /** Días, ejercicios y series de una rutina. */
  content = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const params = routineParamsSchema.safeParse(req.params);
      if (!params.success) {
        res.status(400).json({
          error: 'invalid_request_parameters',
          details: params.error.flatten(),
        });
        return;
      }

      const content = await this.getRoutineContent.execute(params.data);
      res.status(200).json(content);
    } catch (error) {
      sendPrescriptionError(error, res, next);
    }
  };

  /** Aprobación o rechazo de la rutina propuesta. */
  review = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const params = routineParamsSchema.safeParse(req.params);
      if (!params.success) {
        res.status(400).json({
          error: 'invalid_request_parameters',
          details: params.error.flatten(),
        });
        return;
      }

      const body = reviewRoutineBodySchema.safeParse(req.body ?? {});
      if (!body.success) {
        res.status(400).json({
          error: 'invalid_request_body',
          details: body.error.flatten(),
        });
        return;
      }

      const result = await this.reviewRoutine.execute({
        trainerId: req.user?.id ?? '',
        studentId: params.data.studentId,
        routineId: params.data.routineId,
        result: body.data.result,
        observation: body.data.observation,
      });
      res.status(200).json(result);
    } catch (error) {
      sendPrescriptionError(error, res, next);
    }
  };
}
