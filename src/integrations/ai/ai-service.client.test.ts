import { describe, expect, it, vi } from 'vitest';

import { AiServiceClient, AiServiceError } from './ai-service.client';

const requestId = '83271cf7-9264-47b5-b85f-d09f05c99326';

describe('AiServiceClient', () => {
  it('dispatches an existing generation request with service authentication', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          request_id: requestId,
          status: 'queued',
          message_id: 'msg_123',
        },
        { status: 202 },
      ),
    );
    const client = new AiServiceClient({
      baseUrl: 'https://gym-ia.example.test/',
      apiKey: 'test-secret',
      fetchImplementation,
    });

    await expect(client.dispatchGeneration(requestId)).resolves.toEqual({
      requestId,
      messageId: 'msg_123',
    });
    expect(fetchImplementation).toHaveBeenCalledWith(
      `https://gym-ia.example.test/v1/generation-requests/${requestId}/dispatch`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer test-secret',
        }),
      }),
    );
  });

  it('rejects a non-accepted response', async () => {
    const client = new AiServiceClient({
      baseUrl: 'https://gym-ia.example.test',
      apiKey: 'test-secret',
      fetchImplementation: vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json({ detail: 'unauthorized' }, { status: 401 }),
        ),
    });

    await expect(client.dispatchGeneration(requestId)).rejects.toMatchObject({
      name: AiServiceError.name,
      statusCode: 401,
    });
  });

  it('rejects a malformed accepted response', async () => {
    const client = new AiServiceClient({
      baseUrl: 'https://gym-ia.example.test',
      apiKey: 'test-secret',
      fetchImplementation: vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json({ status: 'queued' }, { status: 202 }),
        ),
    });

    await expect(client.dispatchGeneration(requestId)).rejects.toThrow(
      'AI service returned an invalid response',
    );
  });
});
