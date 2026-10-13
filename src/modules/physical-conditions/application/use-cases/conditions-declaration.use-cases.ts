import type { Clock } from '../../../routines/application/ports/clock';
import {
  ActiveConditionsExistError,
  HealthConsentRequiredError,
  StudentNotFoundError,
} from '../../domain/errors/condition-errors';
import { estabaVigenteEn } from '../../domain/services/condition-validity';
import type { PhysicalConditionsRepository } from '../ports/physical-conditions.repository';

/** Lo que la pantalla necesita para distinguir sus estados (HU11 - T3). */
export interface ConditionsStatusDto {
  /** RN-104: sin consentimiento el formulario no se habilita. */
  healthDataConsent: boolean;
  /** FL-01/A1: declaró expresamente no tener ninguna condición. */
  declaredNone: boolean;
  declaredNoneAt: string | null;
  activeCount: number;
}

/**
 * Estado de la declaración de condiciones y declaración de "ninguna"
 * (HU11 - criterio 8). No haber respondido y declarar que no hay ninguna son
 * cosas distintas: sólo la segunda cuenta para el contexto suficiente.
 */
export class ConditionsDeclarationUseCases {
  constructor(
    private readonly conditions: PhysicalConditionsRepository,
    private readonly clock: Clock,
  ) {}

  async status(studentId: string): Promise<ConditionsStatusDto> {
    const declaredNoneAt =
      await this.conditions.findNoConditionsDeclaration(studentId);
    if (declaredNoneAt === undefined) throw new StudentNotFoundError();
    const consent = await this.conditions.hasHealthConsent(studentId);
    const now = this.clock.now();
    const activeCount = consent
      ? (await this.conditions.listByStudent(studentId)).filter((condition) =>
          estabaVigenteEn(condition, now),
        ).length
      : 0;
    return {
      healthDataConsent: consent,
      declaredNone: declaredNoneAt !== null,
      declaredNoneAt: declaredNoneAt?.toISOString() ?? null,
      activeCount,
    };
  }

  async declareNone(studentId: string): Promise<ConditionsStatusDto> {
    if (!(await this.conditions.hasHealthConsent(studentId))) {
      throw new HealthConsentRequiredError();
    }
    // Bloquean las que siguen abiertas: una cerrada hoy todavía rige hasta el
    // fin del día (RN-10), pero el alumno ya puede decir que no tiene ninguna.
    const abiertas = (await this.conditions.listByStudent(studentId)).filter(
      (condition) => condition.endsOn === null,
    );
    if (abiertas.length > 0) throw new ActiveConditionsExistError();
    await this.conditions.declareNoConditions(studentId, this.clock.now());
    return this.status(studentId);
  }
}
