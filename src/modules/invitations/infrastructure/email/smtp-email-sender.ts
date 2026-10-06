import nodemailer, { type Transporter } from 'nodemailer';

import type {
  EmailSender,
  InvitationEmail,
} from '../../application/ports/email-sender.port';

/**
 * Envío de invitaciones por SMTP (HU08 - T4).
 *
 * Se usa SMTP y no la API de un proveedor concreto para no atar el proyecto a
 * ninguno: Mailtrap para probar, o el servidor que el gimnasio tenga, cambiando
 * sólo variables de entorno.
 *
 * El correo **no incluye contraseñas ni datos innecesarios** (criterio 20): sólo
 * el nombre del gimnasio, el enlace y hasta cuándo vale.
 */
export class SmtpEmailSender implements EmailSender {
  constructor(
    private readonly transporter: Transporter,
    private readonly from: string,
  ) {}

  async sendInvitation(email: InvitationEmail): Promise<void> {
    const vence = email.expiresAt.toISOString().slice(0, 10);

    await this.transporter.sendMail({
      from: this.from,
      to: email.to,
      subject: `Te invitaron a ${email.gymName}`,
      text: [
        `Te invitaron a crear tu cuenta en ${email.gymName}.`,
        '',
        `Para completarla, entrá acá: ${email.invitationUrl}`,
        '',
        `El enlace es de un solo uso y vence el ${vence}.`,
        'Si no esperabas esta invitación, podés ignorar este correo.',
      ].join('\n'),
    });
  }
}

/**
 * Construye el enviador desde la configuración del entorno.
 *
 * Devuelve `null` cuando no hay SMTP configurado, para que la aplicación arranque
 * igual en desarrollo. Quien lo use decide qué hacer con la ausencia; la emisión
 * de invitaciones no se bloquea por eso (criterio 18).
 */
export function createSmtpEmailSenderFromEnv(): EmailSender | null {
  const host = process.env.MAIL_HOST;
  const from = process.env.MAIL_FROM;

  if (!host || !from) {
    return null;
  }

  const port = Number(process.env.MAIL_PORT ?? 587);
  const user = process.env.MAIL_USER;
  const password = process.env.MAIL_PASSWORD;

  const transporter = nodemailer.createTransport({
    host,
    port,
    // El puerto 465 es TLS implícito; 587 y 25 negocian STARTTLS.
    secure: port === 465,
    auth: user && password ? { user, pass: password } : undefined,
  });

  return new SmtpEmailSender(transporter, from);
}
