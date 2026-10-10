import { EmptyTemplateError } from '../errors/prescription-errors';

/** Estructura mínima de un día de plantilla, sin validar tipos de transporte. */
export interface TemplateStructureDay {
  name: string;
  exercises: TemplateStructureExercise[];
}

export interface TemplateStructureExercise {
  exerciseId: string;
  sets: unknown[];
}

/**
 * Invariantes estructurales de una plantilla (RN-41, D4/§2.4).
 *
 * Una plantilla tiene entre 1 y 7 días; cada día, al menos un ejercicio; cada
 * ejercicio, al menos una serie prescripta. Los rangos de cada serie (RN-43)
 * se validan en la capa HTTP; acá sólo la forma. No importa Express, Prisma
 * ni Zod.
 */
export function assertTemplateStructure(days: TemplateStructureDay[]): void {
  if (days.length < 1 || days.length > 7) {
    throw new EmptyTemplateError(
      'La plantilla tiene entre 1 y 7 días con al menos un ejercicio cada uno',
    );
  }
  for (const day of days) {
    if (day.exercises.length < 1) {
      throw new EmptyTemplateError(
        'Cada día de la plantilla tiene al menos un ejercicio',
      );
    }
    for (const exercise of day.exercises) {
      if (exercise.sets.length < 1) {
        throw new EmptyTemplateError(
          'Cada ejercicio de la plantilla tiene al menos una serie prescripta',
        );
      }
    }
  }
}
