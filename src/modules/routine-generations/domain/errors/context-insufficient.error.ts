export class ContextInsufficientError extends Error {
  constructor(public readonly missing: string[]) {
    super('Student context is insufficient');
  }
}
