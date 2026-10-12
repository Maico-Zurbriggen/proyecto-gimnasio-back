import { Prisma, type PrismaClient } from '@prisma/client';

import type { UserRole } from '../../../../shared/types/auth';
import type {
  CompleteAccountCommand,
  CompletedAccountResult,
  InvitationRecord,
  InvitationsRepository,
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
      },
    });
    if (!invitation) {
      return null;
    }

    return {
      id: invitation.id,
      gymId: invitation.gymId,
      gymName: invitation.gym.name,
      emailNormalized: invitation.emailNormalized,
      status: invitation.status,
      issuedAt: invitation.issuedAt,
      expiresAt: invitation.expiresAt,
      roles: invitation.roles.map((r) => r.role as UserRole),
    };
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
            await tx.trainerStudentAssignment.create({
              data: {
                studentId: user.id,
                trainerId: issuer.id,
                startsAt: command.now,
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
