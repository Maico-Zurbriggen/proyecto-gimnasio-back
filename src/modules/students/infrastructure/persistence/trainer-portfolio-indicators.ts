import type { Clock } from '../../../routines/application/ports/clock';
import type { IndicatorsRepository } from '../../../indicators/application/indicators.use-cases';
import {
  GetAdherenceUseCase,
  GetSignalsUseCase,
} from '../../../indicators/application/indicators.use-cases';
import type { TrainerStudentIndicators } from '../../application/dto/student-status.dto';

/** Compone indicadores derivados sin persistirlos ni incluir sesiones simuladas. */
export class TrainerPortfolioIndicators {
  private readonly adherence: GetAdherenceUseCase;
  private readonly signals: GetSignalsUseCase;

  constructor(repository: IndicatorsRepository, clock: Clock) {
    this.adherence = new GetAdherenceUseCase(repository, clock);
    this.signals = new GetSignalsUseCase(repository, clock);
  }

  async get(studentId: string): Promise<TrainerStudentIndicators> {
    const [adherence, signals] = await Promise.all([
      this.adherence.execute(studentId),
      this.signals.execute(studentId),
    ]);
    return {
      adherence: adherence.adherencia.disponible
        ? adherence.adherencia.porcentaje
        : null,
      insufficientData:
        !adherence.adherencia.disponible ||
        signals.estancamiento.some(
          ({ estado }) => estado === 'DATOS_INSUFICIENTES',
        ) ||
        signals.caidaDeAdherencia.estado === 'DATOS_INSUFICIENTES' ||
        signals.desbalance.estado === 'DATOS_INSUFICIENTES',
      stagnation: signals.estancamiento.some(
        ({ estado }) => estado === 'DETECTADA',
      ),
      adherenceDrop: signals.caidaDeAdherencia.estado === 'DETECTADA',
    };
  }
}
