import {
  ALTURA_MAX_CM,
  ALTURA_MIN_CM,
} from '../../measurements/domain/services/measurement-ranges';

/**
 * Puesta en contexto del alumno (FL-01, pasos 1 y 3).
 *
 * El perfil nace vacío en el alta por invitación (HU06) y el alumno lo completa
 * acá: nivel de experiencia, días disponibles y sus datos físicos. El objetivo
 * se declara por su propio endpoint (HU10) y las condiciones físicas por HU11.
 */

export const NIVELES_EXPERIENCIA = [
  'PRINCIPIANTE',
  'INTERMEDIO',
  'AVANZADO',
] as const;
export type NivelExperiencia = (typeof NIVELES_EXPERIENCIA)[number];

export const SEXOS = ['MASCULINO', 'FEMENINO'] as const;
export type Sexo = (typeof SEXOS)[number];

/** Edad admitida para entrenar con la plataforma. */
export const EDAD_MINIMA = 14;
export const EDAD_MAXIMA = 100;

export interface StudentContextInput {
  experienceLevel: NivelExperiencia;
  availableDaysPerWeek: number;
  /** `YYYY-MM-DD` */
  birthDate: string;
  sex: Sexo;
  heightCm: number;
}

/** Errores por campo, con el texto que la pantalla muestra junto a cada input. */
export type StudentContextErrors = Partial<
  Record<keyof StudentContextInput, string[]>
>;

function edadEn(fechaNacimiento: Date, ahora: Date): number {
  let edad = ahora.getUTCFullYear() - fechaNacimiento.getUTCFullYear();
  const cumplioEsteAnio =
    ahora.getUTCMonth() > fechaNacimiento.getUTCMonth() ||
    (ahora.getUTCMonth() === fechaNacimiento.getUTCMonth() &&
      ahora.getUTCDate() >= fechaNacimiento.getUTCDate());
  if (!cumplioEsteAnio) edad -= 1;
  return edad;
}

/** Valida los rangos del contexto. Devuelve `{}` si todo está bien. */
export function validarContexto(
  input: StudentContextInput,
  ahora: Date,
): StudentContextErrors {
  const errores: StudentContextErrors = {};

  if (
    !Number.isInteger(input.availableDaysPerWeek) ||
    input.availableDaysPerWeek < 1 ||
    input.availableDaysPerWeek > 7
  ) {
    errores.availableDaysPerWeek = ['Elegí entre 1 y 7 días por semana.'];
  }

  if (
    !Number.isFinite(input.heightCm) ||
    input.heightCm < ALTURA_MIN_CM ||
    input.heightCm > ALTURA_MAX_CM
  ) {
    errores.heightCm = [
      `La altura debe estar entre ${String(ALTURA_MIN_CM)} y ${String(ALTURA_MAX_CM)} cm.`,
    ];
  }

  const nacimiento = new Date(`${input.birthDate}T00:00:00Z`);
  if (Number.isNaN(nacimiento.getTime())) {
    errores.birthDate = ['La fecha de nacimiento no es válida.'];
  } else {
    const edad = edadEn(nacimiento, ahora);
    if (edad < EDAD_MINIMA || edad > EDAD_MAXIMA) {
      errores.birthDate = [
        `La edad debe estar entre ${String(EDAD_MINIMA)} y ${String(EDAD_MAXIMA)} años.`,
      ];
    }
  }

  return errores;
}
