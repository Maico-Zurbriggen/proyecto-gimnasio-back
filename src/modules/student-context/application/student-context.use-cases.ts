import type { AuthUser } from '../../../shared/types/auth';
import type { Clock } from '../../routines/application/ports/clock';
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
}

export interface StudentContextRepository {
  /** `null` si el actor no tiene perfil de alumno activo en su gimnasio. */
  find(actor: AuthUser): Promise<StudentContextRecord | null>;
  save(
    actor: AuthUser,
    input: StudentContextInput,
    now: Date,
  ): Promise<StudentContextRecord | null>;
}

export class StudentContextNotFoundError extends Error {}

export class InvalidStudentContextError extends Error {
  constructor(readonly fields: StudentContextErrors) {
    super('El contexto declarado tiene valores fuera de rango');
  }
}

function conCompletitud(record: StudentContextRecord) {
  return {
    ...record,
    complete: Object.values(record).every((value) => value !== null),
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
    const record = await this.repository.save(actor, input, now);
    if (!record) throw new StudentContextNotFoundError();
    return conCompletitud(record);
  }
}
