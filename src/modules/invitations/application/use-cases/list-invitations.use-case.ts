import type { UserRole } from '../../../../shared/types/auth';
import type { Clock } from '../../../routines/application/ports/clock';
import {
  estadoEfectivo,
  type EstadoInvitacion,
} from '../../domain/services/invitation-issuing';
import type { InvitationsRepository } from '../ports/invitations.repository';

export interface ListInvitationsInput {
  actor: { id: string; gymId: string; roles: UserRole[] };
}

/** Invitación tal como se lista (criterio 15). */
export interface ListedInvitationDto {
  id: string;
  email: string;
  roles: UserRole[];
  issuedByUserId: string;
  issuedByName: string;
  issuedAt: string;
  expiresAt: string;
  /** Estado efectivo: `CADUCADA` se deriva del vencimiento. */
  status: EstadoInvitacion;
}

/**
 * Listado de invitaciones del gimnasio (HU08 - T3).
 *
 * El administrador ve todas las del gimnasio; el entrenador, **sólo las que
 * emitió** (criterio 14, RA-02). El gimnasio sale del actor, nunca de la
 * petición.
 */
export class ListInvitationsUseCase {
  constructor(
    private readonly invitations: InvitationsRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: ListInvitationsInput): Promise<ListedInvitationDto[]> {
    const esAdministrador = input.actor.roles.includes('ADMINISTRADOR');

    const records = await this.invitations.list({
      gymId: input.actor.gymId,
      issuedByUserId: esAdministrador ? undefined : input.actor.id,
    });

    const now = this.clock.now();

    return records.map((record) => ({
      id: record.id,
      email: record.emailNormalized,
      roles: record.roles,
      issuedByUserId: record.issuedByUserId,
      issuedByName: record.issuedByName,
      issuedAt: record.issuedAt.toISOString(),
      expiresAt: record.expiresAt.toISOString(),
      status: estadoEfectivo(record.status, record.expiresAt, now),
    }));
  }
}
