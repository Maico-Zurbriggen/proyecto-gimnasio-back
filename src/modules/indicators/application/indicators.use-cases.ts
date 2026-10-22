import type { Clock } from '../../routines/application/ports/clock';
import {
  calcularAdherencia,
  SEMANAS_VENTANA_ADHERENCIA,
  ZONA_HORARIA_POR_DEFECTO,
  type Adherencia,
  type FrecuenciaVigente,
  type SesionDeAdherencia,
} from '../domain/adherence';
import {
  cumplimientoDeRepeticiones,
  cumplimientoDeSeries,
  type Cumplimiento,
  type RegistroDeSerie,
} from '../domain/compliance';
import {
  detectarCaidaDeAdherencia,
  detectarDesbalance,
  detectarEstancamiento,
  type CaidaAdherenciaDetalle,
  type DesbalanceDetalle,
  type EstancamientoDetalle,
  type Senal,
  type SesionDelPeriodo,
} from '../domain/signals';

/** Lo que el módulo necesita leer para calcular los indicadores. */
export interface IndicatorsRepository {
  /** Sesiones del alumno desde la fecha indicada, con su estado. */
  findSessionsSince(
    studentId: string,
    desde: Date,
  ): Promise<SesionDeAdherencia[]>;

  /**
   * Frecuencias semanales objetivo con su período de vigencia.
   *
   * Una por cada rutina que el alumno tuvo vigente: la adherencia las necesita
   * todas para computar semana a semana (RN-67).
   */
  findTargetFrequencies(studentId: string): Promise<FrecuenciaVigente[]>;

  /** Registros de serie de una sesión. `null` si la sesión no existe o es ajena. */
  findSessionSetRecords(
    sessionId: string,
    studentId: string,
  ): Promise<RegistroDeSerie[] | null>;

  /**
   * Sesiones del período con sus series, carga ejecutada y clasificación
   * muscular del ejercicio: es lo que las señales de HU26 necesitan leer.
   */
  findSessionsWithSeriesSince(
    studentId: string,
    desde: Date,
  ): Promise<SesionDelPeriodo[]>;

  /**
   * Zona horaria del gimnasio del alumno (RN-110).
   *
   * Las semanas de la ventana móvil se recortan de lunes a domingo en esta
   * zona, no en UTC: una sesión del domingo a la noche pertenece a la semana
   * que el alumno vivió, no a la siguiente.
   */
  findGymTimeZone(studentId: string): Promise<string | null>;
}

/** Indicadores de adherencia de un alumno (HU23 - T1). */
export interface AdherenceDto {
  studentId: string;
  adherencia: Adherencia;
  /** Instante de cálculo: los indicadores son derivados, no persistidos (DD-04). */
  calculadoEl: string;
}

/**
 * Adherencia sobre la ventana móvil (HU23 - T1).
 *
 * Los indicadores se derivan en cada consulta y no se persisten: si cambia su
 * definición, no hay histórico que recalcular (D4/PD-03, DD-04).
 */
export class GetAdherenceUseCase {
  constructor(
    private readonly indicators: IndicatorsRepository,
    private readonly clock: Clock,
  ) {}

  async execute(studentId: string): Promise<AdherenceDto> {
    const now = this.clock.now();
    // Se leen cinco semanas para que el cálculo de la ventana de cuatro tenga
    // margen y no dependa de la hora exacta del corte.
    const desde = new Date(now.getTime() - 5 * 7 * 24 * 60 * 60 * 1000);

    const [sesiones, frecuencias, zona] = await Promise.all([
      this.indicators.findSessionsSince(studentId, desde),
      this.indicators.findTargetFrequencies(studentId),
      this.indicators.findGymTimeZone(studentId),
    ]);

    return {
      studentId,
      adherencia: calcularAdherencia(
        sesiones,
        frecuencias,
        now,
        SEMANAS_VENTANA_ADHERENCIA,
        zona ?? ZONA_HORARIA_POR_DEFECTO,
      ),
      calculadoEl: now.toISOString(),
    };
  }
}

/** Cumplimiento de una sesión concreta (HU23 - T2). */
export interface SessionComplianceDto {
  sessionId: string;
  cumplimientoDeSeries: Cumplimiento;
  cumplimientoDeRepeticiones: Cumplimiento;
  calculadoEl: string;
}

export class SessionNotFoundError extends Error {
  constructor(message = 'La sesión no existe') {
    super(message);
    this.name = 'SessionNotFoundError';
  }
}

/**
 * Cumplimiento de series y de repeticiones de una sesión (HU23 - T2).
 *
 * Se devuelven los dos por separado: son indicadores distintos y el glosario
 * prohíbe hablar de «cumplimiento» sin calificar cuál (D2/§2).
 */
export class GetSessionComplianceUseCase {
  constructor(
    private readonly indicators: IndicatorsRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    sessionId: string,
    studentId: string,
  ): Promise<SessionComplianceDto> {
    const registros = await this.indicators.findSessionSetRecords(
      sessionId,
      studentId,
    );

    if (registros === null) {
      throw new SessionNotFoundError();
    }

    return {
      sessionId,
      cumplimientoDeSeries: cumplimientoDeSeries(registros),
      cumplimientoDeRepeticiones: cumplimientoDeRepeticiones(registros),
      calculadoEl: this.clock.now().toISOString(),
    };
  }
}

/** Señales de seguimiento de un alumno (HU26 - T1). */
export interface SignalsDto {
  studentId: string;
  /** Una entrada por ejercicio con actividad en el período. */
  estancamiento: Senal<EstancamientoDetalle>[];
  caidaDeAdherencia: Senal<CaidaAdherenciaDetalle>;
  desbalance: Senal<DesbalanceDetalle[]>;
  calculadoEl: string;
}

/**
 * Señales de seguimiento (HU26 - T1, RN-74 a RN-77).
 *
 * Responden qué alumnos requieren atención. Cada señal informa su estado por
 * separado —detectada, sin señal, o datos insuficientes—, porque RN-77 exige
 * distinguir la ausencia por falta de datos de la ausencia por normalidad.
 */
export class GetSignalsUseCase {
  constructor(
    private readonly indicators: IndicatorsRepository,
    private readonly clock: Clock,
  ) {}

  async execute(studentId: string): Promise<SignalsDto> {
    const now = this.clock.now();
    // Seis semanas: el período de diagnóstico de D2/§3, que es el más largo
    // que necesita alguna de las tres señales.
    const desde = new Date(now.getTime() - 6 * 7 * 24 * 60 * 60 * 1000);

    const [sesionesConSeries, sesiones, frecuencias, zona] = await Promise.all([
      this.indicators.findSessionsWithSeriesSince(studentId, desde),
      this.indicators.findSessionsSince(studentId, desde),
      this.indicators.findTargetFrequencies(studentId),
      this.indicators.findGymTimeZone(studentId),
    ]);

    // El estancamiento se evalúa por ejercicio: un alumno puede progresar en
    // uno y estar trabado en otro.
    const ejercicios = [
      ...new Set(
        sesionesConSeries.flatMap((sesion) =>
          sesion.series.map((serie) => serie.exerciseId),
        ),
      ),
    ];

    return {
      studentId,
      estancamiento: ejercicios.map((exerciseId) =>
        detectarEstancamiento(sesionesConSeries, exerciseId, now),
      ),
      caidaDeAdherencia: detectarCaidaDeAdherencia(
        sesiones,
        frecuencias,
        now,
        zona ?? ZONA_HORARIA_POR_DEFECTO,
      ),
      desbalance: detectarDesbalance(sesionesConSeries, now),
      calculadoEl: now.toISOString(),
    };
  }
}
