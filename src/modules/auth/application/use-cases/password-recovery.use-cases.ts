import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';

import { validatePasswordStrength } from '../../../invitations/domain/services/password-strength.service';
import type { Clock } from '../../../routines/application/ports/clock';
import { hashearContrasena } from '../../domain/services/password-hasher';
import {
  generarTokenDeSesion,
  hashearToken,
} from '../../domain/services/session-token';
import type {
  PasswordRecoveryRepository,
  RecoveryMailer,
} from '../ports/password-recovery.repository';

export class WeakPasswordError extends Error {}
export class InvalidRecoveryTokenError extends Error {}
export class InvalidPasswordSessionError extends Error {}

function validate(password: string): void {
  if (
    !validatePasswordStrength(password).valid ||
    Buffer.byteLength(password, 'utf8') > 72
  ) {
    throw new WeakPasswordError();
  }
}

export class RequestPasswordRecoveryUseCase {
  constructor(
    private readonly repository: PasswordRecoveryRepository,
    private readonly mailer: RecoveryMailer,
    private readonly clock: Clock,
  ) {}

  async execute(email: string, origin: string): Promise<{ limited: boolean }> {
    const start = performance.now();
    let limited = false;
    try {
      const now = this.clock.now();
      const token = generarTokenDeSesion();
      const pending = this.repository.issue({
        email: email.trim().toLowerCase(),
        originHash: hashearToken(origin),
        tokenHash: hashearToken(token),
        now,
        expiresAt: new Date(now.getTime() + 2 * 60 * 60 * 1000),
      });
      // También acota conexión/inicialización, fuera del timeout transaccional
      // de Prisma. Un resultado tardío nunca dispara un correo en segundo plano.
      const deadline = new AbortController();
      let issued: Awaited<ReturnType<PasswordRecoveryRepository['issue']>>;
      try {
        issued = await Promise.race([
          pending,
          delay(1500, undefined, { signal: deadline.signal }).then(() => {
            throw new Error('Recovery persistence timeout');
          }),
        ]);
      } finally {
        deadline.abort();
      }
      limited = issued.limited;
      await Promise.all(
        issued.recipients.map((recipient) =>
          this.mailer.send(recipient, token),
        ),
      );
    } catch {
      // No cuenta, token ni excepción del proveedor en logs o respuestas.
      console.error('Password recovery delivery unavailable');
    } finally {
      // Presupuesto DB <= 1500 ms y transporte <= 1500 ms. Todos los casos
      // públicos esperan la misma ventana, incluidos rechazos y fallos.
      await delay(Math.max(0, 3500 - (performance.now() - start)));
    }
    return { limited };
  }
}

export class ResetPasswordUseCase {
  constructor(
    private readonly repository: PasswordRecoveryRepository,
    private readonly clock: Clock,
  ) {}
  async execute(token: string, password: string): Promise<void> {
    validate(password);
    const hash = await hashearContrasena(password);
    if (
      !(await this.repository.reset(
        hashearToken(token),
        hash,
        this.clock.now(),
      ))
    )
      throw new InvalidRecoveryTokenError();
  }
}

export class ChangePasswordUseCase {
  constructor(
    private readonly repository: PasswordRecoveryRepository,
    private readonly clock: Clock,
  ) {}
  async execute(
    userId: string,
    sessionId: string | undefined,
    password: string,
  ): Promise<void> {
    if (!sessionId) throw new InvalidPasswordSessionError();
    validate(password);
    const hash = await hashearContrasena(password);
    if (
      !(await this.repository.change(userId, sessionId, hash, this.clock.now()))
    )
      throw new InvalidPasswordSessionError();
  }
}
