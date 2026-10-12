import type { UserRole } from '../../../../shared/types/auth';

/**
 * Reglas de emisión de invitaciones (FL-19/1, RN-02d, RA-10). Funciones puras.
 */

/** Roles que se pueden otorgar por invitación. SUPERADMIN nunca. */
export const ROLES_INVITABLES: readonly UserRole[] = [
  'ALUMNO',
  'ENTRENADOR',
  'ADMINISTRADOR',
];

/**
 * Un administrador invita con cualquier rol del gimnasio; un entrenador sólo
 * con ALUMNO. Nadie más emite invitaciones.
 */
export function rolesQuePuedeOtorgar(
  rolesDelEmisor: readonly UserRole[],
): UserRole[] {
  if (rolesDelEmisor.includes('ADMINISTRADOR')) return [...ROLES_INVITABLES];
  if (rolesDelEmisor.includes('ENTRENADOR')) return ['ALUMNO'];
  return [];
}

/** El emisor puede otorgar **todos** los roles pedidos, y al menos uno. */
export function puedeOtorgarRoles(
  rolesDelEmisor: readonly UserRole[],
  rolesPedidos: readonly UserRole[],
): boolean {
  if (rolesPedidos.length === 0) return false;
  const permitidos = rolesQuePuedeOtorgar(rolesDelEmisor);
  return rolesPedidos.every((rol) => permitidos.includes(rol));
}

/** Estado de una invitación emitida, como lo ve quien la emitió. */
export type EstadoInvitacionEmitida =
  'PENDIENTE' | 'USADA' | 'VENCIDA' | 'REVOCADA';
