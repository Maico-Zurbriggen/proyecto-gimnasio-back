/** Ya existe un gimnasio afiliado con ese nombre (HU13 · punto abierto 4). */
export class GymNameTakenError extends Error {
  constructor(message = 'Ya existe un gimnasio con ese nombre') {
    super(message);
    this.name = 'GymNameTakenError';
  }
}

/** La zona horaria no es un identificador IANA reconocido (criterio 5). */
export class InvalidTimezoneError extends Error {
  constructor(
    message = 'La zona horaria no es un identificador IANA reconocido',
  ) {
    super(message);
    this.name = 'InvalidTimezoneError';
  }
}

export class GymNotFoundError extends Error {
  constructor(message = 'El gimnasio no existe') {
    super(message);
    this.name = 'GymNotFoundError';
  }
}

/** La invitación de arranque ya se usó: el gimnasio tiene su administrador. */
export class BootstrapInvitationAlreadyUsedError extends Error {
  constructor(
    message = 'La invitación de arranque ya se usó: el gimnasio tiene su administrador',
  ) {
    super(message);
    this.name = 'BootstrapInvitationAlreadyUsedError';
  }
}

/**
 * El correo de la invitación no salió. La operación entera se deshace
 * (criterio 2): no queda gimnasio sin la invitación de su administrador.
 */
export class InvitationDeliveryError extends Error {
  constructor(
    message = 'No se pudo enviar la invitación al administrador; no se guardó ningún cambio',
  ) {
    super(message);
    this.name = 'InvitationDeliveryError';
  }
}

/** Criterio 23: la zona horaria de un gimnasio con sesiones no cambia sin confirmar. */
export class TimezoneChangeRequiresConfirmationError extends Error {
  constructor(readonly sessionCount: number) {
    super(
      `El gimnasio tiene ${String(sessionCount)} sesiones registradas: cambiar la zona horaria cambia el día y la semana de todos sus usuarios. Confirmalo para continuar.`,
    );
    this.name = 'TimezoneChangeRequiresConfirmationError';
  }
}
