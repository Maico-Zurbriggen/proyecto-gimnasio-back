import type { AuthUser } from '../../../shared/types/auth';
import type { Clock } from '../../routines/application/ports/clock';
import { TEXTO_CONSENTIMIENTO_DATOS_SALUD } from '../domain/health-consent';
import {
  validarContexto,
  type NivelExperiencia,
  type Sexo,
  type StudentContextErrors,
  type StudentContextInput,
} from '../domain/student-context';

/** Contexto declarado; los campos quedan en `null` hasta que se completan. */
export interface StudentContextRecord {
  experienceLevel: NivelExperiencia | null;
  availableDaysPerWeek: number | null;
  birthDate: string | null;
  sex: Sexo | null;
  heightCm: number | null;
  /** Último peso registrado. */
  weightKg: number | null;
  /**
   * Profesor asignado (asignación vigente). `null` si todavía no tiene: el
   * gimnasio se lo asigna (FL-01/A2).
   */
  trainer: { id: string; displayName: string } | null;
  /** RN-104: último consentimiento para datos de salud. */
  healthDataConsent: boolean;
}

export interface StudentContextRepository {
  /** `null` si el actor no tiene perfil de alumno activo en su gimnasio. */
  find(actor: AuthUser): Promise<StudentContextRecord | null>;
  save(
    actor: AuthUser,
    input: StudentContextInput,
    now: Date,
  ): Promise<StudentContextRecord | null>;
  /** Registra el consentimiento con el texto aceptado. */
  grantHealthConsent(actor: AuthUser): Promise<boolean>;
}

export class StudentContextNotFoundError extends Error {}

/** RN-104: sin consentimiento no se registran peso ni altura. */
export class HealthDataConsentRequiredError extends Error {
  constructor(
    message = 'Para cargar tu peso y tu altura necesitamos tu consentimiento para datos de salud',
  ) {
    super(message);
    this.name = 'HealthDataConsentRequiredError';
  }
}

export class InvalidStudentContextError extends Error {
  constructor(readonly fields: StudentContextErrors) {
    super('El contexto declarado tiene valores fuera de rango');
  }
}

/** El contexto está completo cuando todos sus datos están declarados. */
function conCompletitud(record: StudentContextRecord) {
  const datos = [
    record.experienceLevel,
    record.availableDaysPerWeek,
    record.birthDate,
    record.sex,
    record.heightCm,
    record.weightKg,
  ];
  return {
    ...record,
    healthConsentText: TEXTO_CONSENTIMIENTO_DATOS_SALUD,
    complete: datos.every((value) => value !== null),
  };
}

export class StudentContextUseCases {
  constructor(
    private readonly repository: StudentContextRepository,
    private readonly clock: Clock,
  ) {}

  async read(actor: AuthUser) {
    const record = await this.repository.find(actor);
    if (!record) throw new StudentContextNotFoundError();
    return conCompletitud(record);
  }

  async save(actor: AuthUser, input: StudentContextInput) {
    const now = this.clock.now();
    const errores = validarContexto(input, now);
    if (Object.keys(errores).length > 0) {
      throw new InvalidStudentContextError(errores);
    }
    const actual = await this.repository.find(actor);
    if (!actual) throw new StudentContextNotFoundError();
    if (!actual.healthDataConsent) throw new HealthDataConsentRequiredError();
    const record = await this.repository.save(actor, input, now);
    if (!record) throw new StudentContextNotFoundError();
    return conCompletitud(record);
  }

  /** FL-19/A2: el consentimiento se puede otorgar después del alta. */
  async grantHealthConsent(actor: AuthUser) {
    if (!(await this.repository.grantHealthConsent(actor))) {
      throw new StudentContextNotFoundError();
    }
    return this.read(actor);
  }
}
