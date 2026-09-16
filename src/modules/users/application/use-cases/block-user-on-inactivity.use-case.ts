import type { Clock } from '../../../routines/application/ports/clock';
import { UserNotFoundError } from '../../domain/errors/user-errors';
import { evaluateInactivity } from '../../domain/services/inactivity-strikes.service';
import type { InactivityEvaluationResultDto } from '../dto/inactivity-evaluation.dto';
import type { UsersRepository } from '../ports/users.repository';

export interface BlockUserOnInactivityCommand {
  userId: string;
  consecutiveFaltas?: number;
  daysInactive?: number;
  lastDataDate?: Date;
}

export class BlockUserOnInactivityUseCase {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    command: BlockUserOnInactivityCommand,
  ): Promise<InactivityEvaluationResultDto> {
    const user = await this.usersRepository.findById(command.userId);
    if (!user) {
      throw new UserNotFoundError(`User ${command.userId} not found`);
    }

    const currentDate = this.clock.now();
    const evaluation = evaluateInactivity({
      consecutiveFaltas: command.consecutiveFaltas,
      daysInactive: command.daysInactive,
      lastDataDate: command.lastDataDate,
      currentDate,
    });

    if (evaluation.shouldBlock) {
      user.suspend();
      await this.usersRepository.save(user);
    }

    return {
      userId: user.id,
      state: user.state,
      blocked: evaluation.shouldBlock,
      consecutiveFaltas: evaluation.consecutiveFaltas,
      daysInactive: evaluation.daysInactive,
      reason: evaluation.reason,
    };
  }
}
