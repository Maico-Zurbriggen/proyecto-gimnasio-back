export class StudentNotFoundError extends Error {
  constructor(message = 'Student not found') {
    super(message);
    this.name = 'StudentNotFoundError';
  }
}

/** El entrenador no tiene asignación vigente con el alumno (RF-066, RA-07). */
export class TrainerNotAssignedError extends Error {
  constructor(message = 'Trainer has no active assignment with the student') {
    super(message);
    this.name = 'TrainerNotAssignedError';
  }
}

export class StudentNotBlockedError extends Error {
  constructor(message = 'Student is not blocked') {
    super(message);
    this.name = 'StudentNotBlockedError';
  }
}

export class PendingMeasurementRequiredError extends Error {
  constructor(message = 'The student must submit pending measurements first') {
    super(message);
    this.name = 'PendingMeasurementRequiredError';
  }
}

export class MeasurementBlockAlreadyResolvedError extends Error {
  constructor(message = 'Measurement block was already resolved') {
    super(message);
    this.name = 'MeasurementBlockAlreadyResolvedError';
  }
}
