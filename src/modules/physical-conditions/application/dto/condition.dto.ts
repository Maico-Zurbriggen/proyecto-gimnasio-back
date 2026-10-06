import type { PhysicalConditionRecord } from '../ports/physical-conditions.repository';
import type { Severidad, ZonaCorporal } from '../../domain/services/body-zones';
import { estabaVigenteEn } from '../../domain/services/condition-validity';

/** Condición física tal como la devuelve la API (HU11). */
export interface PhysicalConditionDto {
  id: string;
  studentId: string;
  bodyZoneCode: ZonaCorporal;
  severity: Severidad;
  description: string | null;
  /** `YYYY-MM-DD` */
  startsOn: string;
  /** `YYYY-MM-DD`, o `null` si sigue abierta. */
  endsOn: string | null;
  /** Derivado: si rige en el instante de la consulta. */
  vigente: boolean;
}

function soloDia(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

export function toConditionDto(
  record: PhysicalConditionRecord,
  ahora: Date,
): PhysicalConditionDto {
  return {
    id: record.id,
    studentId: record.studentId,
    bodyZoneCode: record.bodyZoneCode,
    severity: record.severity,
    description: record.description,
    startsOn: soloDia(record.startsOn),
    endsOn: record.endsOn ? soloDia(record.endsOn) : null,
    vigente: estabaVigenteEn(record, ahora),
  };
}
