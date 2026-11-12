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
  /** `null` mientras el alumno no completó su puesta en contexto (FL-01). */
  alturaCm: number | null;
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
  ultimaSesion: string | null;
  adherenciaReciente: number | null;
  estadoAdherencia: 'DISPONIBLE' | 'DATOS_INSUFICIENTES';
  senales: Array<
    | 'INCOMPATIBILIDAD_SOBREVENIDA'
    | 'ESTANCAMIENTO'
    | 'CAIDA_ADHERENCIA'
    | 'DATOS_INSUFICIENTES'
  >;
  prioridad: number;
  motivoPrioridad:
    | 'REVISION_PENDIENTE'
    | 'INCOMPATIBILIDAD_SOBREVENIDA'
    | 'ESTANCAMIENTO'
    | 'CAIDA_ADHERENCIA'
    | 'SIN_SENAL';
}

export interface TrainerStudentIndicators {
  adherence: number | null;
  insufficientData: boolean;
  stagnation: boolean;
  adherenceDrop: boolean;
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
  indicators: TrainerStudentIndicators,
): TrainerStudentDto {
  const notice = record.activeRoutine
    ? calculateRenewalNotice(record.activeRoutine.cycleStart, now)
    : null;

  const hasPendingReview =
    record.pendingRoutineReviews + record.pendingAdaptationProposals > 0;
  const priority = hasPendingReview
    ? 1
    : record.activeRoutine?.hasUnresolvedIncompatibility
      ? 2
      : indicators.stagnation
        ? 3
        : indicators.adherenceDrop
          ? 4
          : 5;
  const signals: TrainerStudentDto['senales'] = [];
  if (record.activeRoutine?.hasUnresolvedIncompatibility)
    signals.push('INCOMPATIBILIDAD_SOBREVENIDA');
  if (indicators.stagnation) signals.push('ESTANCAMIENTO');
  if (indicators.adherenceDrop) signals.push('CAIDA_ADHERENCIA');
  if (signals.length === 0 && indicators.insufficientData)
    signals.push('DATOS_INSUFICIENTES');

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
    ultimaSesion: record.lastSessionOn
      ? toDateOnly(record.lastSessionOn)
      : null,
    adherenciaReciente: indicators.adherence,
    estadoAdherencia:
      indicators.adherence === null ? 'DATOS_INSUFICIENTES' : 'DISPONIBLE',
    senales: signals,
    prioridad: priority,
    motivoPrioridad:
      priority === 1
        ? 'REVISION_PENDIENTE'
        : priority === 2
          ? 'INCOMPATIBILIDAD_SOBREVENIDA'
          : priority === 3
            ? 'ESTANCAMIENTO'
            : priority === 4
              ? 'CAIDA_ADHERENCIA'
              : 'SIN_SENAL',
  };
}
