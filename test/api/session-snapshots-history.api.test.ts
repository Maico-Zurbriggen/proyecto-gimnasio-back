import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import type { TrainingSessionsRepository } from '../../src/modules/training-sessions/application/ports/training-sessions.repository';
import {
  decodeSessionCursor,
  encodeSessionCursor,
} from '../../src/modules/training-sessions/infrastructure/session-cursor';

const student = '11111111-1111-4111-a111-111111111111';
const trainer = '99999999-9999-4999-a999-999999999999';
const session = '22222222-2222-4222-a222-222222222222';
const base = `/students/${student}/training-sessions`;
const clock = { now: () => new Date('2026-10-22T03:00:00Z') };

function setup() {
  const repository: TrainingSessionsRepository = {
    start: vi.fn(),
    findActive: vi.fn(),
    updateSeries: vi.fn(),
    finish: vi.fn(),
    abandon: vi.fn(),
    expireInactive: vi.fn(),
    list: vi.fn().mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      nextCursor: null,
    }),
    getById: vi.fn(),
  };
  const assignments = { isActive: vi.fn().mockResolvedValue(true) };
  return {
    repository,
    assignments,
    app: createApp({
      trainingSessionsRepository: repository,
      trainerAssignments: assignments,
      clock,
    }),
  };
}

describe('HU21 immutable prescription at the HTTP boundary', () => {
  it.each([
    'prescribedExerciseId',
    'prescribedExerciseName',
    'prescribedMinRepetitions',
    'prescribedMaxRepetitions',
    'prescribedLoad',
    'prescribedRestSeconds',
    'prescribedExercisePosition',
    'prescribedSetPosition',
    'prescribedNote',
    'warmup',
    'routineVersionId',
  ])('rejects a PATCH containing %s before persistence', async (field) => {
    const { app, repository } = setup();
    await request(app)
      .patch(`${base}/${session}/records/1`)
      .set('x-user-id', student)
      .send({ [field]: 1, completed: false })
      .expect(400);
    expect(repository.updateSeries).not.toHaveBeenCalled();
  });
  it.each(['', `/${session}/finish`, `/${session}/abandon`])(
    'rejects POST attempts to alter prescription at %s',
    async (suffix) => {
      const { app, repository } = setup();
      await request(app)
        .post(base + suffix)
        .set('x-user-id', student)
        .send({ prescribedLoad: 10 })
        .expect(400);
      expect(repository.start).not.toHaveBeenCalled();
      expect(repository.finish).not.toHaveBeenCalled();
      expect(repository.abandon).not.toHaveBeenCalled();
    },
  );
});

describe('HU29 history authorization and windows', () => {
  it('allows own history and an assigned trainer, then rejects the trainer after assignment ends', async () => {
    const { app, assignments, repository } = setup();
    await request(app).get(base).set('x-user-id', student).expect(200);
    await request(app)
      .get(base)
      .set('x-user-id', trainer)
      .set('x-user-roles', 'ENTRENADOR')
      .expect(200);
    assignments.isActive.mockResolvedValue(false);
    await request(app)
      .get(base)
      .set('x-user-id', trainer)
      .set('x-user-roles', 'ENTRENADOR')
      .expect(403);
    await request(app)
      .get(`${base}/${session}`)
      .set('x-user-id', trainer)
      .set('x-user-roles', 'ENTRENADOR')
      .expect(403);
    expect(repository.list).toHaveBeenCalledTimes(2);
    expect(repository.getById).not.toHaveBeenCalled();
  });
  it.each([base, `${base}/${session}`])(
    'rejects administrators and foreign students at %s without querying persistence',
    async (url) => {
      const { app, repository } = setup();
      await request(app)
        .get(url)
        .set('x-user-id', trainer)
        .set('x-user-roles', 'ADMINISTRADOR')
        .expect(403);
      const response = await request(app)
        .get(url)
        .set('x-user-id', trainer)
        .set('x-user-roles', 'ALUMNO')
        .expect(403);
      expect(response.body).toEqual({ error: 'forbidden_student_access' });
      expect(repository.list).not.toHaveBeenCalled();
      expect(repository.getById).not.toHaveBeenCalled();
    },
  );
  it.each([
    '?from=2026-02-30',
    '?from=2026-10-22&to=2026-10-01',
    '?cursor=bad',
    '?pageSize=51',
    '?simulated=maybe',
  ])('rejects invalid history filters %s', async (query) => {
    const { app, repository } = setup();
    await request(app)
      .get(base + query)
      .set('x-user-id', student)
      .expect(400);
    expect(repository.list).not.toHaveBeenCalled();
  });
  it('validates cursors and keeps full PostgreSQL timestamp precision', async () => {
    const token = encodeSessionCursor({
      id: session,
      occurredOn: new Date('2026-10-21'),
      startedAt: '2026-10-22T02:30:00.123456Z',
    });
    expect(decodeSessionCursor(token)!.startedAt).toBe(
      '2026-10-22T02:30:00.123456Z',
    );
    expect(
      decodeSessionCursor(Buffer.from('{"id":"unsafe"}').toString('base64url')),
    ).toBeNull();
    const { app, repository } = setup();
    await request(app)
      .get(`${base}?cursor=${token}&simulated=false`)
      .set('x-user-id', student)
      .expect(200);
    expect(repository.list).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: token, simulated: false }),
    );
    await request(app)
      .get(`${base}?cursor=${token}&page=2`)
      .set('x-user-id', student)
      .expect(400);
  });
});
