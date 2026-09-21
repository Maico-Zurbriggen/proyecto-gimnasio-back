/** Alta o sustitución de las medidas de un alumno en una fecha (HU02 - T1). */
export interface RecordMeasurementCommand {
  studentId: string;
  weightKg: number;
  heightCm: number;
  /** Día al que se imputa la medición, a medianoche UTC. */
  measuredOn: Date;
}

/** Lo que quedó registrado tras la carga. */
export interface MeasurementRecord {
  studentId: string;
  weightKg: number;
  heightCm: number;
  measuredOn: Date;
  /** `true` cuando sustituyó una medición previa del mismo tipo y fecha. */
  replacedPrevious: boolean;
}

export interface MeasurementsRepository {
  /**
   * Registra peso y altura de forma atómica.
   *
   * Sustituye cualquier medición previa del mismo tipo y fecha (HU02, Esc. 1), y
   * devuelve `null` si el alumno no existe.
   */
  record(command: RecordMeasurementCommand): Promise<MeasurementRecord | null>;
}
