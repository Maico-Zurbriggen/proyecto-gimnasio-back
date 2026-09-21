import type { UserRole } from '../../../../shared/types/auth';

/** Credenciales almacenadas de un usuario, para verificar un intento de login. */
export interface UserCredentialsRecord {
  id: string;
  gymId: string;
  passwordHash: string;
  state: 'ACTIVO' | 'SUSPENDIDO';
  roles: UserRole[];
}

/** Sesión recuperada a partir del hash de su token. */
export interface AuthSessionRecord {
  id: string;
  userId: string;
  gymId: string;
  roles: UserRole[];
  lastActivityAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  userState: 'ACTIVO' | 'SUSPENDIDO';
}

export interface CreateSessionCommand {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface AuthRepository {
  /** Busca las credenciales por correo normalizado. `null` si no existe. */
  findCredentialsByEmail(
    emailNormalized: string,
  ): Promise<UserCredentialsRecord | null>;

  /** Registra una sesión nueva. */
  createSession(command: CreateSessionCommand): Promise<void>;

  /** Recupera una sesión por el hash de su token. `null` si no existe. */
  findSessionByTokenHash(tokenHash: string): Promise<AuthSessionRecord | null>;

  /** Corre la ventana de inactividad de una sesión vigente (T3). */
  touchSession(
    sessionId: string,
    lastActivityAt: Date,
    expiresAt: Date,
  ): Promise<void>;

  /** Marca una sesión como revocada (T4). Idempotente. */
  revokeSession(tokenHash: string, revokedAt: Date): Promise<void>;
}
