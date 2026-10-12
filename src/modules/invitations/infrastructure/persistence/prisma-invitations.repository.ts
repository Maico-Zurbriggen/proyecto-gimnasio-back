import { Prisma, type PrismaClient } from '@prisma/client';

import type { UserRole } from '../../../../shared/types/auth';
import type {
  CompleteAccountCommand,
  CompletedAccountResult,
  InvitationRecord,
  InvitationsRepository,
  IssueInvitationCommand,
  IssuedInvitation,
  IssuedInvitationRecord,
} from '../../application/ports/invitations.repository';
import { errorPorMotivo } from '../../application/use-cases/validate-invitation.use-case';
import {
  InvitationNotFoundError,
  UserAlreadyExistsError,
} from '../../domain/errors/invitation-errors';
import {
  DIAS_VIGENCIA_INVITACION,
  motivoNoUsable,
} from '../../domain/services/invitation-validity';

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** El envío del correo corre dentro de la transacción. */
const OPCIONES_TRANSACCION = { maxWait: 5_000, timeout: 20_000 } as const;

/** Nombre del emisor si es entrenador activo con perfil (será el profesor). */
function nombreDeEntrenador(
  issuer: {
    displayName: string;
    roles: { role: string }[];
    trainerProfile: { userId: string } | null;
  } | null,
): string | null {
  if (
    !issuer ||
    !issuer.trainerProfile ||
    !issuer.roles.some((r) => r.role === 'ENTRENADOR')
  ) {
    return null;
  }
  return issuer.displayName;
}

const emisorSelect = {
  select: {
    displayName: true,
    roles: { select: { role: true } },
    trainerProfile: { select: { userId: true } },
  },
} as const;

