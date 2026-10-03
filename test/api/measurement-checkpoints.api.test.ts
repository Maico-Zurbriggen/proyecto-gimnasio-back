import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app';
import type { MeasurementCheckpointsRepository } from '../../src/modules/students/application/ports/measurement-checkpoints.repository';

const originalSecret = process.env.CRON_SECRET;

afterEach(() => {
  if (originalSecret === undefined) {
    delete process.env.CRON_SECRET;
  } else {
    process.env.CRON_SECRET = originalSecret;
  }
});

function buildApp() {
  const repository: MeasurementCheckpointsRepository = {
    evaluateDueCycles: vi.fn().mockResolvedValue({
      checkpointsCreated: 2,
      blocksCreated: 1,
      skippedConcurrentRun: false,
    }),
  };
  return {
    app: createApp({
      measurementCheckpointsRepository: repository,
      clock: { now: () => new Date('2026-09-28T03:15:00Z') },
    }),
    repository,
  };
}

describe('measurement checkpoint job API', () => {
  it('rejects calls when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET;
    const { app, repository } = buildApp();

    await request(app)
      .get('/internal/jobs/measurement-blocks')
      .expect(401, { error: 'unauthorized_job' });
    expect(repository.evaluateDueCycles).not.toHaveBeenCalled();
  });

  it('rejects an invalid bearer credential', async () => {
    process.env.CRON_SECRET = 'a-secure-test-secret';
    const { app } = buildApp();

    await request(app)
      .get('/internal/jobs/measurement-blocks')
      .set('authorization', 'Bearer invalid')
      .expect(401, { error: 'unauthorized_job' });
  });

  it('evaluates due cycles for an authenticated invocation', async () => {
    process.env.CRON_SECRET = 'a-secure-test-secret';
    const { app, repository } = buildApp();

    const response = await request(app)
      .get('/internal/jobs/measurement-blocks')
      .set('authorization', 'Bearer a-secure-test-secret')
      .expect(200);

    expect(repository.evaluateDueCycles).toHaveBeenCalledWith(
      new Date('2026-09-28T03:15:00Z'),
    );
    expect(response.body).toEqual({
      checkpointsCreated: 2,
      blocksCreated: 1,
      skippedConcurrentRun: false,
    });
  });
});
