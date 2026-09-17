export class StudentNotFoundError extends Error {
  constructor(message = 'Student not found') {
    super(message);
    this.name = 'StudentNotFoundError';
  }
}

export class MissingGenerationInputError extends Error {
  constructor(message = 'Either freeText or parameters must be provided') {
    super(message);
    this.name = 'MissingGenerationInputError';
  }
}

export class EmptyPrefilteredCatalogError extends Error {
  constructor(message = 'Prefiltered exercise catalog is empty') {
    super(message);
    this.name = 'EmptyPrefilteredCatalogError';
  }
}

export class RoutineGenerationUnavailableError extends Error {
  constructor(message = 'AI service unavailable', options?: ErrorOptions) {
    super(message, options);
    this.name = 'RoutineGenerationUnavailableError';
  }
}

export class RoutineGenerationNotFoundError extends Error {
  constructor(message = 'Routine generation request not found') {
    super(message);
    this.name = 'RoutineGenerationNotFoundError';
  }
}
