/** Medición registrada, tal como se devuelve al cliente (HU02 - T1). */
export interface MeasurementResponseDto {
  studentId: string;
  weightKg: number;
  heightCm: number;
  /** Fecha a la que se imputó la medición, en formato `YYYY-MM-DD`. */
  measuredOn: string;
  /** `true` cuando sustituyó una medición previa del mismo tipo y fecha. */
  replacedPrevious: boolean;
}
