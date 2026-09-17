import { describe, expect, it, vi } from 'vitest';

import { RoutineGenerationUnavailableError } from '../../modules/routine-generations/domain/errors/routine-generation-errors';
import type { RoutineGenerationRequestPayload } from '../../modules/routine-generations/application/ports/routine-generation.gateway';
import { HttpRoutineGenerationGateway } from './http-routine-generation.gateway';

describe('HttpRoutineGenerationGateway', () => {
  const payload: RoutineGenerationRequestPayload = {
    idempotencyKey: 'idem-1',
    gymId: 'gym-1',
    studentId: 'student-1',
    requestedByUserId: 'trainer-1',
    freeText: 'quiero ganar fuerza',
    parameters: null,
    prefilteredCatalog: [
      {
        id: 'ex-1',
        nombre: 'Sentadilla',
        patronMovimiento: 'DOMINANTE_RODILLA',
      },
    ],
    minimizedContext: {
      nivelExperiencia: 'intermedio',
      diasSemanalesDisponibles: 3,
      objetivosActivos: ['fuerza'],
      condiciones: [],
    },
  };

  function fakeResponse(status: number, body: unknown): Response {
    return {
      status,
      json: () => Promise.resolve(body),
    } as unknown as Response;
  }

  it('sends the mapped snake_case body with the X-API-Key header and returns the accepted result', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        fakeResponse(202, { request_id: 'req-1', status: 'pending' }),
      );

    const gateway = new HttpRoutineGenerationGateway({
      baseUrl: 'https://ai.example',
      apiKey: 'test-key',
      timeoutMs: 1000,
      maxRetries: 1,
      fetchImpl,
    });

    const result = await gateway.requestGeneration(payload);

    expect(result).toEqual({
      requestId: 'req-1',
      status: 'pending',
      alreadyExisted: false,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://ai.example/v1/routine-generations');
    expect(init.headers).toMatchObject({ 'X-API-Key': 'test-key' });

    const sentBody = JSON.parse(init.body as string);
    expect(sentBody).toEqual({
      idempotency_key: 'idem-1',
      gym_id: 'gym-1',
      student_id: 'student-1',
      requested_by_user_id: 'trainer-1',
      texto_libre: 'quiero ganar fuerza',
      parametros: null,
      catalogo_prefiltrado: [
        {
          id: 'ex-1',
          nombre: 'Sentadilla',
          patron_movimiento: 'DOMINANTE_RODILLA',
        },
      ],
      contexto_minimizado: {
        nivel_experiencia: 'intermedio',
        dias_semanales_disponibles: 3,
        objetivos_activos: ['fuerza'],
        condiciones: [],
      },
    });
  });

  it('marks alreadyExisted=true when the AI service responds 200 (idempotencyKey already existed)', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        fakeResponse(200, { request_id: 'req-1', status: 'processing' }),
      );

    const gateway = new HttpRoutineGenerationGateway({
      baseUrl: 'https://ai.example',
      apiKey: 'test-key',
      timeoutMs: 1000,
      maxRetries: 1,
      fetchImpl,
    });

    const result = await gateway.requestGeneration(payload);

    expect(result.alreadyExisted).toBe(true);
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

    await expect(gateway.requestGeneration(payload)).rejects.toBeInstanceOf(
      RoutineGenerationUnavailableError,
    );
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

    await expect(gateway.requestGeneration(payload)).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
