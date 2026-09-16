import type { NextFunction, Request, Response } from 'express';

import type { UserRole } from '../types/auth';

/**
 * Middleware para autenticar la petición.
 * Permite resolver el usuario desde req.user (si fue inyectado previamente) o mediante headers para desarrollo/test.
 */
export function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    const userId = req.headers['x-user-id'];
    const userRolesHeader = req.headers['x-user-roles'];
    const gymId = req.headers['x-gym-id'];

    if (typeof userId === 'string' && userId.trim().length > 0) {
      const roles = (
        typeof userRolesHeader === 'string'
          ? userRolesHeader.split(',').map((r) => r.trim() as UserRole)
          : ['ALUMNO']
      ) as UserRole[];

      req.user = {
        id: userId,
        gymId: typeof gymId === 'string' ? gymId : 'default-gym',
        roles,
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
  if (!req.user) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  next();
}

/**
 * Exige que el usuario posea al menos uno de los roles autorizados.
 */
export function requireRoles(...allowedRoles: readonly UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    const hasRole = req.user.roles.some((role) => allowedRoles.includes(role));
    if (!hasRole) {
      res.status(403).json({ error: 'forbidden_role' });
      return;
    }

    next();
  };
}

/**
 * Autorización en dos pasos para recursos de alumno (AGENTS.md):
 * Si el usuario autenticado es ALUMNO, sólo puede acceder a recursos con su propio studentId.
 * El acceso a datos de otro alumno devuelve 403 Forbidden.
 */
export function requireStudentOwnership(paramName = 'studentId') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    const targetStudentId = req.params[paramName];
    const isAlumno = user.roles.includes('ALUMNO');

    if (isAlumno && user.id !== targetStudentId) {
      res.status(403).json({ error: 'forbidden_student_access' });
      return;
    }

    next();
  };
}
