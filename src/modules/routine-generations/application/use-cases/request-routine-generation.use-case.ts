import type { Clock } from '../../../routines/application/ports/clock';
import { goalContext } from '../../../goals/domain/context-policy';
import { ContextInsufficientError } from '../../domain/errors/context-insufficient.error';
import { generationPrescriptionConstraints } from '../../domain/services/generated-routine-validator';
import { extractMuscleCountRequirements } from '../../domain/services/generation-request-requirements';
import {
  EmptyPrefilteredCatalogError,
  MissingGenerationInputError,
  NoProposedRoutineError,
  RoutineRegenerationNotAllowedError,
  StudentNotFoundError,
} from '../../domain/errors/routine-generation-errors';
import type {
  RoutineGenerationParameters,
  RoutineGenerationTask,
  RoutineRenewalStructureInput,
} from '../dto/routine-generation-context.dto';
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
  /** Changes asked on the student's current proposed routine (HITL). */
  changeRequest?: string;
  /** Internal renewal jobs use the current prescription as their source of truth. */
  routineRenewal?: boolean;
  routineRenewalStructure?: RoutineRenewalStructureInput;
  /** Internal task context; public HTTP input cannot select the prompt. */
  generationTask?: RoutineGenerationTask<RoutineRenewalStructureInput>;
  /** Internal jobs persist their durable link before dispatching. Not exposed by HTTP schemas. */
  deferDispatch?: boolean;
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
    if (
      command.changeRequest &&
      (command.regenerate || command.routineRenewal)
    ) {
      throw new MissingGenerationInputError(
        'A change request cannot be combined with regeneration or renewal',
      );
    }
    if (
      !command.changeRequest &&
      !command.freeText &&
      !command.parameters &&
      (!command.generationTask || command.generationTask.kind === 'INITIAL')
    ) {
      throw new MissingGenerationInputError();
    }

    const proposedRoutine = command.changeRequest
      ? await this.routineGenerationsRepository.findProposedRoutine(
          command.studentId,
        )
      : null;
    if (command.changeRequest && !proposedRoutine) {
      throw new NoProposedRoutineError();
    }

    const asOf = this.clock.now();
    const studentContext = await this.contextRepository.getStudentContext(
      command.studentId,
      asOf,
    );

    if (!studentContext) {
      throw new StudentNotFoundError(`Student ${command.studentId} not found`);
    }

    const context = goalContext({
      objective: studentContext.minimizedContext.objetivosActivos[0] ?? null,
      experienceLevel: studentContext.minimizedContext.nivelExperiencia,
      availableDaysPerWeek:
        studentContext.minimizedContext.diasSemanalesDisponibles,
    });
    if (!context.sufficient) {
      throw new ContextInsufficientError(context.missing);
    }

    const generationCatalog = await this.contextRepository.getEnabledCatalog(
      studentContext.gymId,
    );
    if (generationCatalog.length === 0)
      throw new EmptyPrefilteredCatalogError(
        'El administrador debe habilitar ejercicios del gimnasio.',
      );

    const muscleCounts = extractMuscleCountRequirements(
      command.freeText ?? null,
    );

    const sortedGenerationCatalog = [...generationCatalog].sort(
      (left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
    );
    const renewalExerciseIds = new Set(
      command.routineRenewalStructure?.days.flatMap((day) =>
        day.exercises.map((exercise) => exercise.exerciseId),
      ) ?? [],
    );
    const orderedGenerationCatalog = command.routineRenewal
      ? [
          ...sortedGenerationCatalog.filter((exercise) =>
            renewalExerciseIds.has(exercise.id),
          ),
          ...sortedGenerationCatalog.filter(
            (exercise) => !renewalExerciseIds.has(exercise.id),
          ),
        ]
      : sortedGenerationCatalog;
    const catalogById = new Map(
      orderedGenerationCatalog.map((exercise, index) => [
        exercise.id,
        { exercise, index },
      ]),
    );
    const mapStructure = (structure: RoutineRenewalStructureInput) => ({
      routine_type: structure.routineType,
      target_weekly_frequency: structure.targetWeeklyFrequency,
      days: structure.days.map((day) => ({
        name: day.name,
        dominant_pattern: day.dominantPattern,
        exercises: day.exercises.map((exercise) => {
          const mapped = catalogById.get(exercise.exerciseId);
          return {
            catalog_index: mapped?.index ?? null,
            exercise_name: mapped?.exercise.nombre ?? null,
            note: exercise.note,
            sets: exercise.sets.map((set) => ({
              min_repetitions: set.minRepetitions,
              max_repetitions: set.maxRepetitions,
              suggested_load: set.suggestedLoad,
              rest_seconds: set.restSeconds,
              warmup: set.warmup,
            })),
          };
        }),
      })),
    });
    const routineRenewalStructure = command.routineRenewalStructure
      ? mapStructure(command.routineRenewalStructure)
      : undefined;
    const task = command.generationTask;
    const generationTask: RoutineGenerationTask | undefined =
      command.changeRequest && proposedRoutine
        ? {
            kind: 'CHANGE_REQUEST',
            change_request: command.changeRequest,
            previous_candidate: mapStructure(proposedRoutine.structure),
          }
        : task?.kind === 'TRAINER_REGENERATION' ||
            task?.kind === 'CHANGE_REQUEST'
          ? {
              ...task,
              previous_candidate: mapStructure(task.previous_candidate),
            }
          : (task ??
            (command.routineRenewal ? undefined : { kind: 'INITIAL' }));

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
        ...(muscleCounts.length ? { muscle_counts_per_day: muscleCounts } : {}),
        ...(generationTask ? { generation_task: generationTask } : {}),
        ...(command.routineRenewal ? { routine_renewal: true } : {}),
        ...(command.routineRenewal
          ? { routine_renewal_full_catalog: true }
          : {}),
        ...(studentContext.generationSettings
          ? { gym_generation_settings: studentContext.generationSettings }
          : {}),
        ...(routineRenewalStructure
          ? { routine_renewal_structure: routineRenewalStructure }
          : {}),
        ...replacement,
        ...(proposedRoutine
          ? {
              routine_change_replacement: {
                replaces_proposed_routine_id: proposedRoutine.id,
              },
            }
          : {}),
        prescription_constraints: generationPrescriptionConstraints(),
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
        allowed_catalog: orderedGenerationCatalog.map((exercise) => ({
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

    if (
      !command.deferDispatch &&
      (request.status === 'PENDIENTE' || request.status === 'PROCESANDO')
    ) {
      await this.gateway.dispatchGeneration(request.requestId);
    }

    return request;
  }
}
