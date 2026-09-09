export type UserRole = 'ALUMNO' | 'ENTRENADOR' | 'ADMINISTRADOR';

export interface AuthUser {
  id: string;
  gymId: string;
  roles: UserRole[];
}
