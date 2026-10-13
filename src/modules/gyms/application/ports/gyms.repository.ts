/** Invitación de arranque, tal como se guarda. */
export interface BootstrapInvitationRecord {
  email: string;
  status: 'VIGENTE' | 'USADA' | 'REVOCADA' | 'CADUCADA';
  issuedAt: Date;
  expiresAt: Date;
}

/** Gimnasio afiliado en el listado del SuperAdmin (criterio 21). */
export interface GymSummaryRecord {
  id: string;
  name: string;
  timezone: string;
  active: boolean;
  createdAt: Date;
  administratorCount: number;
  /** La invitación de arranque más reciente; `null` en gimnasios previos. */
  bootstrapInvitation: BootstrapInvitationRecord | null;
}

/** Datos de una invitación de arranque nueva. El token llega ya hasheado. */
export interface BootstrapInvitationCommand {
  tokenHash: string;
  issuedAt: Date;
  expiresAt: Date;
}

export interface ProvisionGymCommand {
  name: string;
  timezone: string;
  adminEmail: string;
  invitation: BootstrapInvitationCommand;
  actorUserId: string;
}

export interface ProvisionedGym {
  id: string;
  name: string;
  timezone: string;
  createdAt: Date;
  adminEmail: string;
  invitationExpiresAt: Date;
}

export interface ReissueBootstrapCommand {
  gymId: string;
  invitation: BootstrapInvitationCommand;
  actorUserId: string;
}

export interface ReissuedInvitation {
  gymName: string;
  email: string;
  expiresAt: Date;
}

/**
 * Paso que corre dentro de la transacción, antes de confirmarla. Si lanza, no
 * queda nada guardado: es como el envío del correo forma parte de la unidad
 * atómica (criterio 2).
 */
export type BeforeCommit<T> = (created: T) => Promise<void>;

export interface UpdateGymCommand {
  gymId: string;
  actorUserId: string;
  name?: string;
  timezone?: string;
  /** Criterio 23: cambiar la zona con sesiones registradas exige confirmarlo. */
  confirmTimezoneChange: boolean;
}

export type UpdateGymResult =
  | { status: 'OK'; gym: GymSummaryRecord }
  | { status: 'NO_EXISTE' }
  | { status: 'NOMBRE_DUPLICADO' }
  | { status: 'REQUIERE_CONFIRMACION'; sessionCount: number };

export interface GymsRepository {
  /** Edita nombre y zona horaria con auditoría. No borra ningún dato. */
  update(command: UpdateGymCommand): Promise<UpdateGymResult>;

  /**
   * Suspende o reactiva el gimnasio (D2/§1.1): no borra nada; mientras esté
   * suspendido sus usuarios no pueden ingresar.
   */
  setActive(input: {
    gymId: string;
    actorUserId: string;
    active: boolean;
  }): Promise<GymSummaryRecord | null>;

  /**
   * Crea el gimnasio, su invitación de arranque con rol ADMINISTRADOR y el
   * registro de auditoría en una sola transacción (RF-115, RNF-38).
   * `'NOMBRE_DUPLICADO'` si ya hay un gimnasio con ese nombre, aun cuando la
   * otra alta haya sido simultánea.
   */
  provision(
    command: ProvisionGymCommand,
    beforeCommit: BeforeCommit<ProvisionedGym>,
  ): Promise<ProvisionedGym | 'NOMBRE_DUPLICADO'>;

  /** Gimnasios afiliados, del más reciente al más viejo. */
  list(): Promise<GymSummaryRecord[]>;

  /**
   * Revoca la invitación de arranque pendiente, si la hay, y emite otra al
   * mismo correo, con auditoría, en una sola transacción.
   */
  reissueBootstrapInvitation(
    command: ReissueBootstrapCommand,
    beforeCommit: BeforeCommit<ReissuedInvitation>,
  ): Promise<ReissuedInvitation | 'YA_USADA' | 'NO_EXISTE'>;
}
