import type { UserRole } from '../../../../shared/types/auth';

/**
 * Correo con el enlace al alta de HU06. Lo envían la emisión de invitaciones
 * del gimnasio y el aprovisionamiento del primer administrador (HU13).
 */
export interface InvitationEmail {
  to: string;
  gymName: string;
  /** Token en claro. Sólo viaja en el enlace del correo; nunca se persiste. */
  token: string;
  expiresAt: Date;
  roles: UserRole[];
  /** Entrenador que invita a un alumno: va a ser su profesor asignado. */
  trainerName: string | null;
}

export interface InvitationMailer {
  /** Lanza si el correo no se pudo entregar al proveedor. */
  sendInvitation(email: InvitationEmail): Promise<void>;
}
