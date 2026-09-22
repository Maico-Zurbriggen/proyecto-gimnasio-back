import type { Clock } from '../../../routines/application/ports/clock';
import { hashSessionToken } from '../../domain/services/session-token';
import type { SessionsRepository } from '../ports/sessions.repository';

export interface LogoutCommand {
  sessionToken: string | null;
}

export class LogoutUseCase {
  constructor(
    private readonly sessions: SessionsRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: LogoutCommand): Promise<void> {
    if (!command.sessionToken) {
      return;
    }
    await this.sessions.revoke(
      hashSessionToken(command.sessionToken),
      this.clock.now(),
    );
  }
}
