import { requiresGoalConfirmation } from '../../../goals/domain/goal-policy';
import {
  RULES,
  type TrainingPurpose,
} from '../../../routine-generations/domain/services/generated-routine-validator';
import type { AdjustmentType } from './apply-adjustments';

/**
 * Tabla situación → ajuste (DD-11, RF-047 diferido).
 *
 * Es el ÚNICO lugar donde viven los porcentajes, escalones y reglas de ajuste.
 * No es configurable por usuarios de la aplicación: cambiarla exige un cambio de
 * código y subir `ADJUSTMENT_TABLE_VERSION`.
 */
export const ADJUSTMENT_TABLE_VERSION = 'adjustment-table-v1';

export const ADJUSTMENT_TABLE = {
  /** ESTIMULO_INSUFICIENTE: CARGA +2,5 %, al alza a múltiplo de 2,5 kg, mínimo +2,5 kg. */
  estimuloInsuficiente: {
    loadPercent: 2.5,
    loadStepKg: 2.5,
    minIncrementKg: 2.5,
  },
  /** ESTANCAMIENTO (1.º consecutivo): ESQUEMA + VOLUMEN. Escalón = 2 repeticiones; +1 serie. */
  estancamientoPrimero: { repetitionStep: 2, extraSets: 1 },
  /** ESTANCAMIENTO (2.º consecutivo o más): SUSTITUCION. */
  estancamientoSegundo: { consecutiveFrom: 2 },
  /** SOBREEXIGENCIA: CARGA −10 % a la baja a múltiplo de 2,5 kg y −1 serie. */
  sobreexigencia: { loadPercent: 10, loadStepKg: 2.5, setsDelta: 1 },
  /** Globales. */
  adherenciaBaja: {
    thresholdPercent: 60,
    sustainedWeeks: 4,
    frequencyDelta: 1,
  },
  desbalance: { setsDeltaByExcess: 1 },
} as const;

export type EvolutionSituation =
  | 'DATOS_INSUFICIENTES'
  | 'SOBREEXIGENCIA'
  | 'PROGRESION_ADECUADA'
  | 'ESTIMULO_INSUFICIENTE'
  | 'ESTANCAMIENTO';

export type ExerciseCompatibility =
  'EJERCICIO_DESACTIVADO' | 'COMPATIBLE' | 'ADVERTIDO' | 'INCOMPATIBLE';

export interface SetSnapshot {
  position: number;
  minRepetitions: number;
  maxRepetitions: number;
  suggestedLoad: number | null;
  restSeconds: number;
  warmup: boolean;
}

export interface ExerciseFinding {
  routineExerciseId: string;
  exerciseId: string;
  exerciseName: string;
  situation: EvolutionSituation;
  compatibilityState: ExerciseCompatibility;
  /** Diagnósticos consecutivos (incluido éste) con ESTANCAMIENTO en el ejercicio. */
  consecutiveStagnations: number;
  sets: SetSnapshot[];
  metrics: unknown;
  /** Primera alternativa admisible resuelta por el adaptador; null si no hay. */
  alternativeExerciseId: string | null;
  alternativeExerciseName?: string | null;
}

export interface ImbalanceFinding {
  muscleGroup: string;
  kind: 'DEFECTO' | 'EXCESO';
  /** Patrón de movimiento que estimula el grupo (para DEFECTO). */
  stimulatingPattern: string | null;
  /** Ejercicios de la rutina que trabajan el grupo (para EXCESO). */
  routineExerciseIds: string[];
}

export interface GlobalFindings {
  /** Semanas consecutivas con adherencia menor que el umbral. */
  lowAdherenceWeeks: number;
  imbalances: ImbalanceFinding[];
  goalChange: { to: TrainingPurpose } | null;
}

export interface DiagnosticInput {
  diagnosticId: string;
  globalSituation: EvolutionSituation;
  adherence: number | null;
  routine: {
    routineType: TrainingPurpose;
    targetWeeklyFrequency: number;
    /** Cantidad de ejercicios por día de la versión vigente. */
    exercisesPerDay: number[];
  };
  exercises: ExerciseFinding[];
  global: GlobalFindings;
}

