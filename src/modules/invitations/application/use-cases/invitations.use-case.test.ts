import { beforeEach, describe, expect, it } from 'vitest';

import type { Clock } from '../../../routines/application/ports/clock';
import {
  InvitationAlreadyUsedError,
  InvitationExpiredError,
  InvitationNotFoundError,
  InvitationRevokedError,
  WeakPasswordError,
} from '../../domain/errors/invitation-errors';
import { JwtTokenService } from '../../domain/services/jwt-token.service';
import { PasswordHasher } from '../../domain/services/password-hasher.service';
import type {
  CompleteAccountCommand,
  CompletedAccountResult,
  InvitationRecord,
  InvitationsRepository,
} from '../ports/invitations.repository';
import { CompleteAccountUseCase } from './complete-account.use-case';
import { ValidateInvitationUseCase } from './validate-invitation.use-case';

class FakeClock implements Clock {
  constructor(private currentDate: Date = new Date('2026-09-16T12:00:00Z')) {}
  now(): Date {
    return new Date(this.currentDate);
  }
  set(date: Date) {
    this.currentDate = date;
  }
}

class InMemoryInvitationsRepository implements InvitationsRepository {
  public records = new Map<string, InvitationRecord>();
  public completedCommands: CompleteAccountCommand[] = [];

  async findByToken(token: string): Promise<InvitationRecord | null> {
    return this.records.get(token) ?? null;
  }

  async completeAccount(
    command: CompleteAccountCommand,
  ): Promise<CompletedAccountResult> {
    this.completedCommands.push(command);
    const record = this.records.get(command.invitationId);
    if (!record) throw new InvitationNotFoundError();
    record.status = 'USADA';

    return {
      userId: 'created-user-123',
      gymId: record.gymId,
      email: record.emailNormalized,
      displayName: command.displayName,
      roles: record.roles,
    };
  }
}

describe('Invitations Use Cases (HU06 - T1, T2, T3, T4, T6)', () => {
  let repository: InMemoryInvitationsRepository;
  let clock: FakeClock;
  let validateUseCase: ValidateInvitationUseCase;
  let completeUseCase: CompleteAccountUseCase;

  const validToken = 'e48ca620-13d8-4f24-9b59-7b70743b1790';

  beforeEach(() => {
    repository = new InMemoryInvitationsRepository();
    clock = new FakeClock(new Date('2026-09-16T10:00:00Z'));
    validateUseCase = new ValidateInvitationUseCase(repository, clock);
    completeUseCase = new CompleteAccountUseCase(repository, clock);

    repository.records.set(validToken, {
      id: validToken,
      gymId: 'gym-001',
      gymName: 'Gym Central',
      issuedByUserId: 'trainer-001',
      issuedByUserRoles: ['ENTRENADOR'],
      emailNormalized: 'alumno.nuevo@example.com',
      status: 'VIGENTE',
      issuedAt: new Date('2026-09-15T10:00:00Z'),
      expiresAt: new Date('2026-09-18T10:00:00Z'),
      roles: ['ALUMNO'],
    });
  });

  describe('ValidateInvitationUseCase (T1, T6)', () => {
    it('valida exitosamente una invitación vigente', async () => {
      const result = await validateUseCase.execute(validToken);

      expect(result.id).toBe(validToken);
      expect(result.gymName).toBe('Gym Central');
      expect(result.email).toBe('alumno.nuevo@example.com');
      expect(result.roles).toEqual(['ALUMNO']);
    });

    it('falla con InvitationNotFoundError si el token no existe', async () => {
      await expect(
        validateUseCase.execute('00000000-0000-0000-0000-000000000000'),
      ).rejects.toBeInstanceOf(InvitationNotFoundError);
    });

    it('falla con InvitationAlreadyUsedError si ya fue utilizada (T6)', async () => {
      repository.records.get(validToken)!.status = 'USADA';

      await expect(validateUseCase.execute(validToken)).rejects.toBeInstanceOf(
        InvitationAlreadyUsedError,
      );
    });

    it('falla con InvitationRevokedError si fue revocada (T6)', async () => {
      repository.records.get(validToken)!.status = 'REVOCADA';

      await expect(validateUseCase.execute(validToken)).rejects.toBeInstanceOf(
        InvitationRevokedError,
      );
    });

    it('falla con InvitationExpiredError si status es CADUCADA (T6)', async () => {
      repository.records.get(validToken)!.status = 'CADUCADA';

      await expect(validateUseCase.execute(validToken)).rejects.toBeInstanceOf(
        InvitationExpiredError,
      );
    });

    it('falla con InvitationExpiredError si la fecha de expiración ya pasó (T6)', async () => {
      clock.set(new Date('2026-09-20T00:00:00Z')); // Pasó el 18 de septiembre

      await expect(validateUseCase.execute(validToken)).rejects.toBeInstanceOf(
        InvitationExpiredError,
      );
    });
  });

  describe('CompleteAccountUseCase (T2, T3, T4)', () => {
    it('rechaza contraseñas débiles con WeakPasswordError (T4)', async () => {
      await expect(
        completeUseCase.execute({
          token: validToken,
          displayName: 'Juan Perez',
          password: 'debilesinnumero',
        }),
      ).rejects.toBeInstanceOf(WeakPasswordError);
    });

    it('completa la cuenta, hashea la contraseña y emite JWT válido (T2, T3)', async () => {
      const result = await completeUseCase.execute({
        token: validToken,
        displayName: 'Juan Perez',
        password: 'PasswordSeguro123',
      });

      expect(result.user.displayName).toBe('Juan Perez');
      expect(result.user.email).toBe('alumno.nuevo@example.com');
      expect(result.user.roles).toEqual(['ALUMNO']);

      // Verifica comando guardado con hash seguro
      expect(repository.completedCommands).toHaveLength(1);
      const command = repository.completedCommands[0]!;
      expect(command.displayName).toBe('Juan Perez');
      const isHashValid = await PasswordHasher.compare(
        'PasswordSeguro123',
        command.passwordHash,
      );
      expect(isHashValid).toBe(true);

      // Verifica invitación marcada como USADA (T2)
      expect(repository.records.get(validToken)?.status).toBe('USADA');

      // Verifica JWT emitido y descriptible (T3)
      const decoded = JwtTokenService.verify(result.token);
      expect(decoded.sub).toBe('created-user-123');
      expect(decoded.email).toBe('alumno.nuevo@example.com');
      expect(decoded.gymId).toBe('gym-001');
      expect(decoded.roles).toEqual(['ALUMNO']);
    });
  });
});
