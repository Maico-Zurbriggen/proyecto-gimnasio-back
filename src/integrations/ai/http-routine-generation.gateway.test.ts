import { describe, expect, it, vi } from 'vitest';

import { RoutineGenerationUnavailableError } from '../../modules/routine-generations/domain/errors/routine-generation-errors';
import { HttpRoutineGenerationGateway } from './http-routine-generation.gateway';

describe('HttpRoutineGenerationGateway', () => {
  const requestId = '83271cf7-9264-47b5-b85f-d09f05c99326';

  function fakeResponse(status: number, body: unknown = {}): Response {
    return {
      status,
      json: () => Promise.resolve(body),
    } as unknown as Response;
  }

  function gateway(fetchImpl: typeof fetch) {
    return new HttpRoutineGenerationGateway({
      baseUrl: 'https://ai.example/',
      apiKey: 'test-key',
      requestTimeoutMs: 1000,
      maxRetries: 1,
      fetchImpl,
    });
  }

  it('dispatches only the existing UUID with Bearer authentication', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      fakeResponse(202, {
        request_id: requestId,
        status: 'queued',
        message_id: 'msg_123',
      }),
    );

    await gateway(fetchImpl).dispatchGeneration(requestId);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `https://ai.example/v1/generation-requests/${requestId}/dispatch`,
    );
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer test-key' });
    expect(init.body).toBeUndefined();
  });

  it('retries a temporary AI service failure once', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse(503))
      .mockResolvedValueOnce(
        fakeResponse(202, { request_id: requestId, status: 'queued' }),
      );

    await gateway(fetchImpl).dispatchGeneration(requestId);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('does not retry an invalid credential response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(401));

    await expect(
      gateway(fetchImpl).dispatchGeneration(requestId),
    ).rejects.toBeInstanceOf(RoutineGenerationUnavailableError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('throws RoutineGenerationUnavailableError after network retries', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'));

    await expect(
      gateway(fetchImpl).dispatchGeneration(requestId),
    ).rejects.toBeInstanceOf(RoutineGenerationUnavailableError);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('rejects missing service configuration without calling fetch', async () => {
    const fetchImpl = vi.fn();
    const client = new HttpRoutineGenerationGateway({
      baseUrl: '',
      apiKey: '',
      requestTimeoutMs: 1000,
      maxRetries: 1,
      fetchImpl,
    });

    await expect(client.dispatchGeneration(requestId)).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
