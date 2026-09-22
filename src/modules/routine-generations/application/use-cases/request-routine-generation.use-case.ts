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
import type { RoutineGenerationsRepository } from '../ports/routine-generations.repository';

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
    private readonly routineGenerationsRepository: RoutineGenerationsRepository,
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
      await this.contextRepository.getPrefilteredCatalog(
        command.studentId,
        studentContext.gymId,
        this.clock.now(),
      );

    if (prefilteredCatalog.length === 0) {
      throw new EmptyPrefilteredCatalogError(
        `No compatible exercises available for gym ${studentContext.gymId}`,
      );
    }

    const accepted = await this.gateway.requestGeneration({
      idempotencyKey: command.idempotencyKey ?? this.idGenerator.generate(),
      gymId: studentContext.gymId,
      studentId: command.studentId,
      requestedByUserId: command.requestedByUserId,
      freeText: command.freeText ?? null,
      parameters: command.parameters ?? null,
      prefilteredCatalog,
      minimizedContext: studentContext.minimizedContext,
    });

    await this.routineGenerationsRepository.registerOwnership({
      requestId: accepted.requestId,
      studentId: command.studentId,
      requestedByUserId: command.requestedByUserId,
    });

    return accepted;
  }
}
