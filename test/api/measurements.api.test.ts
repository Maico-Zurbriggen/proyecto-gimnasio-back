import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app';
import type {
  MeasurementsRepository,
  RecordMeasurementCommand,
} from '../../src/modules/measurements/application/ports/measurements.repository';

const STUDENT = '11111111-1111-4111-8111-111111111111';
const OTHER_STUDENT = '22222222-2222-4222-8222-222222222222';

const clock = { now: () => new Date('2026-09-17T10:00:00Z') };

/** Repositorio en memoria: registra las llamadas para verificar que no se persista de más. */
function createRepo(exists = true) {
  const calls: RecordMeasurementCommand[] = [];
  const repo: MeasurementsRepository = {
    record: vi.fn(async (command: RecordMeasurementCommand) => {
      calls.push(command);
      if (!exists) {
        return null;
      }
      return {
        studentId: command.studentId,
        weightKg: command.weightKg,
        heightCm: command.heightCm,
        measuredOn: command.measuredOn,
        replacedPrevious: calls.length > 1,
      };
    }),
  };
  return { repo, calls };
}

function post(app: ReturnType<typeof createApp>, studentId = STUDENT) {
  return request(app)
    .post(`/students/${studentId}/measurements`)
    .set('x-user-id', STUDENT)
    .set('x-user-roles', 'ALUMNO');
}

describe('Measurements API - HU02', () => {
  it('Esc. 1: records a valid weight and height', async () => {
    const { repo, calls } = createRepo();
    const app = createApp({ measurementsRepository: repo, clock });

    const response = await post(app)
      .send({ weightKg: 75.5, heightCm: 178 })
      .expect(201);

    expect(response.body.studentId).toBe(STUDENT);
    expect(response.body.weightKg).toBe(75.5);
    expect(response.body.heightCm).toBe(178);
    expect(response.body.measuredOn).toBe('2026-09-17');
    expect(calls).toHaveLength(1);
  });

  it('Esc. 1: a second load the same day replaces the previous one', async () => {
    const { repo, calls } = createRepo();
    const app = createApp({ measurementsRepository: repo, clock });

    await post(app).send({ weightKg: 75, heightCm: 178 }).expect(201);
    const second = await post(app)
      .send({ weightKg: 76.2, heightCm: 178 })
      .expect(201);

    expect(second.body.replacedPrevious).toBe(true);
    expect(second.body.weightKg).toBe(76.2);
    // Misma fecha en ambas cargas: el upsert las colapsa en un registro.
    expect(calls[0]?.measuredOn).toEqual(calls[1]?.measuredOn);
  });

  it('Esc. 1.3: accepts the exact boundary values', async () => {
    const { repo } = createRepo();
    const app = createApp({ measurementsRepository: repo, clock });

    await post(app).send({ weightKg: 20, heightCm: 100 }).expect(201);
    await post(app).send({ weightKg: 250, heightCm: 250 }).expect(201);
  });

  it('Esc. 1.1: rejects a weight below the range without persisting', async () => {
    const { repo, calls } = createRepo();
    const app = createApp({ measurementsRepository: repo, clock });

    const response = await post(app)
      .send({ weightKg: 19.9, heightCm: 178 })
      .expect(400);

    expect(response.body.error).toBeDefined();
    expect(calls).toHaveLength(0);
  });

  it('Esc. 1.1: rejects a weight above the range without persisting', async () => {
    const { repo, calls } = createRepo();
    const app = createApp({ measurementsRepository: repo, clock });

    await post(app).send({ weightKg: 250.1, heightCm: 178 }).expect(400);
    expect(calls).toHaveLength(0);
  });

  it('Esc. 1.2: rejects a height outside the range without persisting', async () => {
    const { repo, calls } = createRepo();
    const app = createApp({ measurementsRepository: repo, clock });

    await post(app).send({ weightKg: 75, heightCm: 99 }).expect(400);
    await post(app).send({ weightKg: 75, heightCm: 251 }).expect(400);
    expect(calls).toHaveLength(0);
  });

  it('rejects absurd values', async () => {
    const { repo, calls } = createRepo();
    const app = createApp({ measurementsRepository: repo, clock });

    await post(app).send({ weightKg: 0, heightCm: 178 }).expect(400);
    await post(app).send({ weightKg: -70, heightCm: 178 }).expect(400);
    await post(app).send({ weightKg: 999, heightCm: 178 }).expect(400);
    expect(calls).toHaveLength(0);
  });

  it('rejects a body with missing fields', async () => {
    const { repo, calls } = createRepo();
    const app = createApp({ measurementsRepository: repo, clock });

    await post(app).send({ weightKg: 75 }).expect(400);
    await post(app).send({}).expect(400);
    expect(calls).toHaveLength(0);
  });

  it('rejects non-numeric values', async () => {
    const { repo, calls } = createRepo();
    const app = createApp({ measurementsRepository: repo, clock });

    await post(app).send({ weightKg: '75', heightCm: 178 }).expect(400);
    expect(calls).toHaveLength(0);
  });

  it('rejects a malformed studentId before reaching the use case', async () => {
    const { repo, calls } = createRepo();
    const app = createApp({ measurementsRepository: repo, clock });

    // La verificación de propiedad corta antes que la de formato: un id ajeno o
    // inválido responde 403 sin revelar si el recurso existe (RA-01, CB-34).
    await request(app)
      .post('/students/not-a-uuid/measurements')
      .set('x-user-id', STUDENT)
      .set('x-user-roles', 'ALUMNO')
      .send({ weightKg: 75, heightCm: 178 })
      .expect(403);

    expect(calls).toHaveLength(0);
  });

  it('returns 403 when a student loads measurements for someone else (RNF-14)', async () => {
    const { repo, calls } = createRepo();
    const app = createApp({ measurementsRepository: repo, clock });

    await post(app, OTHER_STUDENT)
      .send({ weightKg: 75, heightCm: 178 })
      .expect(403);

    expect(calls).toHaveLength(0);
  });

  it('returns 401 when unauthenticated', async () => {
    const { repo } = createRepo();
    const app = createApp({ measurementsRepository: repo, clock });

    await request(app)
      .post(`/students/${STUDENT}/measurements`)
      .send({ weightKg: 75, heightCm: 178 })
      .expect(401);
  });

  it('returns 404 when the student profile does not exist', async () => {
    const { repo } = createRepo(false);
    const app = createApp({ measurementsRepository: repo, clock });

    await post(app).send({ weightKg: 75, heightCm: 178 }).expect(404);
  });
});
