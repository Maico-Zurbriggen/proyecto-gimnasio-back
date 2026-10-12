import type { NextFunction, Request, Response } from 'express';

import type {
  ListGymsUseCase,
  ListTimezonesUseCase,
  ReissueBootstrapInvitationUseCase,
} from '../../application/use-cases/manage-gyms.use-cases';
import type { ProvisionGymUseCase } from '../../application/use-cases/provision-gym.use-case';
import {
  BootstrapInvitationAlreadyUsedError,
  GymNameTakenError,
  GymNotFoundError,
  InvalidTimezoneError,
  InvitationDeliveryError,
} from '../../domain/errors/gym-errors';
import { gymParamsSchema, provisionGymBodySchema } from './gyms.schemas';

function sendGymError(error: unknown, res: Response, next: NextFunction): void {
  if (error instanceof InvalidTimezoneError) {
    res.status(400).json({
      error: 'invalid_request_body',
      fields: { zonaHoraria: [error.message] },
    });
    return;
  }
  if (error instanceof GymNameTakenError) {
    res.status(409).json({
      error: 'gym_name_taken',
      message: error.message,
      fields: { nombre: [error.message] },
    });
    return;
  }
  if (error instanceof GymNotFoundError) {
    res.status(404).json({ error: 'gym_not_found', message: error.message });
    return;
  }
  if (error instanceof BootstrapInvitationAlreadyUsedError) {
    res.status(409).json({
      error: 'bootstrap_invitation_already_used',
      message: error.message,
    });
    return;
  }
  if (error instanceof InvitationDeliveryError) {
    res.status(502).json({
      error: 'invitation_delivery_failed',
      message: error.message,
    });
    return;
  }
  next(error);
}

export class GymsController {
  constructor(
    private readonly provisionGym: ProvisionGymUseCase,
    private readonly listGyms: ListGymsUseCase,
    private readonly reissueInvitation: ReissueBootstrapInvitationUseCase,
    private readonly listTimezones: ListTimezonesUseCase,
  ) {}

  /** HU13 - T1: alta atómica del gimnasio y su primer administrador. */
  create = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const body = provisionGymBodySchema.safeParse(req.body ?? {});
      if (!body.success) {
        res.status(400).json({
          error: 'invalid_request_body',
          fields: body.error.flatten().fieldErrors,
        });
        return;
      }

      const created = await this.provisionGym.execute({
        actorUserId: req.user?.id ?? '',
        name: body.data.nombre,
        timezone: body.data.zonaHoraria,
        adminEmail: body.data.correoAdministrador,
      });
      res.status(201).json(created);
    } catch (error) {
      sendGymError(error, res, next);
    }
  };

  /** HU13 - T2: listado de gimnasios afiliados. */
  list = async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      res.status(200).json(await this.listGyms.execute());
    } catch (error) {
      sendGymError(error, res, next);
    }
  };

  /** HU13 - T2: reenvío de la invitación del primer administrador. */
  reissue = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const params = gymParamsSchema.safeParse(req.params);
      if (!params.success) {
        res.status(404).json({ error: 'gym_not_found' });
        return;
      }
      const result = await this.reissueInvitation.execute({
        actorUserId: req.user?.id ?? '',
        gymId: params.data.gymId,
      });
      res.status(201).json(result);
    } catch (error) {
      sendGymError(error, res, next);
    }
  };

  /** Zonas horarias válidas para el selector. */
  timezones = async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      res.status(200).json(await this.listTimezones.execute());
    } catch (error) {
      sendGymError(error, res, next);
    }
  };
}
