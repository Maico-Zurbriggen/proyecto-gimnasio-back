export class InvitationNotFoundError extends Error {
  constructor(message = 'Invitación no encontrada') {
    super(message);
    this.name = 'InvitationNotFoundError';
  }
}

export class InvitationExpiredError extends Error {
  constructor(message = 'La invitación ha caducado') {
    super(message);
    this.name = 'InvitationExpiredError';
  }
}

export class InvitationAlreadyUsedError extends Error {
  constructor(message = 'Esta invitación ya fue utilizada') {
    super(message);
    this.name = 'InvitationAlreadyUsedError';
  }
}

export class InvitationRevokedError extends Error {
  constructor(message = 'La invitación ha sido revocada') {
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
  constructor(
    message = 'Ya existe un usuario con este correo electrónico en este gimnasio',
  ) {
    super(message);
    this.name = 'UserAlreadyExistsError';
  }
}
