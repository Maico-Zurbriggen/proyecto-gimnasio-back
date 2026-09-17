export interface InvitationRecord {
  id: string;
  gymId: string;
  gymName: string;
  issuedByUserId: string;
  issuedByUserRoles: string[];
  emailNormalized: string;
  status: 'VIGENTE' | 'USADA' | 'REVOCADA' | 'CADUCADA';
  issuedAt: Date;
  expiresAt: Date;
  roles: string[];
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
  roles: string[];
}

export interface InvitationsRepository {
  findByToken(token: string): Promise<InvitationRecord | null>;
  completeAccount(
    command: CompleteAccountCommand,
  ): Promise<CompletedAccountResult>;
}
