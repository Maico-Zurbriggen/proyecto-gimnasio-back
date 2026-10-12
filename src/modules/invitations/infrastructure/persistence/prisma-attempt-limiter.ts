import type { PrismaClient } from '@prisma/client';

import {
  INTENTOS_POR_VENTANA,
  VENTANA_MS,
  inicioDeVentana,
  segundosHastaProximaVentana,
  type AttemptLimiter,
} from '../../application/ports/attempt-limiter';

/** Antigüedad a partir de la cual las ventanas cerradas se descartan. */
const RETENCION_MS = 60 * VENTANA_MS;

/**
 * Límite de intentos compartido por todas las instancias (RNF-17).
 *
 * En Vercel cada invocación puede caer en una instancia distinta, así que un
 * contador en memoria no limitaría nada: el conteo vive en la base. El upsert con
 * incremento es atómico, de modo que dos intentos simultáneos no leen el mismo
 * valor.
 */
export class PrismaAttemptLimiter implements AttemptLimiter {
  constructor(private readonly prisma: PrismaClient) {}

  async consume(input: {
    originHash: string;
    scope: string;
    now: Date;
  }): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
    const windowStart = inicioDeVentana(input.now);
    const row = await this.prisma.invitationAttemptLimit.upsert({
      where: {
        originHash_scope_windowStart: {
          originHash: input.originHash,
          scope: input.scope,
          windowStart,
        },
      },
      create: {
        originHash: input.originHash,
        scope: input.scope,
        windowStart,
        attempts: 1,
      },
      update: { attempts: { increment: 1 } },
      select: { attempts: true },
    });

    // Limpieza oportunista: las ventanas viejas ya no limitan nada.
    if (row.attempts === 1) {
      await this.prisma.invitationAttemptLimit.deleteMany({
        where: {
          windowStart: { lt: new Date(input.now.getTime() - RETENCION_MS) },
        },
      });
    }

    return {
      allowed: row.attempts <= INTENTOS_POR_VENTANA,
      retryAfterSeconds: segundosHastaProximaVentana(input.now),
    };
  }
}
