import { describe, expect, it } from 'vitest';
import { isLocalGenerationTestingEnabled } from './local-generation-testing';

const local = {
  NODE_ENV: 'development',
  LOCAL_GENERATION_TESTING: 'true',
  DATABASE_URL:
    'postgresql://gym_migrator@127.0.0.1:55432/gym_local?schema=public',
};
describe('local generation testing', () => {
  it('enables the explicitly configured local development database', () => {
    expect(isLocalGenerationTestingEnabled(local)).toBe(true);
  });
  it('supports another explicitly configured local port', () => {
    expect(
      isLocalGenerationTestingEnabled({
        ...local,
        LOCAL_DATABASE_PORT: '65432',
        DATABASE_URL: 'postgresql://gym_migrator@127.0.0.1:65432/gym_local',
      }),
    ).toBe(true);
  });
  it.each([
    { LOCAL_DATABASE_PORT: '65432' },
    {
      LOCAL_DATABASE_PORT: '',
      DATABASE_URL: 'postgresql://gym_migrator@127.0.0.1/gym_local',
    },
    {
      LOCAL_DATABASE_PORT: '65432',
      DATABASE_URL:
        'postgresql://gym_migrator@remote.neon.tech:65432/gym_local',
    },
  ])(
    'rejects mismatched or unsafe custom port configuration %j',
    (override) => {
      expect(isLocalGenerationTestingEnabled({ ...local, ...override })).toBe(
        false,
      );
    },
  );
  it.each([
    { NODE_ENV: 'production' },
    { LOCAL_GENERATION_TESTING: 'false' },
    { DATABASE_URL: 'postgresql://user@remote.neon.tech:55432/gym_local' },
    { DATABASE_URL: 'postgresql://user@localhost:5432/gym_local' },
    { DATABASE_URL: 'postgresql://user@localhost:55432/other_database' },
    { DATABASE_URL: 'invalid-url' },
    { DATABASE_URL: undefined },
  ])('rejects configuration %j', (override) => {
    expect(isLocalGenerationTestingEnabled({ ...local, ...override })).toBe(
      false,
    );
  });
});
