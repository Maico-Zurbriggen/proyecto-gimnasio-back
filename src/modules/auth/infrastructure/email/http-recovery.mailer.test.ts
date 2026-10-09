import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpRecoveryMailer } from './http-recovery.mailer';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function configure() {
  vi.stubEnv('RECOVERY_PAGE_URL', 'https://gym.test/recover');
  vi.stubEnv('RECOVERY_EMAIL_FROM', 'Gym <access@gym.test>');
  vi.stubEnv('RECOVERY_EMAIL_API_KEY', 'provider-secret');
}
describe('recovery email HTTP adapter', () => {
  it('uses the configured recovery page and sends no password to the provider', async () => {
    configure();
    const send = vi
      .fn()
      .mockResolvedValue({ ok: true, body: { cancel: vi.fn() } });
    vi.stubGlobal('fetch', send);
    await new HttpRecoveryMailer().send('a@gym.test', 'token');
    const [url, options] = send.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect(JSON.parse(options.body).text).toContain(
      'https://gym.test/recover?token=token',
    );
    expect(JSON.parse(options.body).to).toEqual(['a@gym.test']);
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });
  it('rejects missing configuration, unsafe URLs and failed delivery without exposing provider details', async () => {
    const send = vi.fn();
    vi.stubGlobal('fetch', send);
    vi.stubEnv('RECOVERY_EMAIL_API_KEY', '');
    await expect(
      new HttpRecoveryMailer().send('a@gym.test', 'token'),
    ).rejects.toThrow('not configured');
    expect(send).not.toHaveBeenCalled();
    configure();
    vi.stubEnv('RECOVERY_PAGE_URL', 'http://unsafe.test/recover');
    await expect(
      new HttpRecoveryMailer().send('a@gym.test', 'token'),
    ).rejects.toThrow('Invalid recovery URL');
    configure();
    send.mockResolvedValue({ ok: false });
    await expect(
      new HttpRecoveryMailer().send('a@gym.test', 'token'),
    ).rejects.toThrow('Recovery delivery failed');
  });
});
