export class UserNotFoundError extends Error {
  constructor(message = 'User not found') {
    super(message);
    this.name = 'UserNotFoundError';
  }
}

export class UserAlreadySuspendedError extends Error {
  constructor(message = 'User is already suspended') {
    super(message);
    this.name = 'UserAlreadySuspendedError';
  }
}
