export type UserRole = 'ALUMNO' | 'ENTRENADOR' | 'ADMINISTRADOR';

export interface AuthUser {
  id: string;
  gymId: string;
  roles: UserRole[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
