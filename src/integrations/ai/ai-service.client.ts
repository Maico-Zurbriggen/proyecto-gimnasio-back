import { z } from 'zod';

const dispatchResponseSchema = z.object({
  request_id: z.uuid(),
  status: z.literal('queued'),
  message_id: z.string().nullable(),
});

export interface DispatchGenerationResult {
  requestId: string;
  messageId: string | null;
}

export class AiServiceError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'AiServiceError';
  }
}

interface AiServiceClientOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  fetchImplementation?: typeof fetch;
}

export class AiServiceClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly fetchImplementation: typeof fetch;

  constructor({
    baseUrl,
    apiKey,
    timeoutMs = 10_000,
    fetchImplementation = fetch,
  }: AiServiceClientOptions) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
    this.fetchImplementation = fetchImplementation;
  }

  async dispatchGeneration(
    generationRequestId: string,
  ): Promise<DispatchGenerationResult> {
    let response: Response;
    try {
      response = await this.fetchImplementation(
        `${this.baseUrl}/v1/generation-requests/${encodeURIComponent(generationRequestId)}/dispatch`,
        {
          method: 'POST',
          headers: {
            accept: 'application/json',
            authorization: `Bearer ${this.apiKey}`,
          },
          signal: AbortSignal.timeout(this.timeoutMs),
        },
      );
    } catch (error) {
      throw new AiServiceError('AI service is unreachable', undefined, {
        cause: error,
      });
    }

    if (response.status !== 202) {
      throw new AiServiceError(
        `AI service rejected generation dispatch with status ${response.status}`,
        response.status,
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      throw new AiServiceError(
        'AI service returned an invalid response',
        undefined,
        {
          cause: error,
        },
      );
    }

    const parsed = dispatchResponseSchema.safeParse(payload);
    if (!parsed.success || parsed.data.request_id !== generationRequestId) {
      throw new AiServiceError('AI service returned an invalid response');
    }

    return {
      requestId: parsed.data.request_id,
      messageId: parsed.data.message_id,
    };
  }
}
