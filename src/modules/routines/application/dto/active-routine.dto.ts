import type { EstadoAvisoRenovacion } from '../../domain/services/routine-renewal';

export interface RenewalNoticeDto {
  estado: EstadoAvisoRenovacion;
  diasRestantes: number;
  fechaVencimiento: string;
}

export interface ActiveRoutineResponseDto {
  id: string;
  studentId: string;
  routineType: string;
  targetWeeklyFrequency: number;
  state: string;
  origin: string;
  startDate: string;
  renewalDate: string;
  /**
   * Días restantes para la renovación del ciclo (HU01, Esc. 5).
   *
   * Es derivado: se calcula en cada consulta y nunca se persiste.
   */
  diasRestantesRenovacion: number;
  avisoRenovacion: RenewalNoticeDto;
  currentVersionNumber?: number;
}
