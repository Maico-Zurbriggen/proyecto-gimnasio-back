/**
 * Límite de intentos por origen (HU06 - criterio 19, RNF-17).
 *
 * `consume` registra un intento y responde si todavía está dentro del cupo. El
 * origen llega ya hasheado: la tabla no guarda direcciones IP.
 */
export interface AttemptLimiter {
  consume(input: {
    originHash: string;
    scope: string;
    now: Date;
  }): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
}

/** Intentos admitidos por origen y por ventana: el sexto se rechaza. */
export const INTENTOS_POR_VENTANA = 5;

/** Largo de la ventana de conteo. */
export const VENTANA_MS = 60 * 1000;

/** Inicio de la ventana fija de un minuto que contiene a `now`. */
export function inicioDeVentana(now: Date): Date {
  return new Date(Math.floor(now.getTime() / VENTANA_MS) * VENTANA_MS);
}

/** Segundos que faltan para que se abra la próxima ventana. */
export function segundosHastaProximaVentana(now: Date): number {
  const fin = inicioDeVentana(now).getTime() + VENTANA_MS;
  return Math.max(1, Math.ceil((fin - now.getTime()) / 1000));
}
