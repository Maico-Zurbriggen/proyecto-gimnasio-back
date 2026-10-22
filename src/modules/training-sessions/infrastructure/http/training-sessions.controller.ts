import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

import {
  AtypicalSeriesError,
  ExerciseNotFoundError,
  RoutineDayNotFoundError,
  RoutineNotActiveError,
  SeriesNotFoundError,
  SeriesOutOfRangeError,
  SessionAccessError,
  SessionAlreadyInProgressError,
  SessionNotFoundError,
  SessionNotInProgressError,
  StudentNotFoundError,
} from '../../domain/errors';
import type {
  AbandonTrainingSessionUseCase,
  ExpireTrainingSessionsUseCase,
  FinishTrainingSessionUseCase,
  GetActiveTrainingSessionUseCase,
  GetTrainingSessionUseCase,
  ListTrainingSessionsUseCase,
  StartTrainingSessionUseCase,
  UpdateSeriesUseCase,
} from '../../application/use-cases/training-sessions.use-cases';
import type {
  TrainingSessionPage,
  TrainingSessionView,
} from '../../application/ports/training-sessions.repository';
import {
  listSessionsQuerySchema,
  seriesParamsSchema,
  sessionParamsSchema,
  startSessionBodySchema,
  studentParamsSchema,
  updateSeriesBodySchema,
} from './training-sessions.schemas';

function toJson(view: TrainingSessionView) {
  return {
    ...view,
    startedAt: view.startedAt.toISOString(),
    completedAt: view.completedAt ? view.completedAt.toISOString() : null,
    lastActivityAt: view.lastActivityAt.toISOString(),
  };
}

function toJsonPage(page: TrainingSessionPage) {
  return {
    ...page,
    items: page.items.map((item) => ({
      ...item,
      startedAt: item.startedAt.toISOString(),
      completedAt: item.completedAt ? item.completedAt.toISOString() : null,
    })),
  };
}

function sendTrainingSessionError(
  error: unknown,
  res: Response,
  next: NextFunction,
): void {
  if (error instanceof SessionAccessError) {
    res.status(403).json({ error: 'forbidden_student_access' });
    return;
  }
  if (error instanceof StudentNotFoundError) {
    res.status(404).json({ error: 'student_not_found' });
    return;
  }
  if (error instanceof RoutineNotActiveError) {
    res.status(409).json({
      error: 'no_active_routine',
      message: 'Necesitás una rutina vigente para iniciar una sesión.',
    });
    return;
  }
  if (error instanceof RoutineDayNotFoundError) {
    res.status(404).json({ error: 'routine_day_not_found' });
    return;
  }
  if (error instanceof SessionAlreadyInProgressError) {
    res.status(409).json({
      error: 'session_already_in_progress',
      message: 'Ya tenés una sesión en curso. Reanudala antes de iniciar otra.',
    });
    return;
  }
  if (error instanceof SessionNotFoundError) {
    res.status(404).json({ error: 'training_session_not_found' });
    return;
  }
  if (error instanceof SessionNotInProgressError) {
    res.status(409).json({ error: 'training_session_not_in_progress' });
    return;
  }
  if (error instanceof SeriesNotFoundError) {
    res.status(404).json({ error: 'series_not_found' });
    return;
  }
  if (error instanceof SeriesOutOfRangeError) {
    res.status(400).json({
      error: 'series_out_of_range',
      message: error.violations
        .map((violation) => violation.message)
        .join('; '),
    });
    return;
  }
  if (error instanceof ExerciseNotFoundError) {
    res.status(404).json({ error: 'exercise_not_found' });
    return;
  }
  if (error instanceof AtypicalSeriesError) {
    res.status(409).json({
      error: 'atypical_series_requires_confirmation',
      message:
        'La carga supera el 150% de tu mejor marca en este ejercicio. Confirmala explícitamente para registrarla.',
      bestHistorical: error.bestHistorical,
      attemptedLoad: error.attemptedLoad,
    });
    return;
  }
  next(error);
}

export class TrainingSessionsController {
  constructor(
    private readonly startSession: StartTrainingSessionUseCase,
    private readonly getActive: GetActiveTrainingSessionUseCase,
    private readonly updateSeries: UpdateSeriesUseCase,
    private readonly finishSession: FinishTrainingSessionUseCase,
    private readonly abandonSession: AbandonTrainingSessionUseCase,
    private readonly expireSessions: ExpireTrainingSessionsUseCase,
    private readonly listSessions: ListTrainingSessionsUseCase,
    private readonly getSession: GetTrainingSessionUseCase,
  ) {}

