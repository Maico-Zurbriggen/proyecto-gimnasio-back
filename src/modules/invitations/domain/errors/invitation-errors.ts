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

/** El emisor no puede otorgar alguno de los roles pedidos (criterios 2 y 3). */
export class ForbiddenRoleError extends Error {
  constructor(message = 'No podés emitir una invitación con esos roles') {
    super(message);
    this.name = 'ForbiddenRoleError';
  }
}

/** Ya existe un usuario con ese correo en el gimnasio (criterio 9). */
export class EmailAlreadyRegisteredError extends Error {
  constructor(message = 'Ese correo ya tiene una cuenta en este gimnasio') {
    super(message);
    this.name = 'EmailAlreadyRegisteredError';
  }
}

/** Ya hay una invitación vigente para ese correo (criterio 9). */
export class PendingInvitationExistsError extends Error {
  constructor(message = 'Ya hay una invitación vigente para ese correo') {
    super(message);
    this.name = 'PendingInvitationExistsError';
  }
}

/** La invitación no puede revocarse por su estado (criterio 12). */
export class InvitationNotRevocableError extends Error {
  constructor(
    message = 'Sólo puede revocarse una invitación vigente',
    readonly estado?: string,
  ) {
    super(message);
    this.name = 'InvitationNotRevocableError';
  }
}

/** El actor no puede revocar esta invitación (criterio 13). */
export class ForbiddenRevocationError extends Error {
  constructor(message = 'No podés revocar esta invitación') {
    super(message);
    this.name = 'ForbiddenRevocationError';
  }
}
