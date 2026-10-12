import type { UserRole } from '../../../../shared/types/auth';

/** Estado de una invitación, tal como lo define el enum `InvitationStatus`. */
export type InvitationStatus = 'VIGENTE' | 'USADA' | 'REVOCADA' | 'CADUCADA';

/** Invitación recuperada por el hash de su token, con lo que el alta necesita. */
export interface InvitationRecord {
  id: string;
  gymId: string;
  gymName: string;
  emailNormalized: string;
  status: InvitationStatus;
  issuedAt: Date;
  expiresAt: Date;
  roles: UserRole[];
}

export interface CompleteAccountCommand {
  invitationId: string;
  displayName: string;
  passwordHash: string;
  /** Instante del servidor con el que se revalida la vigencia al consumirla. */
  now: Date;
}

export interface CompletedAccountResult {
  userId: string;
  gymId: string;
  email: string;
  displayName: string;
  roles: UserRole[];
}

export interface InvitationsRepository {
  /** Busca la invitación por el hash de su token. `null` si no existe. */
  findByTokenHash(tokenHash: string): Promise<InvitationRecord | null>;

  /**
   * Consume la invitación y crea el usuario en una sola transacción (T2,
   * RF-116): no puede quedar un usuario creado con la invitación vigente, ni la
   * invitación usada sin usuario.
   *
   * El consumo es condicional —sólo pasa de VIGENTE a USADA si sigue vigente en
   * `now`—, así que de dos envíos simultáneos sólo uno crea la cuenta y el otro
   * recibe el motivo actual (RI-19). Lanza los errores de dominio de la
   * invitación o `UserAlreadyExistsError`.
   *
   * Los roles se toman de la invitación, nunca del pedido (RA-09). Si emitió un
   * entrenador y el invitado es ALUMNO, la asignación queda creada (FL-19/4).
   */
  completeAccount(
    command: CompleteAccountCommand,
  ): Promise<CompletedAccountResult>;
}
