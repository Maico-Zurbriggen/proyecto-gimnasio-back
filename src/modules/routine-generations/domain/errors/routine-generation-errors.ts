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
  readonly requestId: string | null;
  readonly requestStatus: string | null;

  constructor(
    message = 'AI service unavailable',
    options?: ErrorOptions & { requestId?: string; requestStatus?: string },
  ) {
    super(message, options);
    this.name = 'RoutineGenerationUnavailableError';
    this.requestId = options?.requestId ?? null;
    this.requestStatus = options?.requestStatus ?? null;
  }
}

export class RoutineGenerationNotFoundError extends Error {
  constructor(message = 'Routine generation request not found') {
    super(message);
    this.name = 'RoutineGenerationNotFoundError';
  }
}

export class RoutineGenerationAlreadyExistsError extends Error {
  constructor(message = 'Routine generation request already exists') {
    super(message);
    this.name = 'RoutineGenerationAlreadyExistsError';
  }
}
