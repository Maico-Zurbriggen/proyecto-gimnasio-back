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

    const created = await this.prisma.physicalCondition.create({
      data: {
        studentId: command.studentId,
        bodyZoneCode: command.bodyZoneCode,
        severity: command.severity,
        description: command.description,
        startsOn: command.startsOn,
      },
    });

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
}
