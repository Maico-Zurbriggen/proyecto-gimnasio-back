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
  measurementBlockState:
    'NORMAL' | 'PENDIENTE_MEDICION' | 'PENDIENTE_APROBACION';
  motivoBloqueo: string | null;
  /** Fecha `YYYY-MM-DD` de la última medición corporal registrada. */
  fechaUltimaMedicion: string | null;
  faltasConsecutivas: number;
  blockedAt: string | null;
  submittedAt: string | null;
  alturaCm: number;
}

export interface TrainerStudentDto extends StudentStatusDto {
  objetivo: string | null;
  rutinaVigente: {
    routineType: string;
    diasRestantesRenovacion: number;
    estadoAviso: EstadoAvisoRenovacion;
  } | null;
  rutinasPendientesRevision: number;
  propuestasAdaptacionPendientes: number;
}

export function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function toStudentStatusDto(record: StudentRecord): StudentStatusDto {
  const block = evaluateStudentBlock({
    activeBlock: record.activeMeasurementBlock,
    checkpointResults: record.checkpointResults,
  });

  return {
    studentId: record.id,
    displayName: record.displayName,
    ...block,
    blockedAt: block.blockedAt?.toISOString() ?? null,
    submittedAt: block.submittedAt?.toISOString() ?? null,
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
    ...toStudentStatusDto(record),
    objetivo: record.goal,
    rutinaVigente:
      record.activeRoutine && notice
        ? {
            routineType: record.activeRoutine.routineType,
            diasRestantesRenovacion: notice.diasRestantes,
            estadoAviso: notice.estado,
          }
        : null,
    rutinasPendientesRevision: record.pendingRoutineReviews,
    propuestasAdaptacionPendientes: record.pendingAdaptationProposals,
  };
}
