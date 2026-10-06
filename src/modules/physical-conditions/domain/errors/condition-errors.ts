/** La zona corporal no pertenece a la enumeración cerrada de D2 (RN-10a). */
export class InvalidBodyZoneError extends Error {
  constructor(message = 'La zona corporal no es válida') {
    super(message);
    this.name = 'InvalidBodyZoneError';
  }
}

/** La fecha de inicio es futura. */
export class FutureStartDateError extends Error {
  constructor(message = 'No se admite una condición con fecha futura') {
    super(message);
    this.name = 'FutureStartDateError';
  }
}

/** No existe la condición, o no pertenece a ese alumno. */
export class ConditionNotFoundError extends Error {
  constructor(message = 'La condición no existe') {
    super(message);
    this.name = 'ConditionNotFoundError';
  }
}

/** La condición ya está cerrada, o la fecha de cierre es anterior al inicio. */
export class ConditionNotClosableError extends Error {
  constructor(message = 'La condición no puede cerrarse') {
    super(message);
    this.name = 'ConditionNotClosableError';
  }
}

/** No existe el alumno. */
export class StudentNotFoundError extends Error {
  constructor(message = 'El alumno no existe') {
    super(message);
    this.name = 'StudentNotFoundError';
  }
}
