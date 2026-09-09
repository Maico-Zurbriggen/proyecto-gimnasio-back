export class RoutineNotFoundError extends Error {
  constructor(message = 'Routine not found') {
    super(message);
    this.name = 'RoutineNotFoundError';
  }
}

export class RoutineNotActiveError extends Error {
  constructor(message = 'Routine is not active') {
    super(message);
    this.name = 'RoutineNotActiveError';
  }
}

export class ForbiddenAccessError extends Error {
  constructor(message = 'Forbidden access to resource') {
    super(message);
    this.name = 'ForbiddenAccessError';
  }
}
