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

  /**
   * Revisa una condición: cierra la anterior y abre la nueva, en una sola
   * transacción (criterio 14).
   *
   * Es atómico a propósito. Si el cierre ocurriera y el alta fallara, el alumno
   * se quedaría sin la condición que quiso corregir, que es peor que no haber
   * modificado nada.
   */
  revise(
    conditionId: string,
    cierre: Date,
    nueva: DeclareConditionCommand,
  ): Promise<{
    cerrada: PhysicalConditionRecord;
    vigente: PhysicalConditionRecord;
  }>;

  /** RN-104: último consentimiento para datos de salud del alumno. */
  hasHealthConsent(studentId: string): Promise<boolean>;

  /**
   * Cuándo declaró el alumno no tener ninguna condición (FL-01/A1). `null` si
   * nunca lo declaró o si después declaró alguna; `undefined` si no existe.
   */
  findNoConditionsDeclaration(
    studentId: string,
  ): Promise<Date | null | undefined>;

  /** Registra la declaración de no tener ninguna condición. */
  declareNoConditions(studentId: string, at: Date): Promise<void>;
}
