import type { Clock } from '../../../routines/application/ports/clock';
import {
  ConditionNotClosableError,
  ConditionNotFoundError,
  HealthConsentRequiredError,
  InvalidBodyZoneError,
} from '../../domain/errors/condition-errors';
import {
  esZonaCorporalValida,
  type Severidad,
} from '../../domain/services/body-zones';
import { estabaVigenteEn } from '../../domain/services/condition-validity';
import {
  toConditionDto,
  type PhysicalConditionDto,
} from '../dto/condition.dto';
import type { PhysicalConditionsRepository } from '../ports/physical-conditions.repository';
import type { RoutineRevaluation } from '../ports/routine-revaluation.port';
import { reevaluarRutina } from './revaluate-routine';

export interface ReviseConditionInput {
  studentId: string;
  conditionId: string;
  /** Zona nueva; si se omite, conserva la de la condición revisada. */
  bodyZoneCode?: string;
  /** Severidad nueva; si se omite, conserva la de la condición revisada. */
  severity?: Severidad;
  /** Descripción nueva; si se omite, conserva la anterior. */
  description?: string | null;
}

export interface ReviseConditionResult {
  /** La condición tal como quedó cerrada: es el historial. */
  anterior: PhysicalConditionDto;
  /** La condición que rige desde hoy con los valores corregidos. */
  vigente: PhysicalConditionDto;
}

/**
 * Revisión de una condición física (HU11 - T2, criterio 14).
 *
 * Cambiar la zona o la severidad **no sobrescribe** el registro: cierra la
 * condición anterior con la fecha de hoy y abre una nueva con los valores
 * corregidos. Las dos quedan en el historial.
 *
 * El motivo es que una condición no es un dato editable sino un hecho fechado:
 * si una molestia LEVE se agrava a MODERADA, no es que el dato anterior
 * estuviera mal, es que el alumno estuvo LEVE hasta hoy y MODERADA desde hoy.
 * Sobrescribir borraría el período que explica las prescripciones ya emitidas
 * bajo la severidad vieja, y RN-11 exige que cerrar no tenga efecto
 * retroactivo.
 *
 * Por eso tampoco se admite revisar una condición ya cerrada: su período
 * terminó y no hay nada vigente que corregir.
 */
export class ReviseConditionUseCase {
  constructor(
    private readonly conditions: PhysicalConditionsRepository,
    private readonly clock: Clock,
    private readonly revaluation?: RoutineRevaluation,
  ) {}

  async execute(input: ReviseConditionInput): Promise<ReviseConditionResult> {
    if (
      input.bodyZoneCode !== undefined &&
      !esZonaCorporalValida(input.bodyZoneCode)
    ) {
      throw new InvalidBodyZoneError();
    }

    // RN-104: sin consentimiento no se toca ningún dato de salud.
    if (!(await this.conditions.hasHealthConsent(input.studentId))) {
      throw new HealthConsentRequiredError();
    }

    const record = await this.conditions.findById(
      input.conditionId,
      input.studentId,
    );
    if (!record) {
      throw new ConditionNotFoundError();
    }

    const now = this.clock.now();
    const hoy = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );

    if (!estabaVigenteEn(record, hoy)) {
      throw new ConditionNotClosableError(
        'Sólo se revisa una condición vigente',
      );
    }

    // El cierre no puede ser anterior al inicio (RI-17). Una condición
    // declarada hoy y corregida hoy se cierra el mismo día que empezó: el
    // período dura cero días, que es exactamente lo que pasó.
    const cierre =
      record.startsOn.getTime() > hoy.getTime() ? record.startsOn : hoy;

    const { cerrada, vigente } = await this.conditions.revise(
      record.id,
      cierre,
      {
        studentId: input.studentId,
        bodyZoneCode: esZonaCorporalValida(input.bodyZoneCode ?? '')
          ? (input.bodyZoneCode as typeof record.bodyZoneCode)
          : record.bodyZoneCode,
        severity: input.severity ?? record.severity,
        description:
          input.description === undefined
            ? record.description
            : input.description?.trim() || null,
        startsOn: cierre,
      },
    );

    // RN-91: agravar o atenuar una condición cambia qué ejercicios se señalan.
    await reevaluarRutina(this.revaluation, input.studentId);

    return {
      anterior: toConditionDto(cerrada, now),
      vigente: toConditionDto(vigente, now),
    };
  }
}
