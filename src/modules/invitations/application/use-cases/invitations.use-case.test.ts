import { beforeEach, describe, expect, it } from 'vitest';

import type {
  AuthRepository,
  CreateSessionCommand,
} from '../../../auth/application/ports/auth.repository';
import { contrasenaCoincide } from '../../../auth/domain/services/password-hasher';
import { hashearToken } from '../../../auth/domain/services/session-token';
import type { Clock } from '../../../routines/application/ports/clock';
import {
  InvalidDisplayNameError,
  InvitationAlreadyUsedError,
  InvitationExpiredError,
  InvitationNotFoundError,
  InvitationRevokedError,
  WeakPasswordError,
} from '../../domain/errors/invitation-errors';
import type {
  CompleteAccountCommand,
  CompletedAccountResult,
  InvitationRecord,
  InvitationsRepository,
} from '../ports/invitations.repository';
import { CompleteAccountUseCase } from './complete-account.use-case';
import { ValidateInvitationUseCase } from './validate-invitation.use-case';

const AHORA = new Date('2026-09-21T10:00:00Z');
const TOKEN = 'tok_9Qm2xV4c7HbZp1sKfW8yLr3nTe6uJd0a';
const INVITATION_ID = 'e48ca620-13d8-4f24-9b59-7b70743b1790';
const USER_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const CONTRASENA = 'ClaveSegura2026';

const clock: Clock = { now: () => AHORA };

/** Doble en memoria indexado por el hash del token, como la tabla real. */
class InMemoryInvitations implements InvitationsRepository {
  readonly records = new Map<string, InvitationRecord>();
  readonly completed: CompleteAccountCommand[] = [];

  /** El registro del token de pruebas. */
  get current(): InvitationRecord {
    return this.records.get(hashearToken(TOKEN))!;
  }

  // La emisión se prueba en su propio archivo.
  issue(): Promise<never> {
    return Promise.reject(new Error('no usado en las pruebas de alta'));
  }

  list(): Promise<[]> {
    return Promise.resolve([]);
  }

  findByTokenHash(tokenHash: string): Promise<InvitationRecord | null> {
    return Promise.resolve(this.records.get(tokenHash) ?? null);
  }

  completeAccount(
    command: CompleteAccountCommand,
  ): Promise<CompletedAccountResult> {
    this.completed.push(command);
    const record = [...this.records.values()].find(
      (item) => item.id === command.invitationId,
    );
    if (!record) {
      return Promise.reject(new InvitationNotFoundError());
    }
    if (record.status !== 'VIGENTE') {
      return Promise.reject(new InvitationAlreadyUsedError());
    }
    record.status = 'USADA';
    return Promise.resolve({
      userId: USER_ID,
      gymId: record.gymId,
      email: record.emailNormalized,
      displayName: command.displayName,
      roles: record.roles,
    });
  }
}

function createAuthRepo(): {
  repo: AuthRepository;
  sessions: CreateSessionCommand[];
} {
  const sessions: CreateSessionCommand[] = [];
  const repo: AuthRepository = {
    findCredentialsByEmail: () => Promise.resolve(null),
    createSession: (command) => {
      sessions.push(command);
      return Promise.resolve();
    },
    findSessionByTokenHash: () => Promise.resolve(null),
    touchSession: () => Promise.resolve(),
    revokeSession: () => Promise.resolve(),
  };
  return { repo, sessions };
}

