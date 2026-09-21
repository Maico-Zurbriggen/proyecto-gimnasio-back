import type { UserRole } from '../../../../shared/types/auth';

/** Identidad que el backend expone tras un login correcto (HU07 - T1). */
export interface AuthenticatedUserDto {
  id: string;
  gymId: string;
  roles: UserRole[];
}
