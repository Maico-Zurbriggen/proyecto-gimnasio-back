import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import type { GoalsRepository } from '../../src/modules/goals/application/ports/goals.repository';

const studentId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const gymId = '99999999-9999-4999-8999-999999999999';
const goal = {
  id: otherId,
  type: 'FUERZA' as const,
  startsOn: new Date('2026-10-09T12:00:00Z'),
  endsOn: null,
};
function setup() {
  const repo: GoalsRepository = {
    read: vi.fn().mockResolvedValue({
      timezone: 'America/Argentina/Buenos_Aires',
      current: null,
      history: [],
      atDate: null,
      context: { sufficient: false, missing: ['objetivo'] },
    }),
    declare: vi.fn().mockResolvedValue({
      goal,
      changed: true,
      timezone: 'America/Argentina/Buenos_Aires',
    }),
  };
  return { repo, app: createApp({ goalsRepository: repo }) };
}
function auth(test: request.Test, role = 'ALUMNO', id = studentId) {
  return test
    .set('x-user-id', id)
    .set('x-gym-id', gymId)
    .set('x-user-roles', role);
}
describe('HU10 goals API permissions and validation', () => {
  it('returns 401 without authentication', async () => {
    const { app, repo } = setup();
    await request(app).get(`/students/${studentId}/goals`).expect(401);
    await request(app)
      .post(`/students/${studentId}/goals`)
      .send({ type: 'FUERZA' })
      .expect(401);
    expect(repo.read).not.toHaveBeenCalled();
    expect(repo.declare).not.toHaveBeenCalled();
  });
  it('exposes explicit null for students without objectives', async () => {
    const { app } = setup();
    const response = await auth(
      request(app).get(`/students/${studentId}/goals`),
    ).expect(200);
    expect(response.body.current).toBeNull();
    expect(response.body.history).toEqual([]);
    expect(response.body.context.missing).toContain('objetivo');
  });
  it('creates the first objective and does not duplicate an idempotent declaration', async () => {
    const { app, repo } = setup();
    await auth(request(app).post(`/students/${studentId}/goals`))
      .send({ type: 'FUERZA' })
      .expect(201);
    vi.mocked(repo.declare).mockResolvedValue({
      goal,
      changed: false,
      timezone: 'America/Argentina/Buenos_Aires',
    });
    const repeated = await auth(
      request(app).post(`/students/${studentId}/goals`),
    )
      .send({ type: 'FUERZA' })
      .expect(200);
    expect(repeated.body.changed).toBe(false);
  });
  it.each(['INVALIDO', '', 'fuerza', null])(
    'rejects an unsupported objective: %s',
    async (type) => {
      const { app, repo } = setup();
      await auth(request(app).post(`/students/${studentId}/goals`))
        .send({ type })
        .expect(400);
      expect(repo.declare).not.toHaveBeenCalled();
    },
  );
  it('allows reading only the student’s own data', async () => {
    const { app, repo } = setup();
    await auth(request(app).get(`/students/${otherId}/goals`)).expect(403);
    await auth(request(app).post(`/students/${otherId}/goals`))
      .send({ type: 'FUERZA' })
      .expect(403);
    expect(repo.read).not.toHaveBeenCalled();
    expect(repo.declare).not.toHaveBeenCalled();
  });
  it.each(['ENTRENADOR', 'ADMINISTRADOR'])(
    'rejects %s writes and administrator reads',
    async (role) => {
      const { app, repo } = setup();
      await auth(
        request(app).post(`/students/${studentId}/goals`),
        role,
        otherId,
      )
        .send({ type: 'FUERZA' })
        .expect(403);
      expect(repo.declare).not.toHaveBeenCalled();
      if (role === 'ADMINISTRADOR')
        await auth(
          request(app).get(`/students/${studentId}/goals`),
          role,
          otherId,
        ).expect(403);
    },
  );
  it('allows an assigned trainer and immediately rejects reads after authorization is lost', async () => {
    const { app, repo } = setup();
    await auth(
      request(app).get(`/students/${studentId}/goals`),
      'ENTRENADOR',
      otherId,
    ).expect(200);
    vi.mocked(repo.read).mockResolvedValue(null);
    await auth(
      request(app).get(`/students/${studentId}/goals`),
      'ENTRENADOR',
      otherId,
    ).expect(403);
  });
  it('passes local dates and explicit offset instants, and rejects ambiguous datetimes', async () => {
    const { app, repo } = setup();
    await auth(
      request(app).get(`/students/${studentId}/goals?at=2026-10-09`),
    ).expect(200);
    expect(repo.read).toHaveBeenCalledWith(
      expect.objectContaining({ id: studentId, gymId }),
      studentId,
      '2026-10-09',
    );
    await auth(
      request(app)
        .get(`/students/${studentId}/goals`)
        .query({ at: '2026-10-09T09:00:00-03:00' }),
    ).expect(200);
    for (const at of ['2026-02-30', 'garbage', '2026-10-09T09:00:00'])
      await auth(
        request(app).get(`/students/${studentId}/goals`).query({ at }),
      ).expect(400);
  });
});
