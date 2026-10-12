export type UserRole = 'ALUMNO' | 'ENTRENADOR' | 'ADMINISTRADOR' | 'SUPERADMIN';

export interface AuthUser {
  id: string;
  gymId: string;
  roles: UserRole[];
  sessionId?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
