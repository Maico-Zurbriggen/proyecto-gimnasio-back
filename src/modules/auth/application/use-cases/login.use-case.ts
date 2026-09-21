import type { Clock } from '../../../routines/application/ports/clock';
import { InvalidCredentialsError } from '../../domain/errors/auth-errors';
import { contrasenaCoincide } from '../../domain/services/password-hasher';
import { calcularVencimiento } from '../../domain/services/session-policy';
import {
  generarTokenDeSesion,
  hashearToken,
} from '../../domain/services/session-token';
import type { AuthenticatedUserDto } from '../dto/session.dto';
import type { AuthRepository } from '../ports/auth.repository';

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginResult {
  /** Token en claro. Viaja a la cookie y no se persiste en ningún lado. */
  token: string;
  expiresAt: Date;
  user: AuthenticatedUserDto;
}

/** Normaliza el correo igual que el alta: sin espacios y en minúsculas. */
function normalizarCorreo(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Inicio de sesión (HU07 - T1 y T2).
 *
 * Verifica la contraseña con bcrypt, crea la sesión y devuelve el token en claro
 * para que el adaptador HTTP lo ponga en una cookie httpOnly. En base sólo queda
 * el hash del token.
 *
 * Correo inexistente, contraseña incorrecta y cuenta suspendida devuelven el mismo
 * error, para no revelar qué direcciones están registradas.
 */
export class LoginUseCase {
  constructor(
    private readonly auth: AuthRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: LoginInput): Promise<LoginResult> {
    const emailNormalized = normalizarCorreo(input.email);
    const credentials = await this.auth.findCredentialsByEmail(emailNormalized);

    // Se verifica la contraseña incluso sin usuario, contra un hash de descarte,
    // para que el tiempo de respuesta no delate si el correo existe.
    const hashAComparar =
      credentials?.passwordHash ??
      '$2b$12$0000000000000000000000000000000000000000000000000000';

    const coincide = await contrasenaCoincide(input.password, hashAComparar);

    if (!credentials || !coincide || credentials.state !== 'ACTIVO') {
      throw new InvalidCredentialsError();
    }

    const now = this.clock.now();
    const token = generarTokenDeSesion();
    const expiresAt = calcularVencimiento(now);

    await this.auth.createSession({
      userId: credentials.id,
      tokenHash: hashearToken(token),
      expiresAt,
    });

    return {
      token,
      expiresAt,
      user: {
        id: credentials.id,
        gymId: credentials.gymId,
        roles: credentials.roles,
      },
    };
  }
}
