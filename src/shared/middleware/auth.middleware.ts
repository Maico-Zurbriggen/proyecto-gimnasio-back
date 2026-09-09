import type { NextFunction, Request, Response } from 'express';

import type { AuthUser, UserRole } from '../types/auth';

type RequestWithUser = Request & { user?: AuthUser };

export function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const requestWithUser = req as RequestWithUser;

  if (!requestWithUser.user) {
    const userId = requestWithUser.headers['x-user-id'];
    const userRolesHeader = requestWithUser.headers['x-user-roles'];
    const gymId = requestWithUser.headers['x-gym-id'];

    if (typeof userId === 'string' && userId.trim().length > 0) {
      const roles =
        typeof userRolesHeader === 'string'
          ? userRolesHeader.split(',').map((role) => role.trim())
          : ['ALUMNO'];

      requestWithUser.user = {
        id: userId,
        gymId: typeof gymId === 'string' ? gymId : 'default-gym',
        roles: roles as UserRole[],
      };
    }
  }

  next();
}

/**
 * Exige que exista un usuario autenticado.
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const requestWithUser = req as RequestWithUser;

  if (!requestWithUser.user) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  next();
}

export function requireRoles(...allowedRoles: readonly UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestWithUser = req as RequestWithUser;

    if (!requestWithUser.user) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    const hasRole = requestWithUser.user.roles.some((role) =>
      allowedRoles.includes(role),
    );
    if (!hasRole) {
      res.status(403).json({ error: 'forbidden_role' });
      return;
    }

    next();
  };
}

export function requireStudentOwnership(paramName = 'studentId') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestWithUser = req as RequestWithUser;
    const user = requestWithUser.user;
    if (!user) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    const targetStudentId = requestWithUser.params[paramName];
    const isAlumno = user.roles.includes('ALUMNO');

    if (isAlumno && user.id !== targetStudentId) {
      res.status(403).json({ error: 'forbidden_student_access' });
      return;
    }

    next();
  };
}