describe('Casos de uso de invitaciones (HU06)', () => {
  let invitations: InMemoryInvitations;
  let auth: ReturnType<typeof createAuthRepo>;
  let validate: ValidateInvitationUseCase;
  let complete: CompleteAccountUseCase;

  beforeEach(() => {
    invitations = new InMemoryInvitations();
    auth = createAuthRepo();
    validate = new ValidateInvitationUseCase(invitations, clock);
    complete = new CompleteAccountUseCase(invitations, auth.repo, clock);

    invitations.records.set(hashearToken(TOKEN), {
      id: INVITATION_ID,
      gymId: '11111111-1111-4111-8111-111111111111',
      gymName: 'Gimnasio Central',
      emailNormalized: 'nuevo.alumno@gym.test',
      status: 'VIGENTE',
      issuedAt: new Date('2026-09-15T10:00:00Z'),
      expiresAt: new Date('2026-09-25T10:00:00Z'),
      roles: ['ALUMNO'],
      trainerName: 'Lucía',
    });
  });

  describe('ValidateInvitationUseCase (T1 y T6)', () => {
    it('devuelve los datos públicos de una invitación vigente', async () => {
      const result = await validate.execute(TOKEN);

      // Sin identificadores internos: el enlace es la única credencial.
      expect(result).toEqual({
        gymName: 'Gimnasio Central',
        email: 'nuevo.alumno@gym.test',
        roles: ['ALUMNO'],
        expiresAt: '2026-09-25T10:00:00.000Z',
        trainerName: 'Lucía',
        healthConsentText: expect.stringContaining('datos de salud'),
      });
    });

    it('rechaza un token inexistente', async () => {
      await expect(validate.execute('otro-token')).rejects.toBeInstanceOf(
        InvitationNotFoundError,
      );
    });

    it('rechaza un token vacío sin consultar el repositorio', async () => {
      await expect(validate.execute('   ')).rejects.toBeInstanceOf(
        InvitationNotFoundError,
      );
    });

    it('T6: distingue una invitación ya usada', async () => {
      invitations.current.status = 'USADA';

      await expect(validate.execute(TOKEN)).rejects.toBeInstanceOf(
        InvitationAlreadyUsedError,
      );
    });

    it('T6: distingue una invitación revocada', async () => {
      invitations.current.status = 'REVOCADA';

      await expect(validate.execute(TOKEN)).rejects.toBeInstanceOf(
        InvitationRevokedError,
      );
    });

    it('T6: distingue una invitación marcada como caducada', async () => {
      invitations.current.status = 'CADUCADA';

      await expect(validate.execute(TOKEN)).rejects.toBeInstanceOf(
        InvitationExpiredError,
      );
    });

    it('el token se busca por su hash: el valor en claro no está en la base', async () => {
      expect(invitations.records.has(TOKEN)).toBe(false);
      await expect(validate.execute(TOKEN)).resolves.toBeDefined();
    });

    it('criterio 21: vence a los 14 días de emitida aunque expires_at diga otra cosa', async () => {
      invitations.current.issuedAt = new Date('2026-09-07T09:00:00Z');
      invitations.current.expiresAt = new Date('2026-12-31T00:00:00Z');

      await expect(validate.execute(TOKEN)).rejects.toBeInstanceOf(
        InvitationExpiredError,
      );
    });

    it('criterio 2: cada motivo tiene un código distinguible', async () => {
      const codes: string[] = [];
      for (const status of ['USADA', 'REVOCADA', 'CADUCADA'] as const) {
        invitations.current.status = status;
        await validate.execute(TOKEN).catch((error: { code: string }) => {
          codes.push(error.code);
        });
      }
      expect(codes).toEqual(['USADA', 'REVOCADA', 'VENCIDA']);
    });

    it('T6: caduca por fecha aunque el estado siga en VIGENTE', async () => {
      invitations.current.expiresAt = new Date('2026-09-20T10:00:00Z');

      await expect(validate.execute(TOKEN)).rejects.toBeInstanceOf(
        InvitationExpiredError,
      );
    });
  });

  describe('CompleteAccountUseCase (T2, T3 y T4)', () => {
    it('T2: crea la cuenta con los roles de la invitación y la consume', async () => {
      const result = await complete.execute({
        token: TOKEN,
        displayName: '  Ana Pérez  ',
        password: CONTRASENA,
      });

      expect(result.user).toEqual({
        id: USER_ID,
        gymId: '11111111-1111-4111-8111-111111111111',
        roles: ['ALUMNO'],
      });
      expect(invitations.completed).toHaveLength(1);
      // El nombre llega sin espacios sobrantes.
      expect(invitations.completed[0]?.displayName).toBe('Ana Pérez');
      expect(invitations.current.status).toBe('USADA');
    });

    it('T3: persiste la contraseña hasheada, nunca en claro', async () => {
      await complete.execute({
        token: TOKEN,
        displayName: 'Ana Pérez',
        password: CONTRASENA,
      });

      const hash = invitations.completed[0]?.passwordHash ?? '';
      expect(hash).not.toBe(CONTRASENA);
      expect(hash.startsWith('$2')).toBe(true);
      await expect(contrasenaCoincide(CONTRASENA, hash)).resolves.toBe(true);
    });

    it('abre la sesión con el mismo mecanismo que el login: sólo el hash del token', async () => {
      const result = await complete.execute({
        token: TOKEN,
        displayName: 'Ana Pérez',
        password: CONTRASENA,
      });

      expect(auth.sessions).toHaveLength(1);
      const session = auth.sessions[0];
      expect(session?.userId).toBe(USER_ID);
      expect(session?.tokenHash).toBe(hashearToken(result.token));
      expect(session?.tokenHash).not.toBe(result.token);
      // 30 días de inactividad desde el completado (RN-07).
      expect(result.expiresAt.toISOString()).toBe('2026-10-21T10:00:00.000Z');
    });

    it('T4: rechaza una contraseña débil enumerando los requisitos', async () => {
      await expect(
        complete.execute({
          token: TOKEN,
          displayName: 'Ana Pérez',
          password: 'passwordfacil',
        }),
      ).rejects.toBeInstanceOf(WeakPasswordError);

      expect(invitations.completed).toHaveLength(0);
      expect(auth.sessions).toHaveLength(0);
    });

    it('rechaza un nombre de menos de dos caracteres', async () => {
      await expect(
        complete.execute({
          token: TOKEN,
          displayName: ' A ',
          password: CONTRASENA,
        }),
      ).rejects.toBeInstanceOf(InvalidDisplayNameError);

      expect(invitations.completed).toHaveLength(0);
    });

    it('revalida la invitación: una caducada no crea cuenta ni sesión', async () => {
      invitations.current.expiresAt = new Date('2026-09-20T10:00:00Z');

      await expect(
        complete.execute({
          token: TOKEN,
          displayName: 'Ana Pérez',
          password: CONTRASENA,
        }),
      ).rejects.toBeInstanceOf(InvitationExpiredError);

      expect(invitations.completed).toHaveLength(0);
      expect(auth.sessions).toHaveLength(0);
    });

    it('la invitación no se puede usar dos veces', async () => {
      await complete.execute({
        token: TOKEN,
        displayName: 'Ana Pérez',
        password: CONTRASENA,
      });

      await expect(
        complete.execute({
          token: TOKEN,
          displayName: 'Ana Pérez',
          password: CONTRASENA,
        }),
      ).rejects.toBeInstanceOf(InvitationAlreadyUsedError);

      expect(auth.sessions).toHaveLength(1);
    });
  });
});
