import type { UserRole } from '../../../../shared/types/auth';

/** Estado de una invitación, tal como lo define el enum `InvitationStatus`. */
export type InvitationStatus = 'VIGENTE' | 'USADA' | 'REVOCADA' | 'CADUCADA';

/** Invitación recuperada por su token, con lo que el alta necesita saber. */
export interface InvitationRecord {
  id: string;
  gymId: string;
  gymName: string;
  emailNormalized: string;
  status: InvitationStatus;
  expiresAt: Date;
  roles: UserRole[];
}

export interface CompleteAccountCommand {
  invitationId: string;
  displayName: string;
  passwordHash: string;
}

export interface CompletedAccountResult {
  userId: string;
  gymId: string;
  email: string;
  displayName: string;
  roles: UserRole[];
}

export interface InvitationsRepository {
  /** Busca la invitación por su token. `null` si no existe. */
  findByToken(token: string): Promise<InvitationRecord | null>;

  /**
   * Crea el usuario con sus roles y marca la invitación como usada, en una sola
   * transacción: RF-116 exige que la invitación sea de un solo uso.
   */
  completeAccount(
    command: CompleteAccountCommand,
  ): Promise<CompletedAccountResult>;
}
