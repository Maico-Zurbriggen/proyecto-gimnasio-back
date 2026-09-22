export interface AuthSessionRecord {
  tokenHash: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface CreateSessionInput {
  tokenHash: string;
  userId: string;
  expiresAt: Date;
}

export interface SessionsRepository {
  create(input: CreateSessionInput): Promise<AuthSessionRecord>;
  findByTokenHash(tokenHash: string): Promise<AuthSessionRecord | null>;
  revoke(tokenHash: string, revokedAt: Date): Promise<void>;
  touch(tokenHash: string, at: Date): Promise<void>;
}
