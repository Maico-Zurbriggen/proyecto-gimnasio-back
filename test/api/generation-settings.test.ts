import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import type { GenerationSettingsSnapshot } from '../../src/modules/gyms/domain/generation-settings';

const policy = {
  minExercisesPerDay: 4,
  maxExercisesPerDay: 6,
  minWorkSetsPerExercise: 3,
  maxWorkSetsPerExercise: 4,
  minRepetitions: 8,
  maxRepetitions: 12,
  minRestSeconds: 60,
  maxRestSeconds: 120,
  warmupSetsPerExercise: 0,
};
function setup() {
  const values = new Map<string, GenerationSettingsSnapshot>();
  const app = createApp({
    generationSettingsRepository: {
      get: async (gymId) =>
        values.get(gymId) ?? { settings: null, revision: 0 },
      save: async (gymId, _actorId, settings, revision) => {
        const result = { settings, revision: revision + 1 };
        values.set(gymId, result);
        return result;
      },
    },
  });
  return { app, values };
}
describe('gym generation settings HTTP authorization', () => {
  it('requires authentication and restricts writes to administrators', async () => {
    const { app, values } = setup();
    await request(app).get('/gyms/me/generation-settings').expect(401);
    for (const role of ['ALUMNO', 'ENTRENADOR'])
      await request(app)
        .put('/gyms/me/generation-settings')
        .set('x-user-id', 'staff')
        .set('x-user-roles', role)
        .send({ settings: policy, revision: 0 })
        .expect(403);
    expect(values.size).toBe(0);
  });
  it('uses only the session gym and allows the trainer to read its policy', async () => {
    const { app } = setup();
    await request(app)
      .put('/gyms/me/generation-settings')
      .set('x-user-id', 'admin')
      .set('x-user-roles', 'ADMINISTRADOR')
      .set('x-gym-id', 'gym-a')
      .send({ settings: policy, revision: 0 })
      .expect(200);
    const own = await request(app)
      .get('/gyms/me/generation-settings')
      .set('x-user-id', 'trainer')
      .set('x-user-roles', 'ENTRENADOR')
      .set('x-gym-id', 'gym-a')
      .expect(200);
    expect(own.body.settings).toEqual(policy);
    const other = await request(app)
      .get('/gyms/me/generation-settings')
      .set('x-user-id', 'admin-b')
      .set('x-user-roles', 'ADMINISTRADOR')
      .set('x-gym-id', 'gym-b')
      .expect(200);
    expect(other.body.settings).toBeNull();
    await request(app)
      .put('/gyms/me/generation-settings')
      .set('x-user-id', 'admin')
      .set('x-user-roles', 'ADMINISTRADOR')
      .set('x-gym-id', 'gym-a')
      .send({ settings: policy, revision: 1, gymId: 'gym-b' })
      .expect(400);
  });
  it('rejects inverted ranges, fractions and policies exceeding transport capacity', async () => {
    const { app, values } = setup();
    const save = (settings: unknown) =>
      request(app)
        .put('/gyms/me/generation-settings')
        .set('x-user-id', 'admin')
        .set('x-user-roles', 'ADMINISTRADOR')
        .send({ settings, revision: 0 });
    await save({ ...policy, minRepetitions: 20 }).expect(400);
    await save({ ...policy, maxWorkSetsPerExercise: 3.5 }).expect(400);
    const response = await save({
      ...policy,
      maxExercisesPerDay: 20,
      maxWorkSetsPerExercise: 10,
    }).expect(400);
    expect(response.body.error).toBe('generation_settings_exceed_capacity');
    expect(values.size).toBe(0);
  });
});
