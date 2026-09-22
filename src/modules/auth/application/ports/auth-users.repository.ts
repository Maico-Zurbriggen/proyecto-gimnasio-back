import type { UserRole } from '../../../../shared/types/auth';

export interface AuthUserCredentials {
  id: string;
  gymId: string;
  passwordHash: string;
  state: string;
  roles: UserRole[];
}

export interface AuthUsersRepository {
  findByEmail(email: string): Promise<AuthUserCredentials | null>;
  findById(id: string): Promise<AuthUserCredentials | null>;
}
