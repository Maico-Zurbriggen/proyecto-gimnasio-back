import type { RecoveryMailer } from '../../application/ports/password-recovery.repository';

/** Adaptador Resend sin SDK; no registra contenido ni respuestas del proveedor. */
export class HttpRecoveryMailer implements RecoveryMailer {
  async send(email: string, token: string): Promise<void> {
    const { RECOVERY_PAGE_URL, RECOVERY_EMAIL_FROM, RECOVERY_EMAIL_API_KEY } =
      process.env;
    if (!RECOVERY_PAGE_URL || !RECOVERY_EMAIL_FROM || !RECOVERY_EMAIL_API_KEY)
      throw new Error('Recovery email is not configured');
    const link = new URL(RECOVERY_PAGE_URL);
    if (
      link.protocol !== 'https:' &&
      !(process.env.NODE_ENV === 'development' && link.hostname === 'localhost')
    )
      throw new Error('Invalid recovery URL');
    link.searchParams.set('token', token);
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(1500),
      headers: {
        Authorization: `Bearer ${RECOVERY_EMAIL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: RECOVERY_EMAIL_FROM,
        to: [email],
        subject: 'Recuperar acceso',
        text: `Restablecé tu contraseña: ${link.toString()}\nEl enlace vence en 2 horas y se puede usar una sola vez.`,
      }),
    });
    if (!response.ok) throw new Error('Recovery delivery failed');
    await response.body?.cancel();
  }
}
