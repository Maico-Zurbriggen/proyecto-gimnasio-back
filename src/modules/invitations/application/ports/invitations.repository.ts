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
  /**
   * Entrenador que emitió la invitación de un alumno: va a ser su profesor
   * asignado (FL-19/4). `null` si la emitió otro rol o el aprovisionamiento.
   */
  trainerName: string | null;
}

/** Invitación a emitir, ya resuelta por el caso de uso. */
export interface IssueInvitationCommand {
  gymId: string;
  issuedByUserId: string;
  emailNormalized: string;
  roles: UserRole[];
  tokenHash: string;
  issuedAt: Date;
  expiresAt: Date;
}

/** Invitación recién emitida, con lo que hace falta para el correo. */
export interface IssuedInvitation {
  id: string;
  gymName: string;
  emailNormalized: string;
  roles: UserRole[];
  expiresAt: Date;
  /** Nombre del emisor si es entrenador del gimnasio. */
  trainerName: string | null;
}

/** Invitación en el listado de quien la emitió. */
export interface IssuedInvitationRecord {
  id: string;
  issuedByUserId: string | null;
  emailNormalized: string;
  roles: UserRole[];
  status: InvitationStatus;
  issuedAt: Date;
  expiresAt: Date;
  issuedByName: string | null;
}

export interface CompleteAccountCommand {
  invitationId: string;
  displayName: string;
  passwordHash: string;
  /** Instante del servidor con el que se revalida la vigencia al consumirla. */
  now: Date;
  /** FL-19/3: consentimiento para datos de salud, separado del alta. */
  healthDataConsent: boolean;
}

export interface CompletedAccountResult {
  userId: string;
  gymId: string;
  email: string;
  displayName: string;
  roles: UserRole[];
}

export interface InvitationsRepository {
  /**
   * Emite una invitación con su auditoría en una sola transacción. El paso
   * `beforeCommit` corre adentro: si el correo no sale, no queda nada.
   * Responde con el motivo si el correo ya tiene cuenta en el gimnasio o una
   * invitación vigente.
   */
  issue(
    command: IssueInvitationCommand,
    beforeCommit: (issued: IssuedInvitation) => Promise<void>,
  ): Promise<
    IssuedInvitation | 'EMAIL_YA_REGISTRADO' | 'INVITACION_VIGENTE_EXISTENTE'
  >;

  /** Invitaciones del gimnasio; acotadas al emisor si se indica. */
  list(filter: {
    gymId: string;
    issuedByUserId?: string;
  }): Promise<IssuedInvitationRecord[]>;

  findIssuedById(
    invitationId: string,
    gymId: string,
  ): Promise<IssuedInvitationRecord | null>;

  /** Revoca y audita atÃ³micamente una invitaciÃ³n que sigue vigente. */
  revoke(command: {
    invitationId: string;
    actorUserId: string;
    now: Date;
  }): Promise<boolean>;

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
