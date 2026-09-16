export type UserDomainState = 'ACTIVO' | 'SUSPENDIDO';

export interface UserProps {
  id: string;
  gymId: string;
  emailNormalized: string;
  displayName: string;
  state: UserDomainState;
  createdAt?: Date;
}

export class User {
  readonly id: string;
  readonly gymId: string;
  readonly emailNormalized: string;
  readonly displayName: string;
  private _state: UserDomainState;
  readonly createdAt?: Date;

  constructor(props: UserProps) {
    this.id = props.id;
    this.gymId = props.gymId;
    this.emailNormalized = props.emailNormalized;
    this.displayName = props.displayName;
    this._state = props.state;
    this.createdAt = props.createdAt;
  }

  get state(): UserDomainState {
    return this._state;
  }

  isActive(): boolean {
    return this._state === 'ACTIVO';
  }

  isSuspended(): boolean {
    return this._state === 'SUSPENDIDO';
  }

  suspend(): void {
    this._state = 'SUSPENDIDO';
  }

  activate(): void {
    this._state = 'ACTIVO';
  }
}
