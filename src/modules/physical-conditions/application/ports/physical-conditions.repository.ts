import type { Severidad, ZonaCorporal } from '../../domain/services/body-zones';

/** Condición física tal como se persiste. */
export interface PhysicalConditionRecord {
  id: string;
  studentId: string;
  bodyZoneCode: ZonaCorporal;
  severity: Severidad;
  description: string | null;
  startsOn: Date;
  endsOn: Date | null;
}

export interface DeclareConditionCommand {
  studentId: string;
  bodyZoneCode: ZonaCorporal;
  severity: Severidad;
  description: string | null;
  startsOn: Date;
}

export interface PhysicalConditionsRepository {
  /** Declara una condición. `null` si el alumno no existe. */
  declare(
    command: DeclareConditionCommand,
  ): Promise<PhysicalConditionRecord | null>;

  /** Historial completo del alumno, de la más reciente a la más antigua. */
  listByStudent(studentId: string): Promise<PhysicalConditionRecord[]>;

  /** Una condición concreta de ese alumno. `null` si no existe. */
  findById(
    conditionId: string,
    studentId: string,
  ): Promise<PhysicalConditionRecord | null>;

  /** Cierra la condición con la fecha indicada. */
  close(conditionId: string, endsOn: Date): Promise<PhysicalConditionRecord>;
}
