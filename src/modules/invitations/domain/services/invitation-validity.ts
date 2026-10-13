import { randomBytes } from 'node:crypto';

import { hashearToken } from '../../../auth/domain/services/session-token';

/**
 * Vigencia y token de una invitación (HU06 - T1).
 *
 * Funciones puras salvo la generación del token: el instante se recibe como
 * argumento, siempre del reloj del servidor, nunca de la hora del cliente
 * (criterio 21).
 */

/** Una invitación vence a los 14 días de emitida (RN-02b). */
export const DIAS_VIGENCIA_INVITACION = 14;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** Bytes de entropía del token del enlace. 32 bytes = 256 bits. */
const BYTES_TOKEN = 32;

/** Motivo por el que una invitación ya no sirve para completar una cuenta. */
export type MotivoInvitacionNoUsable = 'USADA' | 'REVOCADA' | 'VENCIDA';

export type EstadoPersistido = 'VIGENTE' | 'USADA' | 'REVOCADA' | 'CADUCADA';

/** Vencimiento a 14 días de la emisión. */
export function calcularVencimiento(emitidaEn: Date): Date {
  return new Date(emitidaEn.getTime() + DIAS_VIGENCIA_INVITACION * MS_POR_DIA);
}

/**
 * Vencimiento efectivo: el guardado, pero nunca más allá de los 14 días de la
 * emisión. Si una fila llegara con un `expires_at` más lejano, manda la regla.
 */
export function vencimientoEfectivo(issuedAt: Date, expiresAt: Date): Date {
  const tope = calcularVencimiento(issuedAt);
  return expiresAt < tope ? expiresAt : tope;
}

/**
 * `null` si la invitación sirve; si no, el motivo. Los estados terminales
 * mandan sobre la fecha: una invitación usada sigue siendo USADA aunque además
 * haya pasado su plazo, porque lo que la persona tiene que hacer es ingresar.
 */
export function motivoNoUsable(
  estado: EstadoPersistido,
  issuedAt: Date,
  expiresAt: Date,
  ahora: Date,
): MotivoInvitacionNoUsable | null {
  if (estado === 'USADA') return 'USADA';
  if (estado === 'REVOCADA') return 'REVOCADA';
  if (
    estado === 'CADUCADA' ||
    vencimientoEfectivo(issuedAt, expiresAt).getTime() <= ahora.getTime()
  ) {
    return 'VENCIDA';
  }
  return null;
}

/** Token aleatorio del enlace, apto para ir en una URL. */
export function generarTokenDeInvitacion(): string {
  return randomBytes(BYTES_TOKEN).toString('base64url');
}

/**
 * Hash con el que se guarda y se busca el token (criterio 4). Es el mismo
 * SHA-256 que las sesiones: el token tiene 256 bits de azar, así que no hay
 * diccionario que probar y no hace falta una derivación lenta.
 */
export function hashearTokenDeInvitacion(token: string): string {
  return hashearToken(token);
}
