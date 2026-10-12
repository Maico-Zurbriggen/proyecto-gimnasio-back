/** Correo con el enlace al alta de HU06 (HU13 - criterio 10). */
export interface BootstrapInvitationEmail {
  to: string;
  gymName: string;
  /** Token en claro. Sólo viaja en el enlace del correo; nunca se persiste. */
  token: string;
  expiresAt: Date;
}

export interface InvitationMailer {
  /** Lanza si el correo no se pudo entregar al proveedor. */
  sendBootstrapInvitation(email: BootstrapInvitationEmail): Promise<void>;
}
