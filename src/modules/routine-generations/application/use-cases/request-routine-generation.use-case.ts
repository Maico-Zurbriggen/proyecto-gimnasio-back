import type { Clock } from '../../../routines/application/ports/clock';
import {
  EmptyPrefilteredCatalogError,
  MissingGenerationInputError,
  RoutineRegenerationNotAllowedError,
  StudentNotFoundError,
} from '../../domain/errors/routine-generation-errors';
import type { RoutineGenerationParameters } from '../dto/routine-generation-context.dto';
import type { GenerationContextRepository } from '../ports/generation-context.repository';
import type { IdGenerator } from '../ports/id-generator';
import type { RoutineGenerationGateway } from '../ports/routine-generation.gateway';
import type { RoutineGenerationsRepository } from '../ports/routine-generations.repository';

export interface RequestRoutineGenerationCommand {
  studentId: string;
  requestedByUserId: string;
  freeText?: string;
  parameters?: RoutineGenerationParameters;
  idempotencyKey?: string;
  regenerate?: boolean;
}

export class RequestRoutineGenerationUseCase {
  constructor(
    private readonly contextRepository: GenerationContextRepository,
    private readonly gateway: RoutineGenerationGateway,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
    private readonly routineGenerationsRepository: RoutineGenerationsRepository,
    private readonly allowLocalRegeneration = false,
  ) {}

  async execute(command: RequestRoutineGenerationCommand): Promise<{
    requestId: string;
    status: string;
    alreadyExisted: boolean;
  }> {
    if (command.regenerate && !this.allowLocalRegeneration) {
      throw new RoutineRegenerationNotAllowedError();
    }
    if (!command.freeText && !command.parameters) {
      throw new MissingGenerationInputError();
    }

    const asOf = this.clock.now();
    const studentContext = await this.contextRepository.getStudentContext(
      command.studentId,
      asOf,
    );

    if (!studentContext) {
      throw new StudentNotFoundError(`Student ${command.studentId} not found`);
    }

    const generationCatalog = await this.contextRepository.getEnabledCatalog(
      studentContext.gymId,
    );
    if (generationCatalog.length === 0)
      throw new EmptyPrefilteredCatalogError(
        'El administrador debe habilitar ejercicios del gimnasio.',
      );

    const replacement = command.regenerate
      ? {
          local_test_regeneration: {
            replaces_proposed_routine_id:
              await this.routineGenerationsRepository.findProposedRoutineId(
                command.studentId,
              ),
          },
        }
      : {};
    const request = await this.routineGenerationsRepository.createOrGetRequest({
      idempotencyKey: command.idempotencyKey ?? this.idGenerator.generate(),
      minimizedContext: studentContext.minimizedContext,
      preferences: {
        schema_version: '2.0',
        ...replacement,
        free_text: command.freeText ?? null,
        parameters: command.parameters
          ? {
              objective: command.parameters.objetivo,
              weekly_frequency: command.parameters.frecuenciaSemanal,
              duration_minutes: command.parameters.duracionMinutos,
              restrictions: command.parameters.restricciones,
              confidence: command.parameters.confianza,
            }
          : null,
        allowed_catalog: generationCatalog
          .sort((left, right) =>
            left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
          )
          .map((exercise) => ({
            id: exercise.id,
            name: exercise.nombre,
            movement_pattern: exercise.patronMovimiento,
            instructions: exercise.instrucciones ?? '',
            description: exercise.descripcion ?? null,
            tips: exercise.consejos ?? [],
            difficulty_level: exercise.dificultad ?? '',
            unilateral: exercise.unilateral ?? false,
            revision: exercise.revision ?? 1,
            ...(exercise.availabilityUpdatedAt
              ? { availability_updated_at: exercise.availabilityUpdatedAt }
              : {}),
            ...(exercise.availabilityRevision
              ? { availability_revision: exercise.availabilityRevision }
              : {}),
            secondary_muscles: exercise.musculosSecundarios ?? [],
            equipment: exercise.equipamiento ?? [],
            joints: exercise.articulaciones ?? [],
            ...(exercise.musculosPrimarios
              ? { primary_muscles: exercise.musculosPrimarios }
              : {}),
          })),
      },
      ownership: {
        studentId: command.studentId,
        requestedByUserId: command.requestedByUserId,
      },
      retentionUntil: new Date(asOf.getTime() + 30 * 24 * 60 * 60 * 1000),
    });

    await this.routineGenerationsRepository.registerOwnership({
      requestId: request.requestId,
      studentId: command.studentId,
      requestedByUserId: command.requestedByUserId,
    });

    if (request.status === 'PENDIENTE' || request.status === 'PROCESANDO') {
      await this.gateway.dispatchGeneration(request.requestId);
    }

    return request;
  }
}
