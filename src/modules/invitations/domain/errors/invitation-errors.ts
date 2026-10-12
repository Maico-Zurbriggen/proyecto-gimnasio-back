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
