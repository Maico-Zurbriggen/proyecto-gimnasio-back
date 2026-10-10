import type { NextFunction, Request, Response } from 'express';
import { CatalogError } from '../../../exercise-catalog/domain/catalog';

import type { AssignRoutineFromTemplateUseCase } from '../../application/use-cases/assign-routine-from-template.use-case';
import type { CreateManualRoutineUseCase } from '../../application/use-cases/create-manual-routine.use-case';
import type { CreateRoutineTemplateUseCase } from '../../application/use-cases/create-routine-template.use-case';
import type {
  GetRoutineContentUseCase,
  GetRoutineTemplateUseCase,
  ListRoutineTemplatesUseCase,
  ListStudentRoutinesUseCase,
} from '../../application/use-cases/read-prescriptions.use-cases';
import type { ReviewRoutineUseCase } from '../../application/use-cases/review-routine.use-case';
import type {
  SetRoutineTemplateActiveUseCase,
  UpdateRoutineTemplateUseCase,
} from '../../application/use-cases/update-routine-template.use-case';
import {
  EmptyTemplateError,
  PendingProposalError,
  RoutineNotFoundError,
  RoutineNotReviewableError,
  StudentNotFoundError,
  TemplateExerciseNotApprovedError,
  TemplateExerciseNotFoundError,
  TemplateFromAnotherGymError,
  TemplateInactiveError,
  TemplateNotFoundError,
} from '../../domain/errors/prescription-errors';
import {
  assignRoutineBodySchema,
  manualRoutineBodySchema,
  reviewRoutineBodySchema,
  routineParamsSchema,
  studentParamsSchema,
  templateParamsSchema,
  writeTemplateBodySchema,
} from './prescriptions.schemas';

function sendPrescriptionError(
  error: unknown,
  res: Response,
  next: NextFunction,
): void {
  if (error instanceof CatalogError) {
    res.status(error.status).json({ error: error.code });
    return;
  }
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
  if (error instanceof TemplateExerciseNotFoundError) {
    res.status(404).json({ error: 'template_exercise_not_found' });
    return;
  }
  if (error instanceof TemplateExerciseNotApprovedError) {
    res.status(409).json({ error: 'template_exercise_not_approved' });
    return;
  }
  if (error instanceof TemplateInactiveError) {
    res.status(409).json({ error: 'template_inactive' });
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
    private readonly getTemplate: GetRoutineTemplateUseCase,
    private readonly createTemplate: CreateRoutineTemplateUseCase,
    private readonly updateTemplate: UpdateRoutineTemplateUseCase,
    private readonly setTemplateActive: SetRoutineTemplateActiveUseCase,
    private readonly createManualRoutine: CreateManualRoutineUseCase,
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

  /** Detalle editable de una plantilla del gimnasio. */
  templateDetail = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const params = templateParamsSchema.safeParse(req.params);
      if (!params.success) {
        res.status(400).json({
          error: 'invalid_request_parameters',
          details: params.error.flatten(),
        });
        return;
      }
      const detail = await this.getTemplate.execute({
        trainerId: req.user?.id ?? '',
        templateId: params.data.templateId,
      });
      res.status(200).json(detail);
    } catch (error) {
      sendPrescriptionError(error, res, next);
    }
  };

  /** Crea una plantilla privada del gimnasio (RF-019). */
  createTemplateAction = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const body = writeTemplateBodySchema.safeParse(req.body ?? {});
      if (!body.success) {
        res.status(400).json({
          error: 'invalid_request_body',
          details: body.error.flatten(),
        });
        return;
      }
      const created = await this.createTemplate.execute({
        trainerId: req.user?.id ?? '',
        ...body.data,
      });
      res.status(201).json(created);
    } catch (error) {
      sendPrescriptionError(error, res, next);
    }
  };

  /** Reemplaza el contenido de una plantilla activa. */
  updateTemplateAction = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const params = templateParamsSchema.safeParse(req.params);
      const body = writeTemplateBodySchema.safeParse(req.body ?? {});
      if (!params.success) {
        res.status(400).json({
          error: 'invalid_request_parameters',
          details: params.error.flatten(),
        });
        return;
      }
      if (!body.success) {
        res.status(400).json({
          error: 'invalid_request_body',
          details: body.error.flatten(),
        });
        return;
      }
      await this.updateTemplate.execute({
        trainerId: req.user?.id ?? '',
        templateId: params.data.templateId,
        ...body.data,
      });
      res.status(200).json({ templateId: params.data.templateId });
    } catch (error) {
      sendPrescriptionError(error, res, next);
    }
  };

  /** Desactiva una plantilla del gimnasio, sin borrarla. Idempotente. */
  deactivateTemplate = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const params = templateParamsSchema.safeParse(req.params);
      if (!params.success) {
        res.status(400).json({
          error: 'invalid_request_parameters',
          details: params.error.flatten(),
        });
        return;
      }
      const result = await this.setTemplateActive.execute({
        trainerId: req.user?.id ?? '',
        templateId: params.data.templateId,
        active: false,
      });
      res.status(200).json({ templateId: params.data.templateId, ...result });
    } catch (error) {
      sendPrescriptionError(error, res, next);
    }
  };

  /** Reactiva una plantilla desactivada del gimnasio. Idempotente. */
  activateTemplate = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const params = templateParamsSchema.safeParse(req.params);
      if (!params.success) {
        res.status(400).json({
          error: 'invalid_request_parameters',
          details: params.error.flatten(),
        });
        return;
      }
      const result = await this.setTemplateActive.execute({
        trainerId: req.user?.id ?? '',
        templateId: params.data.templateId,
        active: true,
      });
      res.status(200).json({ templateId: params.data.templateId, ...result });
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

  /** Rutina manual del entrenador para su alumno: nace en PROPUESTA. */
  createManual = async (
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

      const body = manualRoutineBodySchema.safeParse(req.body ?? {});
      if (!body.success) {
        res.status(400).json({
          error: 'invalid_request_body',
          details: body.error.flatten(),
        });
        return;
      }

      const created = await this.createManualRoutine.execute({
        trainerId: req.user?.id ?? '',
        studentId: params.data.studentId,
        routineType: body.data.routineType,
        days: body.data.days,
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
        reviewToken: body.data.reviewToken,
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
