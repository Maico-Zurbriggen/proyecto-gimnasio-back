import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('Local catalogue media command boundaries', () => {
  it.each([
    {
      name: 'remote database',
      databaseUrl: 'postgresql://unused@remote.example.test:1/gym_local',
      args: ['missing.json'],
      message: 'only supports the local gym_local database',
    },
    {
      name: 'another database',
      databaseUrl: 'postgresql://unused@127.0.0.1:1/shared',
      args: ['missing.json'],
      message: 'only supports the local gym_local database',
    },
    {
      name: 'mismatched port',
      databaseUrl: 'postgresql://unused@127.0.0.1:2/gym_local',
      args: ['missing.json'],
      message: 'only supports the local gym_local database',
    },
    {
      name: 'missing manifest',
      databaseUrl: 'postgresql://unused@127.0.0.1:1/gym_local',
      args: [],
      message: 'Provide one private, reviewed local media manifest',
    },
    {
      name: 'multiple manifests',
      databaseUrl: 'postgresql://unused@127.0.0.1:1/gym_local',
      args: ['a.json', 'b.json'],
      message: 'Provide one private, reviewed local media manifest',
    },
  ])('rejects $name before opening a database connection', (scenario) => {
    const result = spawnSync(
      process.execPath,
      ['scripts/set-local-catalog-media.cjs', ...scenario.args],
      {
        encoding: 'utf8',
        timeout: 5000,
        env: {
          ...process.env,
          DATABASE_URL: scenario.databaseUrl,
          LOCAL_DATABASE_PORT: '1',
        },
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(scenario.message);
  });
});
