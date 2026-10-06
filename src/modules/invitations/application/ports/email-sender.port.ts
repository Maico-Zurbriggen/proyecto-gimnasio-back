/** Correo de invitación que se envía al destinatario (HU08 - T4). */
export interface InvitationEmail {
  to: string;
  gymName: string;
  /** Enlace al flujo de alta de HU06, con el token de la invitación. */
  invitationUrl: string;
  expiresAt: Date;
}

/**
 * Puerto de envío de correo.
 *
 * El adaptador concreto es reemplazable: hoy SMTP por nodemailer, mañana el
 * proveedor que el equipo elija, sin tocar el caso de uso.
 */
export interface EmailSender {
  /**
   * Envía la invitación.
   *
   * Lanza si el envío falla. El caso de uso **no** deshace la invitación por
   * eso: queda VIGENTE y se puede reenviar o revocar (criterio 18, CB-69).
   */
  sendInvitation(email: InvitationEmail): Promise<void>;
}
