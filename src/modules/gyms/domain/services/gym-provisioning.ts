import { motivoNoUsable } from '../../../invitations/domain/services/invitation-validity';

/**
 * Reglas puras del aprovisionamiento de un gimnasio (HU13).
 */

/** Largo máximo del nombre de un gimnasio. */
export const LARGO_MAXIMO_NOMBRE_GIMNASIO = 120;

/**
 * Nombre como se guarda y se compara: sin espacios en los extremos ni
 * repetidos. La unicidad, además, ignora mayúsculas (índice en la base).
 */
export function normalizarNombreGimnasio(nombre: string): string {
  return nombre.trim().replace(/\s+/g, ' ');
}

/** Correo como se guarda: sin espacios y en minúsculas, igual que el login. */
export function normalizarCorreo(correo: string): string {
  return correo.trim().toLowerCase();
}

/**
 * Forma de un identificador IANA de zona: `Área/Lugar`, con subzonas
 * opcionales (`America/Argentina/Cordoba`). Es un filtro de forma; que la zona
 * exista lo decide el catálogo de la base, que es el que la va a usar.
 */
export function tieneFormaDeZonaIana(zona: string): boolean {
  return /^[A-Z][A-Za-z_-]+(\/[A-Za-z0-9_+-]+)+$/.test(zona);
}

/** Estado de la invitación del primer administrador, como lo ve el SuperAdmin. */
export type EstadoInvitacionArranque =
  'PENDIENTE' | 'USADA' | 'VENCIDA' | 'REVOCADA';

export function estadoInvitacionArranque(
  estado: 'VIGENTE' | 'USADA' | 'REVOCADA' | 'CADUCADA',
  issuedAt: Date,
  expiresAt: Date,
  ahora: Date,
): EstadoInvitacionArranque {
  return motivoNoUsable(estado, issuedAt, expiresAt, ahora) ?? 'PENDIENTE';
}

/** Sólo se reemite una invitación de arranque que no se usó (criterio 12). */
export function puedeReemitirse(estado: EstadoInvitacionArranque): boolean {
  return estado !== 'USADA';
}
