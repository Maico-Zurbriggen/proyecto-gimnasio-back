import { RoutineGenerationUnavailableError } from '../../modules/routine-generations/domain/errors/routine-generation-errors';
import type {
  DispatchGenerationResult,
  RoutineGenerationGateway,
} from '../../modules/routine-generations/application/ports/routine-generation.gateway';

type FetchLike = typeof fetch;

export interface HttpRoutineGenerationGatewayConfig {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  maxRetries: number;
  fetchImpl?: FetchLike;
}

interface AiServiceDispatchBody {
  request_id: string;
  status: string;
  message_id: string | null;
}

export class HttpRoutineGenerationGateway implements RoutineGenerationGateway {
  constructor(private readonly config: HttpRoutineGenerationGatewayConfig) {}

  async dispatchGeneration(
    requestId: string,
  ): Promise<DispatchGenerationResult> {
    if (!this.config.baseUrl || !this.config.apiKey) {
      throw new Error(
        'AI_SERVICE_URL and AI_SERVICE_API_KEY must be configured to reach the AI service',
      );
    }

    let lastError: unknown;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      try {
        return await this.postOnce(requestId);
      } catch (error) {
        lastError = error;
      }
    }

    throw new RoutineGenerationUnavailableError(
      'AI service unavailable after exhausting retries',
      { cause: lastError },
    );
  }

  private async postOnce(requestId: string): Promise<DispatchGenerationResult> {
    const fetchImpl = this.config.fetchImpl ?? fetch;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetchImpl(
        `${this.config.baseUrl}/v1/generation-requests/${requestId}/dispatch`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          signal: controller.signal,
        },
      );

      if (response.status !== 202) {
        throw new Error(
          `Unexpected AI service response status: ${response.status}`,
        );
      }

      const data = (await response.json()) as AiServiceDispatchBody;

      return {
        requestId: data.request_id,
        status: data.status,
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

  // baseUrl/apiKey se validan recién al llamar dispatchGeneration(), no acá:
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
