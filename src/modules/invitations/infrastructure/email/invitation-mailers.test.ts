import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ConsoleInvitationMailer,
  createInvitationMailerFromEnv,
  HttpInvitationMailer,
} from './invitation-mailers';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function configureBrevo(): void {
  vi.stubEnv('INVITATION_PAGE_URL', 'https://gym.test/invitacion');
  vi.stubEnv('BREVO_API_KEY', 'provider-secret');
  vi.stubEnv('BREVO_SENDER_EMAIL', 'access@gym.test');
  vi.stubEnv('BREVO_SENDER_NAME', 'Gym');
}

const invitation = {
  to: 'student@example.test',
  gymName: 'Gym Test',
  token: 'token with spaces',
  expiresAt: new Date('2026-11-01T12:00:00.000Z'),
  roles: ['ALUMNO'] as const,
  trainerName: 'Lucía',
};

describe('invitation email adapters', () => {
  it('sends the invitation through the Brevo transactional API', async () => {
    configureBrevo();
    const send = vi
      .fn()
      .mockResolvedValue({ ok: true, body: { cancel: vi.fn() } });
    vi.stubGlobal('fetch', send);

    await new HttpInvitationMailer().sendInvitation({
      ...invitation,
      roles: [...invitation.roles],
    });

    const [url, options] = send.mock.calls[0]!;
    const body = JSON.parse(options.body);
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(options.headers).toMatchObject({
      accept: 'application/json',
      'api-key': 'provider-secret',
      'Content-Type': 'application/json',
    });
    expect(options.headers.Authorization).toBeUndefined();
    expect(body.sender).toEqual({
      email: 'access@gym.test',
      name: 'Gym',
    });
    expect(body.to).toEqual([{ email: 'student@example.test' }]);
    expect(body.textContent).toContain(
      'https://gym.test/invitacion/token%20with%20spaces',
    );
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('rejects incomplete configuration and provider failures', async () => {
    const send = vi.fn();
    vi.stubGlobal('fetch', send);
    vi.stubEnv('BREVO_API_KEY', '');

    await expect(
      new HttpInvitationMailer().sendInvitation({
        ...invitation,
        roles: [...invitation.roles],
      }),
    ).rejects.toThrow('not configured');
    expect(send).not.toHaveBeenCalled();

    configureBrevo();
    send.mockResolvedValue({ ok: false });
    await expect(
      new HttpInvitationMailer().sendInvitation({
        ...invitation,
        roles: [...invitation.roles],
      }),
    ).rejects.toThrow('Invitation delivery failed');
  });

  it('uses the console only for unconfigured local development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('INVITATION_PAGE_URL', '');
    vi.stubEnv('BREVO_API_KEY', '');
    vi.stubEnv('BREVO_SENDER_EMAIL', '');
    expect(createInvitationMailerFromEnv()).toBeInstanceOf(
      ConsoleInvitationMailer,
    );

    configureBrevo();
    expect(createInvitationMailerFromEnv()).toBeInstanceOf(
      HttpInvitationMailer,
    );
  });
});
