import type { Clock } from '../../../routines/application/ports/clock';
import {
  EmptyPrefilteredCatalogError,
  MissingGenerationInputError,
  StudentNotFoundError,
} from '../../domain/errors/routine-generation-errors';
import type { RoutineGenerationParameters } from '../dto/routine-generation-context.dto';
import type { GenerationContextRepository } from '../ports/generation-context.repository';
import type { IdGenerator } from '../ports/id-generator';
import type {
  RoutineGenerationAcceptedResult,
  RoutineGenerationGateway,
} from '../ports/routine-generation.gateway';

export interface RequestRoutineGenerationCommand {
  studentId: string;
  requestedByUserId: string;
  freeText?: string;
  parameters?: RoutineGenerationParameters;
  idempotencyKey?: string;
}

export class RequestRoutineGenerationUseCase {
  constructor(
    private readonly contextRepository: GenerationContextRepository,
    private readonly gateway: RoutineGenerationGateway,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(
    command: RequestRoutineGenerationCommand,
  ): Promise<RoutineGenerationAcceptedResult> {
    if (!command.freeText && !command.parameters) {
      throw new MissingGenerationInputError();
    }

    const studentContext = await this.contextRepository.getStudentContext(
      command.studentId,
      this.clock.now(),
    );

    if (!studentContext) {
      throw new StudentNotFoundError(`Student ${command.studentId} not found`);
    }

    const prefilteredCatalog =
      await this.contextRepository.getPrefilteredCatalog(studentContext.gymId);

    if (prefilteredCatalog.length === 0) {
      throw new EmptyPrefilteredCatalogError(
        `No compatible exercises available for gym ${studentContext.gymId}`,
      );
    }

    return this.gateway.requestGeneration({
      idempotencyKey: command.idempotencyKey ?? this.idGenerator.generate(),
      gymId: studentContext.gymId,
      studentId: command.studentId,
      requestedByUserId: command.requestedByUserId,
      freeText: command.freeText ?? null,
      parameters: command.parameters ?? null,
      prefilteredCatalog,
      minimizedContext: studentContext.minimizedContext,
    });
  }
}
