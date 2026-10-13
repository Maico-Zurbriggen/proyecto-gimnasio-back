import type { NextFunction, Request, Response } from 'express';

import { hashearToken } from '../../../auth/domain/services/session-token';
import type { Clock } from '../../../routines/application/ports/clock';
import type { AttemptLimiter } from '../../application/ports/attempt-limiter';

/**
 * Limita los intentos por origen (HU06 - criterio 19, RNF-17): el sexto en un
 * minuto recibe 429. El origen es la IP que resuelve Express según
 * `TRUST_PROXY_HOPS`; se guarda hasheada.
 *
 * Si el contador no responde se deja pasar: una caída de la tabla de límites no
 * debe impedir que alguien complete su cuenta.
 */
export function createAttemptLimit(limiter: AttemptLimiter, clock: Clock) {
  return (scope: string, limit: number) =>
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      let result: { allowed: boolean; retryAfterSeconds: number };
      try {
        result = await limiter.consume({
          originHash: hashearToken(req.ip ?? 'desconocido'),
          scope,
          now: clock.now(),
          limit,
        });
      } catch {
        next();
        return;
      }

      if (!result.allowed) {
        res.setHeader('Retry-After', String(result.retryAfterSeconds));
        res.status(429).json({
          error: 'too_many_attempts',
          message:
            'Hubo demasiados intentos seguidos. Esperá un minuto y volvé a probar.',
          retryAfterSeconds: result.retryAfterSeconds,
        });
        return;
      }
      next();
    };
}
