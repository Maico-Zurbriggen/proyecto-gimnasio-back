import type { AuthRepository } from '../../../auth/application/ports/auth.repository';
import type { AuthenticatedUserDto } from '../../../auth/application/dto/session.dto';
import { hashearContrasena } from '../../../auth/domain/services/password-hasher';
import { calcularVencimiento } from '../../../auth/domain/services/session-policy';
import {
  generarTokenDeSesion,
  hashearToken,
} from '../../../auth/domain/services/session-token';
import type { Clock } from '../../../routines/application/ports/clock';
import {
  InvalidDisplayNameError,
  WeakPasswordError,
} from '../../domain/errors/invitation-errors';
import { validatePasswordStrength } from '../../domain/services/password-strength.service';
import type { InvitationsRepository } from '../ports/invitations.repository';
import { resolveUsableInvitation } from './validate-invitation.use-case';

/** Largo mínimo del nombre para mostrar. */
const LARGO_MINIMO_NOMBRE = 2;

export interface CompleteAccountInput {
  token: string;
  displayName: string;
  password: string;
}

export interface CompleteAccountResult {
  /** Token en claro. Viaja a la cookie y no se persiste en ningún lado. */
  token: string;
  expiresAt: Date;
  user: AuthenticatedUserDto;
}

/**
 * Completado de la cuenta desde la invitación (HU06 - T2, T3 y T4).
 *
 * Revalida la invitación antes de escribir: entre que la pantalla la validó y la
 * persona eligió su contraseña, la invitación pudo caducar o ser revocada.
 *
 * La contraseña se deriva con el mismo `password-hasher` que usa el login
 * (HU07 - T1), de modo que existe **una sola** función de derivación en el
 * sistema y las cuentas creadas por invitación quedan con el coste calibrado que
 * exige RNF-15. Y al terminar se abre la sesión igual que en un login: token
 * aleatorio en la cookie y sólo su hash en base. Así la persona entra ya
 * autenticada sin que aparezca un segundo mecanismo de sesión en el proyecto.
 */
export class CompleteAccountUseCase {
  constructor(
    private readonly invitations: InvitationsRepository,
    private readonly auth: AuthRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: CompleteAccountInput): Promise<CompleteAccountResult> {
    const now = this.clock.now();
    const invitation = await resolveUsableInvitation(
      this.invitations,
      input.token,
      now,
    );

    const displayName = input.displayName.trim();
    if (displayName.length < LARGO_MINIMO_NOMBRE) {
      throw new InvalidDisplayNameError();
    }

    // T4: la fortaleza se verifica antes de derivar el hash, que es la operación
    // más cara del caso de uso.
    const fortaleza = validatePasswordStrength(input.password);
    if (!fortaleza.valid) {
      throw new WeakPasswordError(undefined, fortaleza.errors);
    }

    // T3: bcrypt con el coste configurado del proyecto.
    const passwordHash = await hashearContrasena(input.password);

    // T2: alta del usuario con los roles de la invitación y marcado de la
    // invitación como usada, en una sola transacción del repositorio.
    const account = await this.invitations.completeAccount({
      invitationId: invitation.id,
      displayName,
      passwordHash,
    });

    const token = generarTokenDeSesion();
    const expiresAt = calcularVencimiento(now);
    await this.auth.createSession({
      userId: account.userId,
      tokenHash: hashearToken(token),
      expiresAt,
    });

    return {
      token,
      expiresAt,
      user: {
        id: account.userId,
        gymId: account.gymId,
        roles: account.roles,
      },
    };
  }
}
