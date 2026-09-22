import bcrypt from 'bcryptjs';

import type { Clock } from '../../../routines/application/ports/clock';
import type { UserRole } from '../../../../shared/types/auth';
import { InvalidCredentialsError } from '../../domain/errors/auth-errors';
import {
  generateSessionToken,
  hashSessionToken,
} from '../../domain/services/session-token';
import type { AuthUsersRepository } from '../ports/auth-users.repository';
import type { SessionsRepository } from '../ports/sessions.repository';

export interface LoginCommand {
  email: string;
  password: string;
}

export interface LoginResult {
  sessionToken: string;
  expiresAt: Date;
  user: {
    id: string;
    gymId: string;
    roles: UserRole[];
  };
}

const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;

export class LoginUseCase {
  constructor(
    private readonly users: AuthUsersRepository,
    private readonly sessions: SessionsRepository,
    private readonly clock: Clock,
    private readonly sessionTtlHours: number,
  ) {}

  async execute(command: LoginCommand): Promise<LoginResult> {
    const credentials = await this.users.findByEmail(command.email);
    if (!credentials || credentials.state !== 'ACTIVO') {
      throw new InvalidCredentialsError();
    }

    let matches = false;
    try {
      matches = await bcrypt.compare(
        command.password,
        credentials.passwordHash,
      );
    } catch {
      matches = false;
    }
    if (!matches) {
      throw new InvalidCredentialsError();
    }

    const sessionToken = generateSessionToken();
    const record = await this.sessions.create({
      tokenHash: hashSessionToken(sessionToken),
      userId: credentials.id,
      expiresAt: new Date(
        this.clock.now().getTime() +
          this.sessionTtlHours * MILLISECONDS_PER_HOUR,
      ),
    });

    return {
      sessionToken,
      expiresAt: record.expiresAt,
      user: {
        id: credentials.id,
        gymId: credentials.gymId,
        roles: credentials.roles,
      },
    };
  }
}
