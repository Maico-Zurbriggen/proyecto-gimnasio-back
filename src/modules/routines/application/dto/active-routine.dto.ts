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
  diasRestantesParaRenovacion: number;
  avisoRenovacion: RenewalNoticeDto;
  currentVersionNumber?: number;
}
