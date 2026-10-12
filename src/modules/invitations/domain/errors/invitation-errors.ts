/**
 * Errores del alta desde la invitación (HU06).
 *
 * Cada motivo de rechazo lleva un `code` estable (criterio 2: VENCIDA, REVOCADA,
 * USADA) que la pantalla usa para elegir qué decir. El de invitación inexistente
 * es deliberadamente genérico: no revela si el token existió (criterio 3).
 */

export class InvitationNotFoundError extends Error {
  readonly code = 'INVALIDA';
  constructor(message = 'El enlace de invitación no es válido') {
    super(message);
    this.name = 'InvitationNotFoundError';
  }
}

export class InvitationExpiredError extends Error {
  readonly code = 'VENCIDA';
  constructor(message = 'La invitación venció') {
    super(message);
    this.name = 'InvitationExpiredError';
  }
}

export class InvitationAlreadyUsedError extends Error {
  readonly code = 'USADA';
  constructor(message = 'Esta invitación ya fue utilizada') {
    super(message);
    this.name = 'InvitationAlreadyUsedError';
  }
}

export class InvitationRevokedError extends Error {
  readonly code = 'REVOCADA';
  constructor(message = 'La invitación fue revocada') {
    super(message);
    this.name = 'InvitationRevokedError';
  }
}

export class WeakPasswordError extends Error {
  constructor(
    message = 'La contraseña no cumple con los requisitos mínimos de seguridad',
    public readonly validationErrors: string[] = [],
  ) {
    super(message);
    this.name = 'WeakPasswordError';
  }
}

export class InvalidDisplayNameError extends Error {
  constructor(message = 'El nombre debe tener al menos 2 caracteres') {
    super(message);
    this.name = 'InvalidDisplayNameError';
  }
}

export class UserAlreadyExistsError extends Error {
  readonly code = 'CUENTA_EXISTENTE';
  constructor(
    message = 'Ese correo ya tiene una cuenta en este gimnasio. Iniciá sesión con ella.',
  ) {
    super(message);
    this.name = 'UserAlreadyExistsError';
  }
}

/** El emisor no puede otorgar alguno de los roles pedidos (RN-02d, RA-10). */
export class ForbiddenRoleError extends Error {
  constructor(message = 'No podés invitar con esos roles') {
    super(message);
    this.name = 'ForbiddenRoleError';
  }
}

/** El correo ya tiene una cuenta en el gimnasio del emisor. */
export class EmailAlreadyRegisteredError extends Error {
  constructor(message = 'Ese correo ya tiene una cuenta en el gimnasio') {
    super(message);
    this.name = 'EmailAlreadyRegisteredError';
  }
}

/** Ya hay una invitación vigente para ese correo en el gimnasio. */
export class PendingInvitationExistsError extends Error {
  constructor(message = 'Ya hay una invitación vigente para ese correo') {
    super(message);
    this.name = 'PendingInvitationExistsError';
  }
}

/**
 * El correo no salió. La invitación se deshace: el token sólo viaja en el
 * correo, así que una invitación sin enviar no le serviría a nadie.
 */
export class InvitationDeliveryError extends Error {
  constructor(
    message = 'No se pudo enviar el correo de invitación; no se guardó nada',
  ) {
    super(message);
    this.name = 'InvitationDeliveryError';
  }
}
