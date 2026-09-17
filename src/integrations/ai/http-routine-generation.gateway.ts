import { RoutineGenerationUnavailableError } from '../../modules/routine-generations/domain/errors/routine-generation-errors';
import type {
  RoutineGenerationAcceptedResult,
  RoutineGenerationGateway,
  RoutineGenerationRequestPayload,
} from '../../modules/routine-generations/application/ports/routine-generation.gateway';

type FetchLike = typeof fetch;

export interface HttpRoutineGenerationGatewayConfig {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  maxRetries: number;
  fetchImpl?: FetchLike;
}

interface AiServiceRequestBody {
  idempotency_key: string;
  gym_id: string;
  student_id: string;
  requested_by_user_id: string;
  texto_libre: string | null;
  parametros: {
    objetivo: string;
    frecuencia_semanal: number;
    duracion_minutos: number;
    restricciones: string[];
    confianza: number;
  } | null;
  catalogo_prefiltrado: Array<{
    id: string;
    nombre: string;
    patron_movimiento: string;
  }>;
  contexto_minimizado: {
    nivel_experiencia: string;
    dias_semanales_disponibles: number;
    objetivos_activos: string[];
    condiciones: string[];
  };
}

interface AiServiceResponseBody {
  request_id: string;
  status: string;
}

function toAiServiceRequestBody(
  payload: RoutineGenerationRequestPayload,
): AiServiceRequestBody {
  return {
    idempotency_key: payload.idempotencyKey,
    gym_id: payload.gymId,
    student_id: payload.studentId,
    requested_by_user_id: payload.requestedByUserId,
    texto_libre: payload.freeText,
    parametros: payload.parameters
      ? {
          objetivo: payload.parameters.objetivo,
          frecuencia_semanal: payload.parameters.frecuenciaSemanal,
          duracion_minutos: payload.parameters.duracionMinutos,
          restricciones: payload.parameters.restricciones,
          confianza: payload.parameters.confianza,
        }
      : null,
    catalogo_prefiltrado: payload.prefilteredCatalog.map((exercise) => ({
      id: exercise.id,
      nombre: exercise.nombre,
      patron_movimiento: exercise.patronMovimiento,
    })),
    contexto_minimizado: {
      nivel_experiencia: payload.minimizedContext.nivelExperiencia,
      dias_semanales_disponibles:
        payload.minimizedContext.diasSemanalesDisponibles,
      objetivos_activos: payload.minimizedContext.objetivosActivos,
      condiciones: payload.minimizedContext.condiciones,
    },
  };
}

export class HttpRoutineGenerationGateway implements RoutineGenerationGateway {
  constructor(private readonly config: HttpRoutineGenerationGatewayConfig) {}

  async requestGeneration(
    payload: RoutineGenerationRequestPayload,
  ): Promise<RoutineGenerationAcceptedResult> {
    if (!this.config.baseUrl || !this.config.apiKey) {
      throw new Error(
        'AI_SERVICE_URL and AI_SERVICE_API_KEY must be configured to reach the AI service',
      );
    }

    const body = toAiServiceRequestBody(payload);
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      try {
        return await this.postOnce(body);
      } catch (error) {
        lastError = error;
      }
    }

    throw new RoutineGenerationUnavailableError(
      'AI service unavailable after exhausting retries',
      { cause: lastError },
    );
  }

  private async postOnce(
    body: AiServiceRequestBody,
  ): Promise<RoutineGenerationAcceptedResult> {
    const fetchImpl = this.config.fetchImpl ?? fetch;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetchImpl(
        `${this.config.baseUrl}/v1/routine-generations`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': this.config.apiKey,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        },
      );

      if (response.status !== 200 && response.status !== 202) {
        throw new Error(
          `Unexpected AI service response status: ${response.status}`,
        );
      }

      const data = (await response.json()) as AiServiceResponseBody;

      return {
        requestId: data.request_id,
        status: data.status,
        alreadyExisted: response.status === 200,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createRoutineGenerationGatewayFromEnv(): HttpRoutineGenerationGateway {
  const timeoutSeconds = Number(
    process.env.AI_GENERATION_TIMEOUT_SECONDS ?? '120',
  );
  const maxRetries = Number(process.env.AI_GENERATION_MAX_RETRIES ?? '1');

  // baseUrl/apiKey se validan recién al llamar requestGeneration(), no acá:
  // esta factory corre en createApp() por defecto y no debe romper el
  // arranque (ni los tests que no configuran AI_SERVICE_*) por variables
  // de entorno ausentes hasta que el endpoint realmente se use.
  return new HttpRoutineGenerationGateway({
    baseUrl: process.env.AI_SERVICE_URL ?? '',
    apiKey: process.env.AI_SERVICE_API_KEY ?? '',
    timeoutMs: timeoutSeconds * 1000,
    maxRetries,
  });
}
