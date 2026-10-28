import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

import {
  ListOwnNoticesUseCase,
  MarkNoticeReadUseCase,
  NoticeNotFoundError,
} from '../../application/use-cases/notices.use-cases';

const paramsSchema = z.object({ noticeId: z.string().uuid() });

export class NoticesController {
  constructor(
    private readonly listOwn: ListOwnNoticesUseCase,
    private readonly markRead: MarkNoticeReadUseCase,
  ) {}

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(200).json(await this.listOwn.execute(req.user!.id));
    } catch (error) {
      next(error);
    }
  };

  read = async (req: Request, res: Response, next: NextFunction) => {
    const params = paramsSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: 'invalid_request_parameters' });
      return;
    }
    try {
      res
        .status(200)
        .json(await this.markRead.execute(req.user!.id, params.data.noticeId));
    } catch (error) {
      if (error instanceof NoticeNotFoundError) {
        res.status(404).json({ error: 'notice_not_found' });
        return;
      }
      next(error);
    }
  };
}
