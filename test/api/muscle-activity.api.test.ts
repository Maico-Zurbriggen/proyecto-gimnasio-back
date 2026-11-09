import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import type { MuscleActivityRepository } from '../../src/modules/indicators/application/muscle-activity.use-case';

const studentId = '20000000-0000-4000-8000-000000000004';
const trainerId = '20000000-0000-4000-8000-000000000002';
const period = '?from=2026-10-01&to=2026-10-22';
const url = `/students/${studentId}/indicators/muscle-activity`;
const clock = { now: () => new Date('2026-10-22T15:00:00Z') };

function setup(assigned = false, denied = false) {
  const repository: MuscleActivityRepository = {
    aggregate: vi.fn().mockResolvedValue(
      denied
        ? null
        : {
            timezone: 'America/Argentina/Buenos_Aires',
            sessionCount: 1,
            aggregates: [
              {
                group: 'PECTORAL',
                primarySets: 3,
                secondarySets: 0,
                sessions: 1,
              },
            ],
            exercises: [
              {
                exerciseId: 'press',
                completedWorkSets: 3,
                sessions: 1,
                muscles: [{ group: 'PECTORAL', participation: 'PRIMARIA' }],
              },
            ],
          },
    ),
  };
  const assignments = { isActive: vi.fn().mockResolvedValue(assigned) };
  const app = createApp({
    muscleActivityRepository: repository,
    trainerAssignments: assignments,
    clock,
  });
  return { app, repository, assignments };
}

describe('HU25 muscle activity API', () => {
  it('allows the owner and forwards occurrence dates and identity to persistence', async () => {
    const { app, repository } = setup();
    const response = await request(app)
      .get(url + period)
      .set('x-user-id', studentId)
      .expect(200);
    expect(response.body.groups[0]).toMatchObject({ volume: 3, frequency: 1 });
    expect(repository.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId,
        from: '2026-10-01',
        to: '2026-10-22',
        now: clock.now(),
      }),
    );
  });
  it('allows only an assigned trainer and revokes access immediately', async () => {
    const { app, assignments, repository } = setup(true);
    await request(app)
      .get(url + period)
      .set('x-user-id', trainerId)
      .set('x-user-roles', 'ENTRENADOR')
      .expect(200);
    assignments.isActive.mockResolvedValue(false);
    await request(app)
      .get(url + period)
      .set('x-user-id', trainerId)
      .set('x-user-roles', 'ENTRENADOR')
      .expect(403);
    expect(repository.aggregate).toHaveBeenCalledTimes(1);
  });
  it.each(['ADMINISTRADOR', 'SUPERADMIN'])(
    'rejects the role %s',
    async (role) => {
      const { app, repository } = setup();
      await request(app)
        .get(url + period)
        .set('x-user-id', trainerId)
        .set('x-user-roles', role)
        .expect(403);
      expect(repository.aggregate).not.toHaveBeenCalled();
    },
  );
  it('rejects a foreign student without exposing existence and rejects unauthenticated requests', async () => {
    const { app, repository } = setup();
    await request(app)
      .get(url + period)
      .set('x-user-id', trainerId)
      .expect(403);
    await request(app)
      .get(url + period)
      .expect(401);
    expect(repository.aggregate).not.toHaveBeenCalled();
  });
  it.each([
    '',
    '?from=2026-02-30&to=2026-03-01',
    '?from=2026-10-22&to=2026-10-01',
    '?from=bad&to=2026-10-22',
  ])('rejects invalid periods %s', async (query) => {
    const { app, repository } = setup();
    await request(app)
      .get(url + query)
      .set('x-user-id', studentId)
      .expect(400);
    expect(repository.aggregate).not.toHaveBeenCalled();
  });
  it('returns a generic denial when the tenant or resource authorization fails', async () => {
    const { app } = setup(false, true);
    const response = await request(app)
      .get(url + period)
      .set('x-user-id', studentId)
      .expect(403);
    expect(response.body).toEqual({ error: 'forbidden_student_access' });
  });
});
