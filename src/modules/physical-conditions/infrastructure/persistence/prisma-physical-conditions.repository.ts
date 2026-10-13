import type { PrismaClient } from '@prisma/client';

import { isUuid } from '../../../../shared/types/uuid';
import type {
  DeclareConditionCommand,
  PhysicalConditionRecord,
  PhysicalConditionsRepository,
} from '../../application/ports/physical-conditions.repository';
import type { Severidad, ZonaCorporal } from '../../domain/services/body-zones';

interface Row {
  id: string;
  studentId: string;
  bodyZoneCode: string;
  severity: string;
  description: string | null;
  startsOn: Date;
  endsOn: Date | null;
}

function toRecord(row: Row): PhysicalConditionRecord {
  return {
    id: row.id,
    studentId: row.studentId,
    bodyZoneCode: row.bodyZoneCode as ZonaCorporal,
    severity: row.severity as Severidad,
    description: row.description,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
  };
}

export class PrismaPhysicalConditionsRepository implements PhysicalConditionsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async declare(
    command: DeclareConditionCommand,
  ): Promise<PhysicalConditionRecord | null> {
    if (!isUuid(command.studentId)) {
      return null;
    }

    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId: command.studentId },
      select: { userId: true },
    });
    if (!profile) {
      return null;
    }

    // FL-01/A1: declarar una condición anula la declaración de "ninguna".
    const [created] = await this.prisma.$transaction([
      this.prisma.physicalCondition.create({
        data: {
          studentId: command.studentId,
          bodyZoneCode: command.bodyZoneCode,
          severity: command.severity,
          description: command.description,
          startsOn: command.startsOn,
        },
      }),
      this.prisma.studentProfile.update({
        where: { userId: command.studentId },
        data: { noConditionsDeclaredAt: null },
      }),
    ]);

    return toRecord(created);
  }

  async listByStudent(studentId: string): Promise<PhysicalConditionRecord[]> {
    if (!isUuid(studentId)) {
      return [];
    }

    const rows = await this.prisma.physicalCondition.findMany({
      where: { studentId },
      orderBy: { startsOn: 'desc' },
    });

    return rows.map(toRecord);
  }

  async findById(
    conditionId: string,
    studentId: string,
  ): Promise<PhysicalConditionRecord | null> {
    if (!isUuid(conditionId) || !isUuid(studentId)) {
      return null;
    }

    // El filtro por alumno es parte de la consulta: una condición de otro
    // alumno responde «no existe», sin revelar si existe (RNF-14).
    const row = await this.prisma.physicalCondition.findFirst({
      where: { id: conditionId, studentId },
    });

    return row ? toRecord(row) : null;
  }

  async close(
    conditionId: string,
    endsOn: Date,
  ): Promise<PhysicalConditionRecord> {
    const updated = await this.prisma.physicalCondition.update({
      where: { id: conditionId },
      data: { endsOn },
    });

    return toRecord(updated);
  }

  async hasHealthConsent(studentId: string): Promise<boolean> {
    if (!isUuid(studentId)) return false;
    const consent = await this.prisma.consent.findFirst({
      where: { userId: studentId, type: 'DATOS_SALUD' },
      orderBy: { recordedAt: 'desc' },
      select: { granted: true },
    });
    return consent?.granted ?? false;
  }

  async findNoConditionsDeclaration(
    studentId: string,
  ): Promise<Date | null | undefined> {
    if (!isUuid(studentId)) return undefined;
    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId: studentId },
      select: { noConditionsDeclaredAt: true },
    });
    return profile ? profile.noConditionsDeclaredAt : undefined;
  }

  async declareNoConditions(studentId: string, at: Date): Promise<void> {
    await this.prisma.studentProfile.update({
      where: { userId: studentId },
      data: { noConditionsDeclaredAt: at },
    });
  }
}
