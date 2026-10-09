export interface PasswordRecoveryRepository {
  issue(input: {
    email: string;
    originHash: string;
    tokenHash: string;
    now: Date;
    expiresAt: Date;
  }): Promise<{ limited: boolean; recipients: string[] }>;
  reset(tokenHash: string, passwordHash: string, now: Date): Promise<boolean>;
  change(
    userId: string,
    sessionId: string,
    passwordHash: string,
    now: Date,
  ): Promise<boolean>;
}

export interface RecoveryMailer {
  send(email: string, token: string): Promise<void>;
}
