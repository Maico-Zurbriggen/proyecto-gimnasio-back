import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('local seed login command boundaries', () => {
  it.each([
    {
      name: 'remote database',
      databaseUrl: 'postgresql://unused@remote.example.test:1/gym_local',
      args: ['admin.test@gimnasio.test'],
      message: 'only supports the local gym_local database',
    },
    {
      name: 'another database',
      databaseUrl: 'postgresql://unused@127.0.0.1:1/another_database',
      args: ['admin.test@gimnasio.test'],
      message: 'only supports the local gym_local database',
    },
    {
      name: 'a mismatched local port',
      databaseUrl: 'postgresql://unused@127.0.0.1:2/gym_local',
      args: ['admin.test@gimnasio.test'],
      message: 'only supports the local gym_local database',
    },
    {
      name: 'an account outside the seed',
      databaseUrl: 'postgresql://unused@127.0.0.1:1/gym_local',
      args: ['another.user@example.test'],
      message: 'one predefined local seed account email',
    },
    {
      name: 'multiple account arguments',
      databaseUrl: 'postgresql://unused@127.0.0.1:1/gym_local',
      args: ['admin.test@gimnasio.test', 'entrenador.lucia@gimnasio.test'],
      message: 'one predefined local seed account email',
    },
  ])('rejects $name before attempting a database write', (scenario) => {
    const result = spawnSync(
      process.execPath,
      ['scripts/set-local-test-password.cjs', ...scenario.args],
      {
        encoding: 'utf8',
        timeout: 5000,
        env: {
          ...process.env,
          DATABASE_URL: scenario.databaseUrl,
          LOCAL_DATABASE_PORT: '1',
          LOCAL_TEST_PASSWORD: 'synthetic-unused-password',
        },
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(scenario.message);
  });
});
