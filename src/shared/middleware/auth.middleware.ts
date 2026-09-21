import type { NextFunction, Request, Response } from 'express';

import type { ResolveSessionUseCase } from '../../modules/auth/application/use-cases/resolve-session.use-case';
import { leerCookieDeSesion } from '../../modules/auth/infrastructure/http/session-cookie';
import type { UserRole } from '../types/auth';

/**
 * Atajo de identidad por headers, exclusivo de pruebas automatizadas.
 *
 * Existía antes del login (HU07) y se conserva sólo para aislar los tests de API:
 * al ejecutar la aplicación localmente o en Vercel, la única vía es la cookie de
 * sesión. Ningún cliente de la aplicación debe enviar estos headers.
 */
function identidadDePrueba(req: Request): void {
  if (process.env.NODE_ENV !== 'test') {
    return;
  }

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

/**
 * Resuelve la identidad de la petición (HU07 - T2 y T5).
 *
 * Orden: lo ya inyectado, después la cookie de sesión, y por último el atajo de
 * tests. Nunca responde por sí mismo: dejar pasar sin
 * usuario es tarea de `requireAuth`, que es el que devuelve 401.
 */
export function createAuthenticate(resolveSession?: ResolveSessionUseCase) {
  return async (
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> => {
    if (req.user) {
      next();
      return;
    }

    const token = leerCookieDeSesion(req);
    if (resolveSession && token) {
      try {
        const user = await resolveSession.execute(token);
        if (user) {
          req.user = user;
          next();
          return;
        }
      } catch {
        // Una falla al resolver la sesión se trata como sesión ausente: el
        // usuario queda sin autenticar y `requireAuth` responde 401.
      }
    }

    identidadDePrueba(req);
    next();
  };
}

/**
 * Middleware de autenticación sin resolución de sesión.
 *
 * Se conserva para los módulos y pruebas que lo importan directamente; fuera de
 * `NODE_ENV=test` no acepta identidades simuladas.
 */
export function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    identidadDePrueba(req);
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
    const canAccessAsStaff =
      user.roles.includes('ENTRENADOR') || user.roles.includes('ADMINISTRADOR');

    if (isAlumno && !canAccessAsStaff && user.id !== targetStudentId) {
      res.status(403).json({ error: 'forbidden_student_access' });
      return;
    }

    next();
  };
}
