export class StudentNotFoundError extends Error {}
export class RoutineNotActiveError extends Error {}
export class RoutineDayNotFoundError extends Error {}
export class SessionAlreadyInProgressError extends Error {}
export class SessionNotFoundError extends Error {}
export class SessionNotInProgressError extends Error {}
export class SessionAccessError extends Error {}
export class SeriesOutOfRangeError extends Error {
  constructor(readonly violations: { field: string; message: string }[]) {
    super('Series fuera de rango');
  }
}
export class AtypicalSeriesError extends Error {
  constructor(
    readonly bestHistorical: number | null,
    readonly attemptedLoad: number,
  ) {
    super('Registro atípico: requiere confirmación explícita');
  }
}
export class SeriesNotFoundError extends Error {}
export class ExerciseNotFoundError extends Error {}
