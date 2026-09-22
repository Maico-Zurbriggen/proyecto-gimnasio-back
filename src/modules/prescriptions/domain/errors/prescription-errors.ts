export class TemplateNotFoundError extends Error {
  constructor(message = 'La plantilla no existe o no está activa') {
    super(message);
    this.name = 'TemplateNotFoundError';
  }
}

export class TemplateFromAnotherGymError extends Error {
  constructor(message = 'La plantilla pertenece a otro gimnasio') {
    super(message);
    this.name = 'TemplateFromAnotherGymError';
  }
}

export class EmptyTemplateError extends Error {
  constructor(message = 'La plantilla no tiene días con ejercicios') {
    super(message);
    this.name = 'EmptyTemplateError';
  }
}

export class StudentNotFoundError extends Error {
  constructor(message = 'El alumno no existe') {
    super(message);
    this.name = 'StudentNotFoundError';
  }
}

export class RoutineNotFoundError extends Error {
  constructor(message = 'La rutina no existe') {
    super(message);
    this.name = 'RoutineNotFoundError';
  }
}

export class RoutineNotReviewableError extends Error {
  constructor(
    message = 'Sólo se puede revisar una rutina en estado PROPUESTA',
  ) {
    super(message);
    this.name = 'RoutineNotReviewableError';
  }
}

export class PendingProposalError extends Error {
  constructor(
    message = 'El alumno ya tiene una rutina propuesta sin resolver',
  ) {
    super(message);
    this.name = 'PendingProposalError';
  }
}
