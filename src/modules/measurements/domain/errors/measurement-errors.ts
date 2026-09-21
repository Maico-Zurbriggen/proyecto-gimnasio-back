import type { ViolacionDeRango } from '../services/measurement-ranges';

/** Alguna medida quedó fuera del rango fisiológico admitido (HU02, Esc. 1.1 y 1.2). */
export class MeasurementOutOfRangeError extends Error {
  constructor(readonly violations: readonly ViolacionDeRango[]) {
    super('Measurement values out of the admitted range');
    this.name = 'MeasurementOutOfRangeError';
  }
}

/** No existe un alumno con ese identificador. */
export class StudentNotFoundError extends Error {
  constructor(message = 'Student not found') {
    super(message);
    this.name = 'StudentNotFoundError';
  }
}
