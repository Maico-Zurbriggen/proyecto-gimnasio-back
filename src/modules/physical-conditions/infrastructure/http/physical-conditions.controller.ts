import type { NextFunction, Request, Response } from 'express';

import type { CloseConditionUseCase } from '../../application/use-cases/close-condition.use-case';
import type { ConditionsDeclarationUseCases } from '../../application/use-cases/conditions-declaration.use-cases';
import type { DeclareConditionUseCase } from '../../application/use-cases/declare-condition.use-case';
import type { ListConditionsUseCase } from '../../application/use-cases/list-conditions.use-case';
import {
  ActiveConditionsExistError,
  ConditionNotClosableError,
  ConditionNotFoundError,
  FutureStartDateError,
  HealthConsentRequiredError,
  InvalidBodyZoneError,
  StudentNotFoundError,
} from '../../domain/errors/condition-errors';
import {
  closeConditionBodySchema,
  conditionParamsSchema,
  declareConditionBodySchema,
  listConditionsQuerySchema,
  studentParamSchema,
} from './physical-conditions.schemas';

function sendConditionError(
  error: unknown,
  res: Response,
  next: NextFunction,
): void {
  if (error instanceof HealthConsentRequiredError) {
    res.status(403).json({
      error: 'health_data_consent_required',
      message: error.message,
    });
    return;
  }
  if (error instanceof ActiveConditionsExistError) {
    res
      .status(409)
      .json({ error: 'active_conditions_exist', message: error.message });
    return;
  }
  if (error instanceof InvalidBodyZoneError) {
    res
      .status(400)
      .json({ error: 'invalid_body_zone', message: error.message });
    return;
  }
  if (error instanceof FutureStartDateError) {
    res
      .status(400)
      .json({ error: 'future_start_date', message: error.message });
    return;
  }
  if (error instanceof ConditionNotClosableError) {
    res
      .status(409)
      .json({ error: 'condition_not_closable', message: error.message });
    return;
  }
  if (error instanceof ConditionNotFoundError) {
    res.status(404).json({ error: 'condition_not_found' });
    return;
  }
  if (error instanceof StudentNotFoundError) {
    res.status(404).json({ error: 'student_not_found' });
    return;
  }
  next(error);
}

export class PhysicalConditionsController {
  constructor(
    private readonly declareCondition: DeclareConditionUseCase,
    private readonly listConditions: ListConditionsUseCase,
    private readonly closeCondition: CloseConditionUseCase,
    private readonly declaration: ConditionsDeclarationUseCases,
  ) {}

  /** HU11 - T3: consentimiento y declaración de "ninguna" para la pantalla. */
  status = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const params = studentParamSchema.safeParse(req.params);
      if (!params.success) {
        res.status(404).json({ error: 'student_not_found' });
        return;
      }
      res
        .status(200)
        .json(await this.declaration.status(params.data.studentId));
    } catch (error) {
      sendConditionError(error, res, next);
    }
  };

  /** HU11 - criterio 8: declarar expresamente que no hay ninguna condición. */
  declareNone = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const params = studentParamSchema.safeParse(req.params);
      if (!params.success) {
        res.status(404).json({ error: 'student_not_found' });
        return;
      }
      res
        .status(200)
        .json(await this.declaration.declareNone(params.data.studentId));
    } catch (error) {
      sendConditionError(error, res, next);
    }
  };

  /** HU11 - T1: declarar una condición con zona corporal y severidad. */
  declare = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const params = studentParamSchema.safeParse(req.params);
      if (!params.success) {
        res.status(400).json({
          error: 'invalid_request_parameters',
          details: params.error.flatten(),
        });
        return;
      }

      const body = declareConditionBodySchema.safeParse(req.body ?? {});
      if (!body.success) {
        res.status(400).json({
          error: 'invalid_request_body',
          details: body.error.flatten(),
        });
        return;
      }

      const condition = await this.declareCondition.execute({
        studentId: params.data.studentId,
        bodyZoneCode: body.data.bodyZoneCode,
        severity: body.data.severity,
        description: body.data.description ?? null,
        startsOn: body.data.startsOn,
      });

      res.status(201).json(condition);
    } catch (error) {
      sendConditionError(error, res, next);
    }
  };

  /** HU11 - T2: historial de condiciones, con su vigencia. */
  list = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const params = studentParamSchema.safeParse(req.params);
      if (!params.success) {
        res.status(400).json({
          error: 'invalid_request_parameters',
          details: params.error.flatten(),
        });
        return;
      }

      const query = listConditionsQuerySchema.safeParse(req.query ?? {});
      if (!query.success) {
        res.status(400).json({
          error: 'invalid_request_query',
          details: query.error.flatten(),
        });
        return;
      }

      const conditions = await this.listConditions.execute({
        studentId: params.data.studentId,
        vigentesEn: query.data.vigentesEn,
      });

      res.status(200).json(conditions);
    } catch (error) {
      sendConditionError(error, res, next);
    }
  };

  /** HU11 - T2: cerrar una condición vigente. */
  close = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const params = conditionParamsSchema.safeParse(req.params);
      if (!params.success) {
        res.status(400).json({
          error: 'invalid_request_parameters',
          details: params.error.flatten(),
        });
        return;
      }

      const body = closeConditionBodySchema.safeParse(req.body ?? {});
      if (!body.success) {
        res.status(400).json({
          error: 'invalid_request_body',
          details: body.error.flatten(),
        });
        return;
      }

      const condition = await this.closeCondition.execute({
        studentId: params.data.studentId,
        conditionId: params.data.conditionId,
        endsOn: body.data.endsOn,
      });

      res.status(200).json(condition);
    } catch (error) {
      sendConditionError(error, res, next);
    }
  };
}