function esViolacionDeUnicidad(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

export class PrismaInvitationsRepository implements InvitationsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByTokenHash(tokenHash: string): Promise<InvitationRecord | null> {
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash },
      include: {
        gym: { select: { name: true } },
        roles: { select: { role: true } },
        issuedBy: emisorSelect,
      },
    });
    if (!invitation) {
      return null;
    }
    const roles = invitation.roles.map((r) => r.role as UserRole);

    return {
      id: invitation.id,
      gymId: invitation.gymId,
      gymName: invitation.gym.name,
      emailNormalized: invitation.emailNormalized,
      status: invitation.status,
      issuedAt: invitation.issuedAt,
      expiresAt: invitation.expiresAt,
      roles,
      trainerName: roles.includes('ALUMNO')
        ? nombreDeEntrenador(invitation.issuedBy)
        : null,
    };
  }

  async issue(
    command: IssueInvitationCommand,
    beforeCommit: (issued: IssuedInvitation) => Promise<void>,
  ): Promise<
    IssuedInvitation | 'EMAIL_YA_REGISTRADO' | 'INVITACION_VIGENTE_EXISTENTE'
  > {
    return this.prisma.$transaction(async (tx) => {
      // Serializa las emisiones al mismo correo en el mismo gimnasio: dos
      // pedidos simultáneos no dejan dos invitaciones vigentes.
      await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${`${command.gymId}:${command.emailNormalized}`}))) AS bloqueo`;

      const registered = await tx.user.findUnique({
        where: {
          gymId_emailNormalized: {
            gymId: command.gymId,
            emailNormalized: command.emailNormalized,
          },
        },
        select: { id: true },
      });
      if (registered) return 'EMAIL_YA_REGISTRADO' as const;

      const pending = await tx.invitation.findFirst({
        where: {
          gymId: command.gymId,
          emailNormalized: command.emailNormalized,
          status: 'VIGENTE',
          expiresAt: { gt: command.issuedAt },
        },
        select: { id: true },
      });
      if (pending) return 'INVITACION_VIGENTE_EXISTENTE' as const;

      const invitation = await tx.invitation.create({
        data: {
          gymId: command.gymId,
          issuedByUserId: command.issuedByUserId,
          emailNormalized: command.emailNormalized,
          tokenHash: command.tokenHash,
          issuedAt: command.issuedAt,
          expiresAt: command.expiresAt,
          roles: { create: command.roles.map((role) => ({ role })) },
        },
        select: {
          id: true,
          emailNormalized: true,
          expiresAt: true,
          gym: { select: { name: true } },
          issuedBy: emisorSelect,
        },
      });

      // RN-108/109: auditoría sin el token.
      await tx.auditLog.create({
        data: {
          actorUserId: command.issuedByUserId,
          operation: 'EMISION_INVITACION',
          entityType: 'INVITATION',
          entityId: invitation.id,
          newValue: {
            correo: command.emailNormalized,
            roles: command.roles,
            venceEl: command.expiresAt.toISOString(),
          },
        },
      });

      const issued: IssuedInvitation = {
        id: invitation.id,
        gymName: invitation.gym.name,
        emailNormalized: invitation.emailNormalized,
        roles: command.roles,
        expiresAt: invitation.expiresAt,
        trainerName: nombreDeEntrenador(invitation.issuedBy),
      };
      await beforeCommit(issued);
      return issued;
    }, OPCIONES_TRANSACCION);
  }

  async list(filter: {
    gymId: string;
    issuedByUserId?: string;
  }): Promise<IssuedInvitationRecord[]> {
    const invitations = await this.prisma.invitation.findMany({
      where: {
        gymId: filter.gymId,
        issuedByProvisioning: false,
        ...(filter.issuedByUserId
          ? { issuedByUserId: filter.issuedByUserId }
          : {}),
      },
      orderBy: { issuedAt: 'desc' },
      take: 200,
      select: {
        id: true,
        emailNormalized: true,
        status: true,
        issuedAt: true,
        expiresAt: true,
        roles: { select: { role: true } },
        issuedBy: { select: { displayName: true } },
      },
    });
    return invitations.map((invitation) => ({
      id: invitation.id,
      emailNormalized: invitation.emailNormalized,
      roles: invitation.roles.map((r) => r.role as UserRole),
      status: invitation.status,
      issuedAt: invitation.issuedAt,
      expiresAt: invitation.expiresAt,
      issuedByName: invitation.issuedBy?.displayName ?? null,
    }));
  }

  async completeAccount(
    command: CompleteAccountCommand,
  ): Promise<CompletedAccountResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Consumo condicional (RI-19): la fila queda bloqueada por el UPDATE, y
        // una segunda transacción concurrente reevalúa el WHERE cuando la
        // primera confirma, ve USADA y no actualiza nada.
        const consumed = await tx.invitation.updateMany({
          where: {
            id: command.invitationId,
            status: 'VIGENTE',
            expiresAt: { gt: command.now },
            issuedAt: {
              gt: new Date(
                command.now.getTime() - DIAS_VIGENCIA_INVITACION * MS_POR_DIA,
              ),
            },
          },
          data: { status: 'USADA', usedAt: command.now },
        });

        const invitation = await tx.invitation.findUnique({
          where: { id: command.invitationId },
          include: { roles: { select: { role: true } } },
        });
        if (!invitation) {
          throw new InvitationNotFoundError();
        }
        if (consumed.count === 0) {
          throw errorPorMotivo(
            motivoNoUsable(
              invitation.status,
              invitation.issuedAt,
              invitation.expiresAt,
              command.now,
            ) ?? 'USADA',
          );
        }

        const existing = await tx.user.findUnique({
          where: {
            gymId_emailNormalized: {
              gymId: invitation.gymId,
              emailNormalized: invitation.emailNormalized,
            },
          },
          select: { id: true },
        });
        if (existing) {
          // Se lanza dentro de la transacción: la invitación vuelve a VIGENTE.
          throw new UserAlreadyExistsError();
        }

        // RA-09: los roles salen de la invitación, nunca del pedido.
        const roles = invitation.roles.map((r) => r.role);
        const user = await tx.user.create({
          data: {
            gymId: invitation.gymId,
            invitationId: invitation.id,
            emailNormalized: invitation.emailNormalized,
            displayName: command.displayName,
            passwordHash: command.passwordHash,
            state: 'ACTIVO',
            roles: { create: roles.map((role) => ({ role })) },
          },
          select: {
            id: true,
            gymId: true,
            emailNormalized: true,
            displayName: true,
          },
        });

        // El perfil de alumno nace vacío y se completa en la puesta en contexto
        // (FL-01). Existir desde el alta permite registrar la asignación.
        if (roles.includes('ALUMNO')) {
          await tx.studentProfile.create({ data: { userId: user.id } });
        }
        // Sin perfil profesional un entrenador no puede revisar rutinas ni
        // recibir asignaciones; los datos se completan desde su perfil.
        if (roles.includes('ENTRENADOR')) {
          await tx.trainerProfile.create({
            data: {
              userId: user.id,
              specialty: '',
              experienceYears: 0,
              presentation: '',
            },
          });
        }

        // FL-19/4: si la emitió un entrenador del gimnasio, el alumno queda
        // asignado a él.
        if (roles.includes('ALUMNO') && invitation.issuedByUserId) {
          const issuer = await tx.user.findFirst({
            where: {
              id: invitation.issuedByUserId,
              gymId: invitation.gymId,
              state: 'ACTIVO',
              roles: { some: { role: 'ENTRENADOR' } },
              trainerProfile: { isNot: null },
            },
            select: { id: true },
          });
          if (issuer && issuer.id !== user.id) {
            // Reloj de la base: el trigger de revisión de rutinas compara la
            // asignación contra now() de la base.
            const clock = await tx.$queryRaw<Array<{ now: Date }>>`
              SELECT clock_timestamp() AS now`;
            await tx.trainerStudentAssignment.create({
              data: {
                studentId: user.id,
                trainerId: issuer.id,
                startsAt: clock[0]!.now,
                startedByUserId: issuer.id,
              },
            });
          }
        }

        return {
          userId: user.id,
          gymId: user.gymId,
          email: user.emailNormalized,
          displayName: user.displayName,
          roles: roles as UserRole[],
        };
      });
    } catch (error) {
      // Carrera entre la comprobación y el insert: otra alta con el mismo
      // correo en el mismo gimnasio confirmó primero.
      if (esViolacionDeUnicidad(error)) {
        throw new UserAlreadyExistsError();
      }
      throw error;
    }
  }
}
