import {
  construirAdvertenciaDatos,
  type AdvertenciaDatosDesactualizadosDto,
} from '../../../routines/application/dto/proposal-review.dto';
import {
  evaluarDatosDeRenovacion,
  hayMedicionEnElCiclo,
} from '../../../routines/domain/services/cycle-renewal-data';
import {
  addDays,
  DURACION_CICLO_DIAS,
} from '../../../routines/domain/services/routine-renewal';
import type {
  ProposalAdjustmentRecord,
  ProposalRecord,
} from '../ports/proposals.repository';

export interface ProposalSummaryDto {
  id: string;
  createdAt: string;
  student: { id: string; displayName: string };
  globalSituation: string;
  adjustmentsCount: number;
  advertenciaDatos: AdvertenciaDatosDesactualizadosDto;
}

export interface ProposalReviewDto {
  id: string;
  state: string;
  createdAt: string;
  resolvedAt: string | null;
  resolutionReason: string | null;
  student: { id: string; displayName: string };
  routine: {
    id: string;
    routineType: string;
    currentVersionNumber: number | null;
  } | null;
  diagnostic: {
    periodStart: string;
    periodEnd: string;
    globalSituation: string;
    adherence: number | null;
  };
  adjustments: ProposalAdjustmentRecord[];
  /** HU04 - T1: visible antes de decidir. */
  advertenciaDatos: AdvertenciaDatosDesactualizadosDto;
}

export interface ProposalResolutionDto {
  proposalId: string;
  state: string;
  resultingVersionNumber: number | null;
}

const toDateOnly = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Flag de datos desactualizados (HU04 - T1) derivado de las mediciones, porque el
 * esquema no lo persiste. Cada propuesta anterior cuenta como falta si no hubo
 * medición en los 60 días previos a su creación.
 */
export function evaluarAdvertencia(
  record: ProposalRecord,
): AdvertenciaDatosDesactualizadosDto {
  const mediciones = record.measurementDates.map((measuredOn) => ({
    measuredOn,
  }));
  const previas = record.previousProposalDates.map((createdAt) => ({
    createdAt,
    sinDatosActualizados: !hayMedicionEnElCiclo(
      mediciones.filter(
        (medicion) => medicion.measuredOn.getTime() <= createdAt.getTime(),
      ),
      addDays(createdAt, -DURACION_CICLO_DIAS),
    ),
  }));
  const inicioDelCiclo =
    record.routine?.cycleStart ?? record.diagnostic.periodStart;

  return construirAdvertenciaDatos(
    evaluarDatosDeRenovacion(mediciones, inicioDelCiclo, previas),
  );
}

export function toProposalSummaryDto(
  record: ProposalRecord,
): ProposalSummaryDto {
  return {
    id: record.id,
    createdAt: record.createdAt.toISOString(),
    student: record.student,
    globalSituation: record.diagnostic.globalSituation,
    adjustmentsCount: record.adjustments.length,
    advertenciaDatos: evaluarAdvertencia(record),
  };
}

export function toProposalReviewDto(record: ProposalRecord): ProposalReviewDto {
  return {
    id: record.id,
    state: record.state,
    createdAt: record.createdAt.toISOString(),
    resolvedAt: record.resolvedAt?.toISOString() ?? null,
    resolutionReason: record.resolutionReason,
    student: record.student,
    routine: record.routine
      ? {
          id: record.routine.id,
          routineType: record.routine.routineType,
          currentVersionNumber: record.routine.currentVersionNumber,
        }
      : null,
    diagnostic: {
      periodStart: toDateOnly(record.diagnostic.periodStart),
      periodEnd: toDateOnly(record.diagnostic.periodEnd),
      globalSituation: record.diagnostic.globalSituation,
      adherence: record.diagnostic.adherence,
    },
    adjustments: record.adjustments,
    advertenciaDatos: evaluarAdvertencia(record),
  };
}
