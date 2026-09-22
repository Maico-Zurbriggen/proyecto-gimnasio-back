import { describe, expect, it, vi } from 'vitest';

import { RoutineGenerationUnavailableError } from '../../modules/routine-generations/domain/errors/routine-generation-errors';
import { HttpRoutineGenerationGateway } from './http-routine-generation.gateway';

describe('HttpRoutineGenerationGateway', () => {
  const requestId = '83271cf7-9264-47b5-b85f-d09f05c99326';

  function fakeResponse(status: number, body: unknown): Response {
    return {
      status,
      json: () => Promise.resolve(body),
    } as unknown as Response;
  }

  it('dispatches only the UUID with a Bearer key and returns the queued result', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      fakeResponse(202, {
        request_id: requestId,
        status: 'queued',
        message_id: 'msg_123',
      }),
    );

    const gateway = new HttpRoutineGenerationGateway({
      baseUrl: 'https://ai.example',
      apiKey: 'test-key',
      timeoutMs: 1000,
      maxRetries: 1,
      fetchImpl,
    });

    const result = await gateway.dispatchGeneration(requestId);

    expect(result).toEqual({
      requestId,
      status: 'queued',
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `https://ai.example/v1/generation-requests/${requestId}/dispatch`,
    );
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer test-key',
    });
    expect(init.body).toBeUndefined();
  });

  it('retries once on failure and throws RoutineGenerationUnavailableError after exhausting retries', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'));

    const gateway = new HttpRoutineGenerationGateway({
      baseUrl: 'https://ai.example',
      apiKey: 'test-key',
      timeoutMs: 1000,
      maxRetries: 1,
      fetchImpl,
    });

    await expect(gateway.dispatchGeneration(requestId)).rejects.toBeInstanceOf(
      RoutineGenerationUnavailableError,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('treats a non-202 response as a failure and retries', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        fakeResponse(404, { detail: 'generation_request_not_found' }),
      )
      .mockResolvedValueOnce(
        fakeResponse(202, {
          request_id: requestId,
          status: 'queued',
          message_id: 'msg_123',
        }),
      );

    const gateway = new HttpRoutineGenerationGateway({
      baseUrl: 'https://ai.example',
      apiKey: 'test-key',
      timeoutMs: 1000,
      maxRetries: 1,
      fetchImpl,
    });

    const result = await gateway.dispatchGeneration(requestId);

    expect(result).toEqual({ requestId, status: 'queued' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('throws when baseUrl/apiKey are not configured, without calling fetch', async () => {
    const fetchImpl = vi.fn();

    const gateway = new HttpRoutineGenerationGateway({
      baseUrl: '',
      apiKey: '',
      timeoutMs: 1000,
      maxRetries: 1,
      fetchImpl,
    });

    await expect(gateway.dispatchGeneration(requestId)).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
