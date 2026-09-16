import {
  calculateRenewalNotice,
  type EstadoAvisoRenovacion,
} from '../../../routines/domain/services/routine-renewal';
import { evaluateStudentBlock } from '../../domain/services/student-block';
import type {
  AssignedStudentRecord,
  StudentRecord,
} from '../ports/students.repository';

export interface StudentStatusDto {
  studentId: string;
  displayName: string;
  bloqueado: boolean;
  motivoBloqueo: string | null;
  /** Fecha `YYYY-MM-DD` de la última medición corporal registrada. */
  fechaUltimaMedicion: string | null;
  faltasConsecutivas: number;
  alturaCm: number;
}

export interface TrainerStudentDto extends StudentStatusDto {
  objetivo: string | null;
  rutinaVigente: {
    routineType: string;
    diasRestantesRenovacion: number;
    estadoAviso: EstadoAvisoRenovacion;
  } | null;
  propuestasPendientes: number;
}

export function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function toStudentStatusDto(
  record: StudentRecord,
  now: Date,
): StudentStatusDto {
  const block = evaluateStudentBlock({
    state: record.state,
    lastMeasurementOn: record.lastMeasurementOn,
    registeredAt: record.registeredAt,
    now,
  });

  return {
    studentId: record.id,
    displayName: record.displayName,
    ...block,
    fechaUltimaMedicion: record.lastMeasurementOn
      ? toDateOnly(record.lastMeasurementOn)
      : null,
    alturaCm: record.heightCm,
  };
}

export function toTrainerStudentDto(
  record: AssignedStudentRecord,
  now: Date,
): TrainerStudentDto {
  const notice = record.activeRoutine
    ? calculateRenewalNotice(record.activeRoutine.cycleStart, now)
    : null;

  return {
    ...toStudentStatusDto(record, now),
    objetivo: record.goal,
    rutinaVigente:
      record.activeRoutine && notice
        ? {
            routineType: record.activeRoutine.routineType,
            diasRestantesRenovacion: notice.diasRestantes,
            estadoAviso: notice.estado,
          }
        : null,
    propuestasPendientes: record.pendingProposals,
  };
}