export interface ElaboratedAdjustment {
  type: AdjustmentType;
  routineExerciseId: string | null;
  previousValue: Record<string, unknown>;
  proposedValue: Record<string, unknown>;
  criterion: string;
  /** RN-84: datos que sustentan el ajuste. */
  supportingData: Record<string, unknown>;
}

export interface DeclaredOmission {
  routineExerciseId: string | null;
  criterion: string;
  reason: string;
}

export type ElaborationStatus =
  'PROPUESTA' | 'SIN_AJUSTES' | 'DATOS_INSUFICIENTES';

export interface Elaboration {
  status: ElaborationStatus;
  adjustments: ElaboratedAdjustment[];
  /** Situaciones que no produjeron ajuste y se declaran (p. ej. RN-49). */
  declared: DeclaredOmission[];
}

const workingSets = (sets: SetSnapshot[]) => sets.filter((set) => !set.warmup);

const maxLoad = (sets: SetSnapshot[]): number | null => {
  const loads = workingSets(sets)
    .map((set) => set.suggestedLoad)
    .filter((load): load is number => typeof load === 'number' && load > 0);
  return loads.length ? Math.max(...loads) : null;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Redondea al alza al múltiplo de `step`, tolerando ruido de coma flotante. */
export function ceilToStep(value: number, step: number): number {
  return round2(Math.ceil(round2(value / step) - 1e-9) * step);
}

/** Redondea a la baja al múltiplo de `step`, tolerando ruido de coma flotante. */
export function floorToStep(value: number, step: number): number {
  return round2(Math.floor(round2(value / step) + 1e-9) * step);
}

/** CARGA +2,5 %, al alza a múltiplo de 2,5 kg y con incremento mínimo de 2,5 kg. */
export function increasedLoad(load: number): number {
  const { loadPercent, loadStepKg, minIncrementKg } =
    ADJUSTMENT_TABLE.estimuloInsuficiente;
  const raised = ceilToStep((load * (100 + loadPercent)) / 100, loadStepKg);
  return Math.max(raised, round2(load + minIncrementKg));
}

/** CARGA −10 %, a la baja a múltiplo de 2,5 kg (nunca negativa). */
export function reducedLoad(load: number): number {
  const { loadPercent, loadStepKg } = ADJUSTMENT_TABLE.sobreexigencia;
  return Math.max(
    0,
    floorToStep((load * (100 - loadPercent)) / 100, loadStepKg),
  );
}

function loadAdjustment(
  finding: ExerciseFinding,
  criterion: string,
  next: (load: number) => number,
): ElaboratedAdjustment | DeclaredOmission {
  const load = maxLoad(finding.sets);
  if (load === null) {
    return {
      routineExerciseId: finding.routineExerciseId,
      criterion,
      reason: 'El ejercicio no tiene una carga sugerida sobre la cual ajustar.',
    };
  }
  const proposed = next(load);
  if (proposed === load) {
    return {
      routineExerciseId: finding.routineExerciseId,
      criterion,
      reason: 'El ajuste de carga no modifica el valor vigente.',
    };
  }
  return {
    type: 'CARGA',
    routineExerciseId: finding.routineExerciseId,
    previousValue: { carga_sugerida: load },
    proposedValue: { carga_sugerida: proposed },
    criterion,
    supportingData: supportingData(finding),
  };
}

function supportingData(finding: ExerciseFinding): Record<string, unknown> {
  return {
    situation: finding.situation,
    exerciseId: finding.exerciseId,
    exerciseName: finding.exerciseName,
    consecutiveStagnations: finding.consecutiveStagnations,
    metrics: finding.metrics ?? null,
    tableVersion: ADJUSTMENT_TABLE_VERSION,
  };
}

function volumeAdjustment(
  finding: ExerciseFinding,
  rule: (typeof RULES)[TrainingPurpose],
  criterion: string,
  delta: number,
): ElaboratedAdjustment | DeclaredOmission {
  const current = workingSets(finding.sets).length;
  const target = current + delta;
  if (target < rule.workSets[0] || target > rule.workSets[1] || target < 1) {
    return {
      routineExerciseId: finding.routineExerciseId,
      criterion,
      reason: `Quedaría fuera del rango de series del tipo (${String(rule.workSets[0])}-${String(rule.workSets[1])}).`,
    };
  }
  return {
    type: 'VOLUMEN',
    routineExerciseId: finding.routineExerciseId,
    previousValue: { series_trabajo: current },
    proposedValue: { series_trabajo: target },
    criterion,
    supportingData: supportingData(finding),
  };
}

function schemeAdjustment(
  finding: ExerciseFinding,
  rule: (typeof RULES)[TrainingPurpose],
  criterion: string,
): ElaboratedAdjustment | DeclaredOmission {
  const first = workingSets(finding.sets)[0];
  if (!first) {
    return {
      routineExerciseId: finding.routineExerciseId,
      criterion,
      reason: 'El ejercicio no tiene series de trabajo.',
    };
  }
  const shift = Math.min(
    ADJUSTMENT_TABLE.estancamientoPrimero.repetitionStep,
    rule.repetitions[1] - first.maxRepetitions,
  );
  if (shift <= 0) {
    return {
      routineExerciseId: finding.routineExerciseId,
      criterion,
      reason: 'El rango de repeticiones ya está en el tope del tipo de rutina.',
    };
  }
  return {
    type: 'ESQUEMA',
    routineExerciseId: finding.routineExerciseId,
    previousValue: {
      min_repetitions: first.minRepetitions,
      max_repetitions: first.maxRepetitions,
    },
    proposedValue: {
      min_repetitions: first.minRepetitions + shift,
      max_repetitions: first.maxRepetitions + shift,
    },
    criterion,
    supportingData: supportingData(finding),
  };
}

function substitution(
  finding: ExerciseFinding,
  criterion: string,
): ElaboratedAdjustment | DeclaredOmission {
  if (!finding.alternativeExerciseId) {
    return {
      routineExerciseId: finding.routineExerciseId,
      criterion,
      reason:
        'No hay una alternativa admisible para sustituir el ejercicio (RN-49).',
    };
  }
  return {
    type: 'SUSTITUCION',
    routineExerciseId: finding.routineExerciseId,
    previousValue: {
      exercise_id: finding.exerciseId,
      exercise_name: finding.exerciseName,
    },
    proposedValue: {
      exercise_id: finding.alternativeExerciseId,
      exercise_name: finding.alternativeExerciseName ?? null,
    },
    criterion,
    supportingData: supportingData(finding),
  };
}

const isAdjustment = (
  value: ElaboratedAdjustment | DeclaredOmission,
): value is ElaboratedAdjustment => 'type' in value;

/** Fila de la tabla aplicada a un ejercicio. */
export function adjustmentsForExercise(
  finding: ExerciseFinding,
  rule: (typeof RULES)[TrainingPurpose],
): Array<ElaboratedAdjustment | DeclaredOmission> {
  // Incompatibilidad y ejercicio desactivado mandan sobre cualquier otra situación.
  if (
    finding.compatibilityState === 'INCOMPATIBLE' ||
    finding.compatibilityState === 'EJERCICIO_DESACTIVADO'
  ) {
    return [substitution(finding, finding.compatibilityState)];
  }
  switch (finding.situation) {
    case 'PROGRESION_ADECUADA':
    case 'DATOS_INSUFICIENTES':
      return [];
    case 'ESTIMULO_INSUFICIENTE':
      return [loadAdjustment(finding, 'ESTIMULO_INSUFICIENTE', increasedLoad)];
    case 'ESTANCAMIENTO':
      return finding.consecutiveStagnations >=
        ADJUSTMENT_TABLE.estancamientoSegundo.consecutiveFrom
        ? [substitution(finding, 'ESTANCAMIENTO_SEGUNDO_CONSECUTIVO')]
        : [
            schemeAdjustment(finding, rule, 'ESTANCAMIENTO_PRIMERO'),
            volumeAdjustment(
              finding,
              rule,
              'ESTANCAMIENTO_PRIMERO',
              ADJUSTMENT_TABLE.estancamientoPrimero.extraSets,
            ),
          ];
    case 'SOBREEXIGENCIA':
      // La fila global SOBREEXIGENCIA (−1 serie a cada ejercicio en
      // sobreexigencia) queda cubierta por este mismo −1 serie.
      return [
        loadAdjustment(finding, 'SOBREEXIGENCIA', reducedLoad),
        volumeAdjustment(
          finding,
          rule,
          'SOBREEXIGENCIA',
          -ADJUSTMENT_TABLE.sobreexigencia.setsDelta,
        ),
      ];
  }
}

/** Filas globales de la tabla. */
export function globalAdjustments(
  input: DiagnosticInput,
  rule: (typeof RULES)[TrainingPurpose],
  taken: ReadonlySet<string>,
): Array<ElaboratedAdjustment | DeclaredOmission> {
  const out: Array<ElaboratedAdjustment | DeclaredOmission> = [];
  const { global, routine } = input;
  const base = { tableVersion: ADJUSTMENT_TABLE_VERSION };

  const { thresholdPercent, sustainedWeeks, frequencyDelta } =
    ADJUSTMENT_TABLE.adherenciaBaja;
  if (global.lowAdherenceWeeks >= sustainedWeeks) {
    const target = routine.targetWeeklyFrequency - frequencyDelta;
    const supporting = {
      ...base,
      adherence: input.adherence,
      lowAdherenceWeeks: global.lowAdherenceWeeks,
      thresholdPercent,
    };
    out.push(
      target < rule.frequency[0]
        ? {
            routineExerciseId: null,
            criterion: 'ADHERENCIA_BAJA_SOSTENIDA',
            reason: `Bajar la frecuencia dejaría la rutina bajo el mínimo del tipo (${String(rule.frequency[0])}).`,
          }
        : {
            type: 'ESTRUCTURA',
            routineExerciseId: null,
            previousValue: {
              target_weekly_frequency: routine.targetWeeklyFrequency,
            },
            proposedValue: {
              target_weekly_frequency: target,
              requires_manual_intervention: true,
            },
            criterion: 'ADHERENCIA_BAJA_SOSTENIDA',
            supportingData: supporting,
          },
    );
  }

  const byId = new Map(input.exercises.map((e) => [e.routineExerciseId, e]));
  for (const imbalance of global.imbalances) {
    const supporting = { ...base, ...imbalance };
    if (imbalance.kind === 'DEFECTO') {
      const room = routine.exercisesPerDay.some(
        (count) => count < rule.exercises[1],
      );
      out.push(
        imbalance.stimulatingPattern && room
          ? {
              type: 'ESTRUCTURA',
              routineExerciseId: null,
              previousValue: { muscle_group: imbalance.muscleGroup },
              proposedValue: {
                action: 'AGREGAR_EJERCICIO',
                requires_manual_intervention: true,
                movement_pattern: imbalance.stimulatingPattern,
                muscle_group: imbalance.muscleGroup,
              },
              criterion: 'DESBALANCE_POR_DEFECTO',
              supportingData: supporting,
            }
          : {
              routineExerciseId: null,
              criterion: 'DESBALANCE_POR_DEFECTO',
              reason: imbalance.stimulatingPattern
                ? 'Todos los días están en el máximo de ejercicios del tipo.'
                : 'No hay un patrón de movimiento identificado para el grupo.',
            },
      );
      continue;
    }
    const candidate = imbalance.routineExerciseIds
      .map((id) => byId.get(id))
      .find(
        (finding): finding is ExerciseFinding =>
          finding !== undefined &&
          !taken.has(finding.routineExerciseId) &&
          workingSets(finding.sets).length - 1 >= rule.workSets[0],
      );
    out.push(
      candidate
        ? volumeAdjustment(
            { ...candidate, metrics: { ...imbalance } },
            rule,
            'DESBALANCE_POR_EXCESO',
            -ADJUSTMENT_TABLE.desbalance.setsDeltaByExcess,
          )
        : {
            routineExerciseId: null,
            criterion: 'DESBALANCE_POR_EXCESO',
            reason:
              'Ningún ejercicio del grupo puede perder una serie sin bajar del mínimo del tipo.',
          },
    );
  }

  if (
    global.goalChange &&
    requiresGoalConfirmation(routine.routineType, global.goalChange.to)
  ) {
    out.push({
      type: 'ESTRUCTURA',
      routineExerciseId: null,
      previousValue: { routine_type: routine.routineType },
      proposedValue: {
        routine_type: global.goalChange.to,
        requires_type_change: true,
        requires_manual_intervention: true,
      },
      criterion: 'CAMBIO_OBJETIVO',
      supportingData: { ...base, goalChange: global.goalChange },
    });
  }
  return out;
}

/**
 * Verifica la propuesta antes de presentarla (RN-39a, RN-85): sin ajustes
 * contradictorios, sin sacar la rutina de los rangos del tipo y sin sustituir
 * por un ejercicio ya presente en la rutina.
 */
function verify(
  input: DiagnosticInput,
  rule: (typeof RULES)[TrainingPurpose],
  candidates: ElaboratedAdjustment[],
): { kept: ElaboratedAdjustment[]; dropped: DeclaredOmission[] } {
  const dropped: DeclaredOmission[] = [];
  const kept: ElaboratedAdjustment[] = [];
  const seen = new Set<string>();
  const substituted = new Set(
    candidates
      .filter((a) => a.type === 'SUSTITUCION' && a.routineExerciseId)
      .map((a) => a.routineExerciseId as string),
  );
  const present = new Set(input.exercises.map((e) => e.exerciseId));
  const drop = (adjustment: ElaboratedAdjustment, reason: string) =>
    dropped.push({
      routineExerciseId: adjustment.routineExerciseId,
      criterion: adjustment.criterion,
      reason,
    });

  for (const adjustment of candidates) {
    // Los globales (sin ejercicio) se distinguen por criterio: puede haber
    // varios ESTRUCTURA distintos en la misma propuesta.
    const key = `${adjustment.routineExerciseId ?? `global:${adjustment.criterion}`}:${adjustment.type}`;
    if (seen.has(key)) {
      drop(adjustment, 'Ajuste duplicado sobre el mismo ejercicio.');
      continue;
    }
    const exerciseId = adjustment.routineExerciseId;
    if (
      exerciseId &&
      substituted.has(exerciseId) &&
      adjustment.type !== 'SUSTITUCION'
    ) {
      drop(adjustment, 'Contradice la sustitución del mismo ejercicio.');
      continue;
    }
    const value = adjustment.proposedValue;
    if (adjustment.type === 'VOLUMEN') {
      const sets = value.series_trabajo as number;
      if (sets < rule.workSets[0] || sets > rule.workSets[1]) {
        drop(
          adjustment,
          'Dejaría la rutina fuera del rango de series del tipo.',
        );
        continue;
      }
    }
    if (adjustment.type === 'ESQUEMA') {
      const min = value.min_repetitions as number;
      const max = value.max_repetitions as number;
      if (min < rule.repetitions[0] || max > rule.repetitions[1]) {
        drop(
          adjustment,
          'Dejaría la rutina fuera del rango de repeticiones del tipo.',
        );
        continue;
      }
    }
    if (
      adjustment.type === 'SUSTITUCION' &&
      (typeof value.exercise_id !== 'string' || present.has(value.exercise_id))
    ) {
      drop(
        adjustment,
        'La alternativa ya está en la rutina o no es admisible.',
      );
      continue;
    }
    seen.add(key);
    kept.push(adjustment);
  }
  return { kept, dropped };
}

/**
 * Elabora la propuesta acotada de un diagnóstico (T2). Función pura: no toca
 * persistencia ni reloj.
 */
export function elaborateAdjustments(input: DiagnosticInput): Elaboration {
  // RN-82: un diagnóstico global con datos insuficientes no genera propuesta.
  if (input.globalSituation === 'DATOS_INSUFICIENTES') {
    return { status: 'DATOS_INSUFICIENTES', adjustments: [], declared: [] };
  }
  const rule = RULES[input.routine.routineType];
  const perExercise = input.exercises.flatMap((finding) =>
    adjustmentsForExercise(finding, rule),
  );
  const taken = new Set(
    perExercise
      .filter(isAdjustment)
      .map((a) => a.routineExerciseId)
      .filter((id): id is string => id !== null),
  );
  const all = [...perExercise, ...globalAdjustments(input, rule, taken)];
  const candidates = all.filter(isAdjustment);
  const declared = all.filter(
    (item): item is DeclaredOmission => !isAdjustment(item),
  );
  const { kept, dropped } = verify(input, rule, candidates);
  return {
    status: kept.length > 0 ? 'PROPUESTA' : 'SIN_AJUSTES',
    adjustments: kept,
    declared: [...declared, ...dropped],
  };
}
