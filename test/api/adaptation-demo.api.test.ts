import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import type { AdaptationDemoRepository } from '../../src/modules/evolution/application/ports/adaptation-demo.repository';
import { AdaptationDemoError } from '../../src/modules/evolution/domain/services/adaptation-demo';

const studentId = '11111111-1111-4111-a111-111111111111';
const trainerId = '33333333-3333-4333-a333-333333333333';
const gymId = '44444444-4444-4444-a444-444444444444';
const now = new Date('2026-11-15T15:00:00Z');
const path = '/demo/adaptations';
function setup(enabled = true, assigned = true) {
  const repository: AdaptationDemoRepository = {
    list: vi.fn(async () => []),
    prepare: vi.fn(async () => {
      throw new AdaptationDemoError('demo_current_routine_required', 409);
    }),
    restore: vi.fn(async () => ({ restored: true })),
  };
  const app = createApp({
    adaptationDemoRepository: repository,
    adaptationDemoEnabled: enabled,
    trainerAssignments: { isActive: vi.fn(async () => assigned) },
    clock: { now: () => now },
  });
  const headers = {
    'x-user-id': trainerId,
    'x-user-roles': 'ENTRENADOR',
    'x-gym-id': gymId,
  };
  return { app, repository, headers };
}

describe('adaptation demo authorization and input', () => {
  it('requires an authenticated trainer on every endpoint', async () => {
    const { app, headers, repository } = setup();
    const agent = request(app);
    for (const suffix of ['', `/${studentId}`, `/${studentId}/restore`]) {
      const method = suffix ? 'post' : 'get';
      await agent[method](path + suffix)
        .send({ scenario: 'ESTIMULO_INSUFICIENTE' })
        .expect(401);
      await agent[method](path + suffix)
        .set({ ...headers, 'x-user-roles': 'ALUMNO' })
        .send({ scenario: 'ESTIMULO_INSUFICIENTE' })
        .expect(403);
    }
    expect(repository.list).not.toHaveBeenCalled();
    expect(repository.prepare).not.toHaveBeenCalled();
    expect(repository.restore).not.toHaveBeenCalled();
  });
  it('is unavailable when the deployment flag is disabled', async () => {
    const { app, headers, repository } = setup(false);
    await request(app).get(path).set(headers).expect(404);
    await request(app)
      .post(`${path}/${studentId}`)
      .set(headers)
      .send({ scenario: 'ESTIMULO_INSUFICIENTE' })
      .expect(404);
    await request(app)
      .post(`${path}/${studentId}/restore`)
      .set(headers)
      .expect(404);
    expect(repository.prepare).not.toHaveBeenCalled();
  });
  it('rejects students not assigned to the trainer before accessing data', async () => {
    const { app, headers, repository } = setup(true, false);
    await request(app)
      .post(`${path}/${studentId}`)
      .set(headers)
      .send({ scenario: 'ESTIMULO_INSUFICIENTE' })
      .expect(403);
    await request(app)
      .post(`${path}/${studentId}/restore`)
      .set(headers)
      .expect(403);
    expect(repository.prepare).not.toHaveBeenCalled();
    expect(repository.restore).not.toHaveBeenCalled();
  });
  it('rejects malformed ids, unknown scenarios and unexpected fields', async () => {
    const { app, headers, repository } = setup();
    for (const body of [
      {},
      { scenario: 'UNKNOWN' },
      { scenario: 'SOBREEXIGENCIA', studentId: 'other' },
    ])
      await request(app)
        .post(`${path}/${studentId}`)
        .set(headers)
        .send(body)
        .expect(400);
    await request(app)
      .post(`${path}/invalid`)
      .set(headers)
      .send({ scenario: 'SOBREEXIGENCIA' })
      .expect(400);
    await request(app).post(`${path}/invalid/restore`).set(headers).expect(400);
    expect(repository.prepare).not.toHaveBeenCalled();
  });
  it('passes the authenticated gym and clock, and reports conflicts without a 500', async () => {
    const { app, headers, repository } = setup();
    await request(app).get(path).set(headers).expect(200, { students: [] });
    expect(repository.list).toHaveBeenCalledWith({ trainerId, gymId });
    await request(app)
      .post(`${path}/${studentId}`)
      .set(headers)
      .send({ scenario: 'ESTIMULO_INSUFICIENTE' })
      .expect(409, { error: 'demo_current_routine_required' });
    expect(repository.prepare).toHaveBeenCalledWith(
      { trainerId, gymId },
      studentId,
      'ESTIMULO_INSUFICIENTE',
      now,
    );
    await request(app)
      .post(`${path}/${studentId}/restore`)
      .set(headers)
      .expect(200, { restored: true });
    expect(repository.restore).toHaveBeenCalledWith(
      { trainerId, gymId },
      studentId,
      now,
    );
  });
});
