import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import type { ExerciseCatalogRepository } from '../../src/modules/exercise-catalog/application/catalog.repository';
import { CatalogError } from '../../src/modules/exercise-catalog/domain/catalog';

const userId = '11111111-1111-4111-8111-111111111111';
const exerciseId = '22222222-2222-4222-8222-222222222222';
function setup() {
  const repository: ExerciseCatalogRepository = {
    taxonomies: vi
      .fn()
      .mockResolvedValue({ equipment: [], muscles: [], joints: [] }),
    list: vi
      .fn()
      .mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 24 }),
    find: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    review: vi.fn(),
    setAvailability: vi.fn().mockResolvedValue({ changed: 0 }),
    inventory: vi.fn().mockResolvedValue({
      equipment: ['PESO_CORPORAL'],
      revision: 0,
      updatedAt: null,
    }),
    setInventory: vi.fn(),
  };
  return {
    repository,
    app: createApp({ exerciseCatalogRepository: repository }),
  };
}
describe('Authenticated catalogue API', () => {
  it('requires a session and administrator role for gym assignments', async () => {
    const { app, repository } = setup();
    await request(app).get('/catalog/exercises').expect(401);
    await request(app)
      .post('/catalog/availability')
      .set('x-user-id', userId)
      .set('x-user-roles', 'ENTRENADOR')
      .send({
        changes: [{ exerciseId, enabled: true, expectedRevision: null }],
      })
      .expect(403);
    expect(repository.setAvailability).not.toHaveBeenCalled();
  });
  it('uses the authenticated gym and rejects caller supplied gym scope or duplicate batch IDs', async () => {
    const { app, repository } = setup();
    const body = {
      changes: [{ exerciseId, enabled: true, expectedRevision: null }],
    };
    await request(app)
      .post('/catalog/availability')
      .set('x-user-id', userId)
      .set('x-user-roles', 'ADMINISTRADOR')
      .set('x-gym-id', 'test-gym')
      .send(body)
      .expect(200);
    expect(repository.setAvailability).toHaveBeenCalledWith(
      expect.objectContaining({ gymId: 'test-gym' }),
      body.changes,
    );
    await request(app)
      .post('/catalog/availability')
      .set('x-user-id', userId)
      .set('x-user-roles', 'ADMINISTRADOR')
      .send({ ...body, gymId: 'foreign' })
      .expect(400);
    await request(app)
      .post('/catalog/availability')
      .set('x-user-id', userId)
      .set('x-user-roles', 'ADMINISTRADOR')
      .send({ changes: [...body.changes, ...body.changes] })
      .expect(400);
  });
  it('returns an actionable conflict and requires a reason when rejecting a proposed exercise', async () => {
    const { app, repository } = setup();
    vi.mocked(repository.setAvailability).mockRejectedValue(
      new CatalogError('availability_conflict', 409),
    );
    const response = await request(app)
      .post('/catalog/availability')
      .set('x-user-id', userId)
      .set('x-user-roles', 'ADMINISTRADOR')
      .send({ changes: [{ exerciseId, enabled: true, expectedRevision: 1 }] })
      .expect(409);
    expect(response.body.error).toBe('availability_conflict');
    await request(app)
      .post(`/catalog/exercises/${exerciseId}/review`)
      .set('x-user-id', userId)
      .set('x-user-roles', 'ADMINISTRADOR')
      .send({ expectedRevision: 1, state: 'RECHAZADO', observation: null })
      .expect(422);
    expect(repository.review).not.toHaveBeenCalled();
  });
});
