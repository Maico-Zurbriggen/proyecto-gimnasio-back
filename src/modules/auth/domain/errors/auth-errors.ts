export class InvalidCredentialsError extends Error {
  constructor(message = 'Invalid email or password') {
    super(message);
    this.name = 'InvalidCredentialsError';
  }
}

export class InvalidSessionError extends Error {
  constructor(message = 'Session is missing, expired or revoked') {
    super(message);
    this.name = 'InvalidSessionError';
  }
}