  start = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const params = studentParamsSchema.safeParse(req.params);
      const body = startSessionBodySchema.safeParse(req.body ?? {});
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
      const session = await this.startSession.execute({
        actor: req.user!,
        studentId: params.data.studentId,
        routineDayId: body.data.routineDayId ?? '',
      });
      res.status(201).json(toJson(session));
    } catch (error) {
      sendTrainingSessionError(error, res, next);
    }
  };

  active = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawStudentId =
        typeof req.params.studentId === 'string'
          ? req.params.studentId
          : req.user!.id;
      const params = studentParamsSchema.safeParse({
        studentId: rawStudentId,
      });
      if (!params.success) {
        res.status(400).json({
          error: 'invalid_request_parameters',
          details: params.error.flatten(),
        });
        return;
      }
      // `GET /training-sessions/active` resuelve el alumno desde la sesión.
      const studentId = params.data.studentId || req.user!.id;
      const session = await this.getActive.execute(req.user!, studentId);
      res.status(200).json(toJson(session));
    } catch (error) {
      sendTrainingSessionError(error, res, next);
    }
  };

  patchSeries = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const params = seriesParamsSchema.safeParse(req.params);
      const body = updateSeriesBodySchema.safeParse(req.body ?? {});
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
      const session = await this.updateSeries.execute({
        actor: req.user!,
        studentId: params.data.studentId,
        sessionId: params.data.sessionId,
        position: params.data.position,
        ...body.data,
      });
      res.status(200).json(toJson(session));
    } catch (error) {
      sendTrainingSessionError(error, res, next);
    }
  };

  finish = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (
        !z
          .object({})
          .strict()
          .safeParse(req.body ?? {}).success
      ) {
        res.status(400).json({ error: 'invalid_request_body' });
        return;
      }
      const params = sessionParamsSchema.safeParse(req.params);
      if (!params.success) {
        res.status(400).json({
          error: 'invalid_request_parameters',
          details: params.error.flatten(),
        });
        return;
      }
      const session = await this.finishSession.execute({
        actor: req.user!,
        studentId: params.data.studentId,
        sessionId: params.data.sessionId,
      });
      res.status(200).json(toJson(session));
    } catch (error) {
      sendTrainingSessionError(error, res, next);
    }
  };

  abandon = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (
        !z
          .object({})
          .strict()
          .safeParse(req.body ?? {}).success
      ) {
        res.status(400).json({ error: 'invalid_request_body' });
        return;
      }
      const params = sessionParamsSchema.safeParse(req.params);
      if (!params.success) {
        res.status(400).json({
          error: 'invalid_request_parameters',
          details: params.error.flatten(),
        });
        return;
      }
      const session = await this.abandonSession.execute({
        actor: req.user!,
        studentId: params.data.studentId,
        sessionId: params.data.sessionId,
      });
      res.status(200).json(toJson(session));
    } catch (error) {
      sendTrainingSessionError(error, res, next);
    }
  };

  expire = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.expireSessions.execute();
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  /** Historial paginado del alumno (RF-035, FL-07 para la reanudación). */
  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const params = studentParamsSchema.safeParse(req.params);
      const query = listSessionsQuerySchema.safeParse(req.query);
      if (!params.success) {
        res.status(400).json({
          error: 'invalid_request_parameters',
          details: params.error.flatten(),
        });
        return;
      }
      if (!query.success) {
        res.status(400).json({
          error: 'invalid_request_query',
          details: query.error.flatten(),
        });
        return;
      }
      const page = await this.listSessions.execute(
        req.user!,
        params.data.studentId,
        query.data,
      );
      res.status(200).json(toJsonPage(page));
    } catch (error) {
      sendTrainingSessionError(error, res, next);
    }
  };

  /** Detalle de una sesión: prescripto congelado junto a lo ejecutado. */
  detail = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const params = sessionParamsSchema.safeParse(req.params);
      if (!params.success) {
        res.status(400).json({
          error: 'invalid_request_parameters',
          details: params.error.flatten(),
        });
        return;
      }
      const session = await this.getSession.execute(
        req.user!,
        params.data.studentId,
        params.data.sessionId,
      );
      res.status(200).json(toJson(session));
    } catch (error) {
      sendTrainingSessionError(error, res, next);
    }
  };
}
