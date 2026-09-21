import type { Clock } from '../../../routines/application/ports/clock';
import {
  calcularVencimiento,
  debeRefrescarActividad,
  esSesionVigente,
} from '../../domain/services/session-policy';
import { hashearToken } from '../../domain/services/session-token';
import type { AuthenticatedUserDto } from '../dto/session.dto';
import type { AuthRepository } from '../ports/auth.repository';

/**
 * Resuelve la identidad a partir del token de la cookie (HU07 - T2, T3 y T5).
 *
 * Corre en cada petición autenticada. Devuelve `null` ante cualquier motivo por el
 * que la sesión no sirva —inexistente, vencida, revocada o de un usuario
 * suspendido— para que el middleware responda 401 sin distinguir el caso.
 *
 * Cuando la sesión es válida, corre la ventana de inactividad de RN-07, pero sólo
 * si pasó la tolerancia: así no se escribe en `auth_sessions` en cada request.
 */
export class ResolveSessionUseCase {
  constructor(
    private readonly auth: AuthRepository,
    private readonly clock: Clock,
  ) {}

  async execute(token: string): Promise<AuthenticatedUserDto | null> {
    if (token.trim().length === 0) {
      return null;
    }

    const session = await this.auth.findSessionByTokenHash(hashearToken(token));
    if (!session) {
      return null;
    }

    const now = this.clock.now();
    if (!esSesionVigente(session, now)) {
      return null;
    }

    // Una cuenta suspendida deja de autenticar aunque su sesión siga vigente.
    if (session.userState !== 'ACTIVO') {
      return null;
    }

    if (debeRefrescarActividad(session.lastActivityAt, now)) {
      await this.auth.touchSession(session.id, now, calcularVencimiento(now));
    }

    return {
      id: session.userId,
      gymId: session.gymId,
      roles: session.roles,
    };
  }
}
