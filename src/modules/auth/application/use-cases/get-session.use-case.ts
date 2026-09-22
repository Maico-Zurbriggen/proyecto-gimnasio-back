import type { Clock } from '../../../routines/application/ports/clock';
import type { UserRole } from '../../../../shared/types/auth';
import { InvalidSessionError } from '../../domain/errors/auth-errors';
import { hashSessionToken } from '../../domain/services/session-token';
import type { AuthUsersRepository } from '../ports/auth-users.repository';
import type { SessionsRepository } from '../ports/sessions.repository';

export interface GetSessionQuery {
  sessionToken: string;
}

export interface SessionUser {
  id: string;
  gymId: string;
  roles: UserRole[];
}

export class GetSessionUseCase {
  constructor(
    private readonly users: AuthUsersRepository,
    private readonly sessions: SessionsRepository,
    private readonly clock: Clock,
  ) {}

  async execute(query: GetSessionQuery): Promise<SessionUser> {
    const record = await this.sessions.findByTokenHash(
      hashSessionToken(query.sessionToken),
    );
    const now = this.clock.now();
    if (!record || record.revokedAt !== null || record.expiresAt <= now) {
      throw new InvalidSessionError();
    }

    const credentials = await this.users.findById(record.userId);
    if (!credentials || credentials.state !== 'ACTIVO') {
      throw new InvalidSessionError();
    }

    await this.sessions.touch(record.tokenHash, now);

    return {
      id: credentials.id,
      gymId: credentials.gymId,
      roles: credentials.roles,
    };
  }
}
