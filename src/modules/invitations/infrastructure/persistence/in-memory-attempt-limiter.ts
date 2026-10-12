import {
  INTENTOS_POR_VENTANA,
  inicioDeVentana,
  segundosHastaProximaVentana,
  type AttemptLimiter,
} from '../../application/ports/attempt-limiter';

/**
 * Implementación en memoria, para pruebas y desarrollo con un único proceso. En
 * despliegue se usa la de base de datos, que comparten todas las instancias.
 */
export class InMemoryAttemptLimiter implements AttemptLimiter {
  private readonly counts = new Map<string, number>();

  consume(input: {
    originHash: string;
    scope: string;
    now: Date;
  }): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
    const key = `${input.scope}:${input.originHash}:${String(inicioDeVentana(input.now).getTime())}`;
    const attempts = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, attempts);
    return Promise.resolve({
      allowed: attempts <= INTENTOS_POR_VENTANA,
      retryAfterSeconds: segundosHastaProximaVentana(input.now),
    });
  }
}
