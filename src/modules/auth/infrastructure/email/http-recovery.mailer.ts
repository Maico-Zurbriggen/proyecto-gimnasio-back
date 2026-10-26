import type { RecoveryMailer } from '../../application/ports/password-recovery.repository';

/** Adaptador Brevo sin SDK; no registra contenido ni respuestas del proveedor. */
export class HttpRecoveryMailer implements RecoveryMailer {
  async send(email: string, token: string): Promise<void> {
    const {
      RECOVERY_PAGE_URL,
      BREVO_API_KEY,
      BREVO_SENDER_EMAIL,
      BREVO_SENDER_NAME,
    } = process.env;
    if (!RECOVERY_PAGE_URL || !BREVO_API_KEY || !BREVO_SENDER_EMAIL)
      throw new Error('Recovery email is not configured');
    const link = new URL(RECOVERY_PAGE_URL);
    if (
      link.protocol !== 'https:' &&
      !(process.env.NODE_ENV === 'development' && link.hostname === 'localhost')
    )
      throw new Error('Invalid recovery URL');
    link.searchParams.set('token', token);
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      signal: AbortSignal.timeout(1500),
      headers: {
        accept: 'application/json',
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: {
          email: BREVO_SENDER_EMAIL,
          name: BREVO_SENDER_NAME || 'Vivaz',
        },
        to: [{ email }],
        subject: 'Recuperar acceso',
        textContent: `Restablecé tu contraseña: ${link.toString()}\nEl enlace vence en 2 horas y se puede usar una sola vez.`,
      }),
    });
    if (!response.ok) throw new Error('Recovery delivery failed');
    await response.body?.cancel();
  }
}
