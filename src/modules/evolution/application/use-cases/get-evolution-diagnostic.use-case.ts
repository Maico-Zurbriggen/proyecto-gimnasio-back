import type {
  EvolutionDiagnosticsRepository,
  StoredDiagnostic,
} from '../ports/evolution-diagnostics.repository';
import type { Situacion } from '../../domain/services/evolution-diagnosis';

/** Diagnóstico vigente del alumno, tal como se expone. */
export interface EvolutionDiagnosticDto {
  diagnosticId: string;
  studentId: string;
  routineVersionId: string;
  periodStart: string;
  periodEnd: string;
  globalSituation: Situacion;
  adherencia: number | null;
  /** RN-81: criterios que no se pudieron evaluar, declarados. */
  criteriosNoEvaluados: string[];
  componentVersion: string;
  calculadoEl: string;
  ejercicios: {
    exerciseId: string;
    exerciseName: string;
    situation: Situacion;
    metrics: unknown;
  }[];
}

/** Lo que se responde cuando el proceso todavía no corrió (RNF-05, RNF-12). */
export interface DiagnosticNotAvailableDto {
  studentId: string;
  disponible: false;
  motivo: 'SIN_DIAGNOSTICO_CALCULADO';
}

export type GetEvolutionDiagnosticResult =
  ({ disponible: true } & EvolutionDiagnosticDto) | DiagnosticNotAvailableDto;

function toDto(diagnostic: StoredDiagnostic): EvolutionDiagnosticDto {
  return {
    diagnosticId: diagnostic.id,
    studentId: diagnostic.studentId,
    routineVersionId: diagnostic.routineVersionId,
    periodStart: diagnostic.periodStart.toISOString().slice(0, 10),
    periodEnd: diagnostic.periodEnd.toISOString().slice(0, 10),
    globalSituation: diagnostic.globalSituation,
    adherencia: diagnostic.adherence,
    criteriosNoEvaluados: diagnostic.criteriaNotEvaluated,
    componentVersion: diagnostic.componentVersion,
    calculadoEl: diagnostic.calculatedAt.toISOString(),
    ejercicios: diagnostic.exercises,
  };
}

/**
 * Diagnóstico vigente de un alumno (HU32).
 *
 * El vigente es el **más reciente**: cada cálculo es un registro nuevo y
 * fechado, nunca se actualiza ni se borra (D6/§10, RN-98).
 *
 * Cuando el proceso todavía no corrió se responde «no disponible» en lugar de
 * un 404 o de un diagnóstico vacío: la ausencia de cálculo es un estado
 * legítimo y la vista tiene que poder declararlo sin degradarse (RNF-05,
 * RNF-12). Un 404 diría «este alumno no existe», que es otra cosa.
 */
export class GetEvolutionDiagnosticUseCase {
  constructor(private readonly diagnostics: EvolutionDiagnosticsRepository) {}

  async execute(studentId: string): Promise<GetEvolutionDiagnosticResult> {
    const diagnostic = await this.diagnostics.findLatestForStudent(studentId);

    if (diagnostic === null) {
      return {
        studentId,
        disponible: false,
        motivo: 'SIN_DIAGNOSTICO_CALCULADO',
      };
    }

    return { disponible: true, ...toDto(diagnostic) };
  }
}
