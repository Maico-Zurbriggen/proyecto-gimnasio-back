import { z } from 'zod';

import { RoutineGenerationUnavailableError } from '../../modules/routine-generations/domain/errors/routine-generation-errors';
import type { RoutineGenerationGateway } from '../../modules/routine-generations/application/ports/routine-generation.gateway';

type FetchLike = typeof fetch;

export interface HttpRoutineGenerationGatewayConfig {
  baseUrl: string;
  apiKey: string;
  requestTimeoutMs: number;
  maxRetries: number;
  fetchImpl?: FetchLike;
}

const dispatchResponseSchema = z.object({
  request_id: z.string().uuid(),
  status: z.literal('queued'),
  message_id: z.string().nullable().optional(),
});

class NonRetryableGatewayError extends Error {}

export class HttpRoutineGenerationGateway implements RoutineGenerationGateway {
  private readonly config: HttpRoutineGenerationGatewayConfig;

  constructor(config: HttpRoutineGenerationGatewayConfig) {
    this.config = {
      ...config,
      baseUrl: config.baseUrl.replace(/\/+$/, ''),
    };
  }

  async dispatchGeneration(requestId: string): Promise<void> {
    if (!this.config.baseUrl || !this.config.apiKey) {
      throw new Error(
        'AI_SERVICE_URL and AI_SERVICE_API_KEY must be configured to reach the AI service',
      );
    }

    let lastError: unknown;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      try {
        await this.postOnce(requestId);
        return;
      } catch (error) {
        lastError = error;
        if (error instanceof NonRetryableGatewayError) break;
      }
    }

    throw new RoutineGenerationUnavailableError(
      'AI service unavailable after exhausting retries',
      { cause: lastError },
    );
  }

  private async postOnce(requestId: string): Promise<void> {
    const fetchImpl = this.config.fetchImpl ?? fetch;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.requestTimeoutMs,
    );

    try {
      const response = await fetchImpl(
        `${this.config.baseUrl}/v1/generation-requests/${encodeURIComponent(requestId)}/dispatch`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          signal: controller.signal,
        },
      );

      if (response.status !== 202) {
        if (
          response.status < 500 &&
          response.status !== 408 &&
          response.status !== 429
        ) {
          throw new NonRetryableGatewayError(
            `Unexpected AI service response status: ${response.status}`,
          );
        }
        throw new Error(`AI service response status: ${response.status}`);
      }

      const data = dispatchResponseSchema.safeParse(await response.json());
      if (!data.success || data.data.request_id !== requestId) {
        throw new NonRetryableGatewayError('Invalid AI dispatch response');
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createRoutineGenerationGatewayFromEnv(): HttpRoutineGenerationGateway {
  const requestTimeoutMs = Number(
    process.env.AI_SERVICE_REQUEST_TIMEOUT_MS ?? '10000',
  );
  const maxRetries = Number(process.env.AI_SERVICE_MAX_RETRIES ?? '1');

  // baseUrl/apiKey se validan recién al llamar dispatchGeneration(), no acá:
  // esta factory corre en createApp() por defecto y no debe romper el
  // arranque (ni los tests que no configuran AI_SERVICE_*) por variables
  // de entorno ausentes hasta que el endpoint realmente se use.
  return new HttpRoutineGenerationGateway({
    baseUrl: process.env.AI_SERVICE_URL ?? '',
    apiKey: process.env.AI_SERVICE_API_KEY ?? '',
    requestTimeoutMs:
      Number.isInteger(requestTimeoutMs) && requestTimeoutMs > 0
        ? requestTimeoutMs
        : 10_000,
    maxRetries,
  });
}
