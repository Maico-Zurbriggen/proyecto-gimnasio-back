import type {
  InvitationEmail,
  InvitationMailer,
} from '../../application/ports/invitation-mailer';

/** Enlace al alta de HU06: `<INVITATION_PAGE_URL>/<token>`. */
export function enlaceDeInvitacion(base: string, token: string): string {
  return `${base.replace(/\/+$/, '')}/${encodeURIComponent(token)}`;
}

function fechaLegible(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

/** Asunto y primer párrafo según para qué se invita a la persona. */
export function contenidoDeInvitacion(email: InvitationEmail): {
  subject: string;
  intro: string;
} {
  if (email.roles.includes('ADMINISTRADOR')) {
    return {
      subject: `Te invitaron a administrar ${email.gymName}`,
      intro: `Te invitaron a crear tu cuenta de administración de ${email.gymName}.`,
    };
  }
  if (email.roles.includes('ENTRENADOR')) {
    return {
      subject: `Te invitaron a entrenar alumnos en ${email.gymName}`,
      intro: `Te invitaron a crear tu cuenta de entrenador en ${email.gymName}.`,
    };
  }
  return {
    subject: `Te invitaron a entrenar en ${email.gymName}`,
    intro: email.trainerName
      ? `${email.trainerName} te invitó a entrenar en ${email.gymName} y va a ser tu profesor.`
      : `Te invitaron a entrenar en ${email.gymName}.`,
  };
}

function cuerpo(email: InvitationEmail, link: string): string {
  return [
    contenidoDeInvitacion(email).intro,
    '',
    `Creá tu cuenta acá: ${link}`,
    '',
    `El enlace es de un solo uso y vence el ${fechaLegible(email.expiresAt)}.`,
    'Si no esperabas este correo, podés ignorarlo.',
  ].join('\n');
}

/**
 * Envío por la API HTTP de Brevo, igual que la recuperación de contraseña
 * (HU09): mismo proveedor y sin SDK. No registra el contenido ni la respuesta.
 *
 * Variables: `INVITATION_PAGE_URL`, `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` y
 * `BREVO_SENDER_NAME` opcional.
 */
export class HttpInvitationMailer implements InvitationMailer {
  async sendInvitation(email: InvitationEmail): Promise<void> {
    const pageUrl = process.env.INVITATION_PAGE_URL;
    const apiKey = process.env.BREVO_API_KEY;
    const senderEmail = process.env.BREVO_SENDER_EMAIL;
    const senderName = process.env.BREVO_SENDER_NAME || 'Vivaz';
    if (!pageUrl || !apiKey || !senderEmail) {
      throw new Error('Invitation email is not configured');
    }
    const link = new URL(enlaceDeInvitacion(pageUrl, email.token));
    if (
      link.protocol !== 'https:' &&
      !(process.env.NODE_ENV === 'development' && link.hostname === 'localhost')
    ) {
      throw new Error('Invalid invitation URL');
    }

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
      headers: {
        accept: 'application/json',
        'api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { email: senderEmail, name: senderName },
        to: [{ email: email.to }],
        subject: contenidoDeInvitacion(email).subject,
        textContent: cuerpo(email, link.toString()),
      }),
    });
    if (!response.ok) throw new Error('Invitation delivery failed');
    await response.body?.cancel();
  }
}

/**
 * Sólo para desarrollo local sin proveedor configurado: escribe el enlace en la
 * consola del backend para poder recorrer el alta. Nunca se usa en producción.
 */
export class ConsoleInvitationMailer implements InvitationMailer {
  sendInvitation(email: InvitationEmail): Promise<void> {
    const base =
      process.env.INVITATION_PAGE_URL ?? 'http://localhost:5173/invitacion';
    console.info(
      `[dev] Invitación para ${email.to} (${email.gymName}): ${enlaceDeInvitacion(base, email.token)}`,
    );
    return Promise.resolve();
  }
}

/** Elige el envío real si está configurado; si no, el de consola fuera de prod. */
export function createInvitationMailerFromEnv(): InvitationMailer {
  const configured =
    Boolean(process.env.INVITATION_PAGE_URL) &&
    Boolean(process.env.BREVO_API_KEY) &&
    Boolean(process.env.BREVO_SENDER_EMAIL);
  if (!configured && process.env.NODE_ENV === 'development') {
    return new ConsoleInvitationMailer();
  }
  return new HttpInvitationMailer();
}
