import type { Clock } from '../../../routines/application/ports/clock';
import { hashearToken } from '../../domain/services/session-token';
import type { AuthRepository } from '../ports/auth.repository';

/**
 * Cierre de sesión explícito (HU07 - T4).
 *
 * Revoca la sesión en base, de modo que el token deje de servir aunque alguien lo
 * hubiera copiado. Es idempotente y no falla ante un token inexistente o ya
 * revocado: cerrar sesión dos veces, o con una cookie vencida, termina en el mismo
 * estado y el usuario siempre queda deslogueado.
 */
export class LogoutUseCase {
  constructor(
    private readonly auth: AuthRepository,
    private readonly clock: Clock,
  ) {}

  async execute(token: string | undefined): Promise<void> {
    if (!token || token.trim().length === 0) {
      return;
    }
    await this.auth.revokeSession(hashearToken(token), this.clock.now());
  }
}
