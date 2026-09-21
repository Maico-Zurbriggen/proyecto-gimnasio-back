import type { NextFunction, Request, Response } from 'express';

import type { ResolveSessionUseCase } from '../../modules/auth/application/use-cases/resolve-session.use-case';
import { leerCookieDeSesion } from '../../modules/auth/infrastructure/http/session-cookie';
import type { UserRole } from '../types/auth';

/**
 * Atajo de identidad por headers, para desarrollo y pruebas.
 *
 * Existía antes del login (HU07) y se conserva **sólo fuera de producción**: los
 * tests de API de todos los módulos lo usan para no tener que autenticarse en cada
 * caso. En producción la única vía es la cookie de sesión.
 */
function identidadDeDesarrollo(req: Request): void {
  if (process.env.NODE_ENV === 'production') {
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
 * Orden: lo ya inyectado, después la cookie de sesión, y por último el atajo por
 * headers fuera de producción. Nunca responde por sí mismo: dejar pasar sin
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

    identidadDeDesarrollo(req);
    next();
  };
}

/**
 * Middleware de autenticación sin resolución de sesión.
 *
 * Se conserva para los módulos y pruebas que lo importan directamente; la app lo
 * reemplaza por `createAuthenticate(resolveSession)` al construirse.
 */
export function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    identidadDeDesarrollo(req);
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
