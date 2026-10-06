import type { UserRole } from '../../../../shared/types/auth';

/**
 * Reglas de emisión y revocación de invitaciones (HU08 - T1 y T2).
 *
 * Funciones puras: no consultan la base ni el reloj del sistema, de modo que el
 * vencimiento y la caducidad se puedan probar sin esperar catorce días.
 */

/** Una invitación vence a los 14 días de emitida (RN-02b). */
export const DIAS_VIGENCIA_INVITACION = 14;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** Instante en que vence una invitación emitida en `emitidaEn`. */
export function calcularVencimiento(
  emitidaEn: Date,
  dias: number = DIAS_VIGENCIA_INVITACION,
): Date {
  return new Date(emitidaEn.getTime() + dias * MS_POR_DIA);
}

/**
 * Roles que un emisor puede otorgar (RN-02d, RA-10).
 *
 * Un administrador invita con cualquier rol; un entrenador **sólo con ALUMNO**.
 * Nadie más puede emitir invitaciones.
 */
export function rolesQuePuedeOtorgar(
  rolesDelEmisor: readonly UserRole[],
): UserRole[] {
  if (rolesDelEmisor.includes('ADMINISTRADOR')) {
    return ['ALUMNO', 'ENTRENADOR', 'ADMINISTRADOR'];
  }
  if (rolesDelEmisor.includes('ENTRENADOR')) {
    return ['ALUMNO'];
  }
  return [];
}

/**
 * Verifica que el emisor pueda otorgar **todos** los roles pedidos.
 *
 * Se comprueba del lado del servidor aunque la interfaz ya limite el selector:
 * el criterio 2 exige el rechazo incluso si se fuerza la petición.
 */
export function puedeOtorgarRoles(
  rolesDelEmisor: readonly UserRole[],
  rolesPedidos: readonly UserRole[],
): boolean {
  if (rolesPedidos.length === 0) {
    return false;
  }
  const permitidos = rolesQuePuedeOtorgar(rolesDelEmisor);
  return rolesPedidos.every((rol) => permitidos.includes(rol));
}

/**
 * Normaliza un correo igual que el alta: sin espacios y en minúsculas.
 *
 * Es lo que hace que «  ALUMNO@Gym.Test  » y «alumno@gym.test» sean la misma
 * dirección a la hora de detectar duplicados (criterio 8).
 */
export function normalizarCorreo(email: string): string {
  return email.trim().toLowerCase();
}

/** Estado persistido de una invitación. */
export type EstadoInvitacion = 'VIGENTE' | 'USADA' | 'REVOCADA' | 'CADUCADA';

/**
 * Estado efectivo de una invitación en un instante dado.
 *
 * `CADUCADA` es **derivado**: una invitación guardada como VIGENTE cuyo plazo ya
 * pasó está caducada aunque nadie haya corrido un proceso que la actualice
 * (criterio 15). Los estados terminales se informan tal como están.
 */
export function estadoEfectivo(
  estadoPersistido: EstadoInvitacion,
  expiresAt: Date,
  ahora: Date,
): EstadoInvitacion {
  if (estadoPersistido !== 'VIGENTE') {
    return estadoPersistido;
  }
  return expiresAt.getTime() <= ahora.getTime() ? 'CADUCADA' : 'VIGENTE';
}

/**
 * Determina si una invitación puede revocarse (criterios 11 y 12).
 *
 * Sólo una invitación efectivamente vigente: una ya usada no se deshace —el
 * usuario existe—, y una revocada o caducada ya no habilita nada.
 */
export function puedeRevocarse(
  estadoPersistido: EstadoInvitacion,
  expiresAt: Date,
  ahora: Date,
): boolean {
  return estadoEfectivo(estadoPersistido, expiresAt, ahora) === 'VIGENTE';
}

/**
 * Determina si un usuario puede revocar una invitación (criterio 13).
 *
 * El administrador del gimnasio, o el propio emisor. Otro entrenador no, aunque
 * pertenezca al mismo gimnasio.
 */
export function puedeRevocarInvitacion(
  actor: { id: string; roles: readonly UserRole[] },
  invitacion: { issuedByUserId: string },
): boolean {
  return (
    actor.roles.includes('ADMINISTRADOR') ||
    actor.id === invitacion.issuedByUserId
  );
}
