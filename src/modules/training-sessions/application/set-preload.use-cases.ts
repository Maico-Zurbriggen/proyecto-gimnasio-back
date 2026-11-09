import type { Clock } from '../../routines/application/ports/clock';
import {
  precargarSeries,
  type EjecucionPrevia,
  type SeriePrecargada,
  type SeriePrescripta,
} from '../domain/set-preload';

/** Lo que la precarga necesita leer. */
export interface SetPreloadRepository {
  /**
   * Series prescriptas del día, en el orden en que se ejecutan.
   *
   * `null` si el día no existe o no pertenece a la rutina VIGENTE del alumno:
   * desde afuera son el mismo caso y no conviene distinguirlos en la respuesta.
   */
  findPrescribedSetsOfDay(
    studentId: string,
    routineDayId: string,
  ): Promise<SeriePrescripta[] | null>;

  /**
   * Última ejecución del alumno en cada uno de los ejercicios indicados.
   *
   * Sin límite de ventana: RF-030 pide «la última ejecución», y es DD-15 quien
   * resuelve el problema de un dato viejo informando su antigüedad en lugar de
   * descartarlo.
   */
  findLastExecutions(
    studentId: string,
    exerciseIds: string[],
  ): Promise<EjecucionPrevia[]>;
}

export class RoutineDayNotFoundError extends Error {
  constructor(message = 'El día de rutina no existe o no es del alumno') {
    super(message);
    this.name = 'RoutineDayNotFoundError';
  }
}

export interface SetPreloadDto {
  studentId: string;
  routineDayId: string;
  series: SeriePrecargada[];
  calculadoEl: string;
}

/**
 * Valores precargados de las series de un día (HU22 - T2, RF-030).
 *
 * Se consulta antes de registrar: el alumno elige el día (FL-05, paso 1) y la
 * pantalla de sesión presenta cada serie ya completada para que confirmarla
 * cueste dos interacciones (RNF-07).
 *
 * La precarga se calcula contra el día de la rutina y no contra una sesión
 * EN_CURSO, porque es lo que la pantalla necesita *antes* de que la sesión
 * exista. Una vez iniciada, la sesión congela su propia copia (RN-52) y es esa
 * copia la que manda; esta consulta no la modifica ni la reemplaza (RN-61).
 */
export class GetSetPreloadUseCase {
  constructor(
    private readonly repository: SetPreloadRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    studentId: string,
    routineDayId: string,
  ): Promise<SetPreloadDto> {
    const series = await this.repository.findPrescribedSetsOfDay(
      studentId,
      routineDayId,
    );

    if (series === null) {
      throw new RoutineDayNotFoundError();
    }

    const ejercicios = [...new Set(series.map((serie) => serie.exerciseId))];
    const ultimas =
      ejercicios.length === 0
        ? []
        : await this.repository.findLastExecutions(studentId, ejercicios);

    return {
      studentId,
      routineDayId,
      series: precargarSeries(series, ultimas, this.clock.now()),
      calculadoEl: this.clock.now().toISOString(),
    };
  }
}
