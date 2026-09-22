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

export class RoutineGenerationOwnershipConflictError extends Error {
  constructor(message = 'Routine generation belongs to another resource') {
    super(message);
    this.name = 'RoutineGenerationOwnershipConflictError';
  }
}

export class RoutineGenerationNotCompletedError extends Error {
  constructor(message = 'Routine generation is not completed') {
    super(message);
    this.name = 'RoutineGenerationNotCompletedError';
  }
}

export class GeneratedRoutineInvalidError extends Error {
  constructor(
    public readonly violations: string[],
    message = 'Generated routine is invalid',
  ) {
    super(message);
    this.name = 'GeneratedRoutineInvalidError';
  }
}

export class ProposedRoutineAlreadyExistsError extends Error {
  constructor(message = 'A proposed routine already exists for the student') {
    super(message);
    this.name = 'ProposedRoutineAlreadyExistsError';
  }
}
