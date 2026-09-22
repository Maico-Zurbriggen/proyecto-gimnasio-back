import { createHash } from 'node:crypto';

import type { Clock } from '../../../routines/application/ports/clock';
import {
  EmptyPrefilteredCatalogError,
  MissingGenerationInputError,
  RoutineGenerationAlreadyExistsError,
  RoutineGenerationUnavailableError,
  StudentNotFoundError,
} from '../../domain/errors/routine-generation-errors';
import type {
  CatalogExerciseRef,
  MinimizedContext,
  RoutineGenerationParameters,
} from '../dto/routine-generation-context.dto';
import type { GenerationContextRepository } from '../ports/generation-context.repository';
import type { IdGenerator } from '../ports/id-generator';
import type {
  DispatchGenerationResult,
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

const TERMINAL_REQUEST_STATES = new Set([
  'COMPLETADA',
  'NO_DISPONIBLE',
  'CANCELADA',
]);

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

function toStableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => toStableJson(item)).join(',')}]`;
  }

  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${toStableJson(item)}`);
    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(value) ?? 'null';
}

export function hashGenerationInput(
  minimizedContext: Record<string, unknown>,
  preferences: Record<string, unknown>,
): string {
  const canonical = toStableJson({
    minimized_context: minimizedContext,
    preferences,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

function toMinimizedContextPayload(
  minimizedContext: MinimizedContext,
): Record<string, unknown> {
  return {
    nivel_experiencia: minimizedContext.nivelExperiencia,
    dias_semanales_disponibles: minimizedContext.diasSemanalesDisponibles,
    objetivos_activos: minimizedContext.objetivosActivos,
    condiciones: minimizedContext.condiciones,
  };
}

function toPreferencesPayload(
  freeText: string | null,
  parameters: RoutineGenerationParameters | null,
  prefilteredCatalog: CatalogExerciseRef[],
): Record<string, unknown> {
  return {
    texto_libre: freeText,
    parametros: parameters
      ? {
          objetivo: parameters.objetivo,
          frecuencia_semanal: parameters.frecuenciaSemanal,
          duracion_minutos: parameters.duracionMinutos,
          restricciones: parameters.restricciones,
          confianza: parameters.confianza,
        }
      : null,
    catalogo_prefiltrado: prefilteredCatalog.map((exercise) => ({
      id: exercise.id,
      nombre: exercise.nombre,
      patron_movimiento: exercise.patronMovimiento,
    })),
  };
}

export class RequestRoutineGenerationUseCase {
  constructor(
    private readonly contextRepository: GenerationContextRepository,
    private readonly generationsRepository: RoutineGenerationsRepository,
    private readonly gateway: RoutineGenerationGateway,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
    private readonly retentionDays: number,
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

    const idempotencyKey =
      command.idempotencyKey ?? this.idGenerator.generate();
    const existing =
      await this.generationsRepository.findByIdempotencyKey(idempotencyKey);

    let record = existing;
    let alreadyExisted = record !== null;

    if (!record) {
      const minimizedContext = toMinimizedContextPayload(
        studentContext.minimizedContext,
      );
      const preferences = toPreferencesPayload(
        command.freeText ?? null,
        command.parameters ?? null,
        prefilteredCatalog,
      );

      try {
        record = await this.generationsRepository.create({
          idempotencyKey,
          minimizedContext,
          preferences,
          contextHash: hashGenerationInput(minimizedContext, preferences),
          studentId: command.studentId,
          requestedByUserId: command.requestedByUserId,
          retentionUntil: new Date(
            this.clock.now().getTime() +
              this.retentionDays * MILLISECONDS_PER_DAY,
          ),
        });
      } catch (error) {
        if (!(error instanceof RoutineGenerationAlreadyExistsError)) {
          throw error;
        }

        const raced =
          await this.generationsRepository.findByIdempotencyKey(idempotencyKey);

        if (!raced) {
          throw error;
        }

        record = raced;
        alreadyExisted = true;
      }
    }

    if (TERMINAL_REQUEST_STATES.has(record.status)) {
      return {
        requestId: record.requestId,
        status: record.status,
        alreadyExisted: true,
      };
    }

    let dispatched: DispatchGenerationResult;
    try {
      dispatched = await this.gateway.dispatchGeneration(record.requestId);
    } catch (error) {
      if (error instanceof RoutineGenerationUnavailableError) {
        throw new RoutineGenerationUnavailableError(error.message, {
          cause: error,
          requestId: record.requestId,
          requestStatus: record.status,
        });
      }
      throw error;
    }

    return {
      requestId: dispatched.requestId,
      status: dispatched.status,
      alreadyExisted,
    };
  }
}
