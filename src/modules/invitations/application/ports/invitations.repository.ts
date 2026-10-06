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

/** Datos para crear una invitación nominal (HU08 - T1). */
export interface CreateInvitationCommand {
  gymId: string;
  issuedByUserId: string;
  emailNormalized: string;
  roles: UserRole[];
  expiresAt: Date;
}

/** Invitación emitida, tal como se lista y se devuelve tras crearla. */
export interface IssuedInvitationRecord {
  id: string;
  gymId: string;
  emailNormalized: string;
  status: InvitationStatus;
  issuedAt: Date;
  expiresAt: Date;
  roles: UserRole[];
  issuedByUserId: string;
  issuedByName: string;
}

export interface InvitationsRepository {
  /**
   * Crea la invitación con sus roles (HU08 - T1).
   *
   * Dentro de una transacción comprueba que el correo no tenga ya cuenta en ese
   * gimnasio ni una invitación vigente, y devuelve `null` en ese caso: es el
   * criterio 9, que el esquema no garantiza con un índice.
   */
  create(
    command: CreateInvitationCommand,
  ): Promise<
    | IssuedInvitationRecord
    | 'EMAIL_YA_REGISTRADO'
    | 'INVITACION_VIGENTE_EXISTENTE'
  >;

  /** Invitación por su id, acotada al gimnasio indicado (RA-02, criterio 16). */
  findById(
    invitationId: string,
    gymId: string,
  ): Promise<IssuedInvitationRecord | null>;

  /**
   * Invitaciones del gimnasio (HU08 - T3).
   *
   * `issuedByUserId` acota al emisor: un entrenador sólo ve las que emitió
   * (criterio 14).
   */
  list(filtro: {
    gymId: string;
    issuedByUserId?: string;
  }): Promise<IssuedInvitationRecord[]>;

  /** Marca la invitación como revocada (HU08 - T2). Idempotente. */
  revoke(invitationId: string): Promise<void>;

  /** Deja constancia de la operación en auditoría (criterio 21, RN-108). */
  recordAudit(entry: {
    actorUserId: string;
    operation: string;
    invitationId: string;
    newValue: Record<string, unknown>;
  }): Promise<void>;

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
