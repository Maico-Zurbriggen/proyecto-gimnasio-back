import type {
  RoutineHistoryActor,
  RoutineHistoryEvent,
  RoutineHistoryGeneration,
  RoutineHistoryItem,
} from '../../application/ports/routine-history.repository';

export interface RoutineHistoryRow {
  id: string;
  state: string;
  origin: string;
  routineType: string;
  targetWeeklyFrequency: number;
  requestedAt: Date;
  requestedByUserId: string | null;
  sourceTemplateId: string | null;
  versionCount: number;
  generation: {
    requestId: string;
    preferences: unknown;
    requestCreatedAt: Date;
    requestFinishedAt: Date | null;
    attempts: number;
    modelVersion: string | null;
    resultCreatedAt: Date;
    structuredOutput: unknown;
  } | null;
  reviews: Array<{
    result: string;
    observation: string | null;
    reviewerTrainerId: string;
    reviewedAt: Date;
  }>;
  audits: Array<{
    operation: string;
    actorUserId: string;
    previousValue: unknown;
    newValue: unknown;
    createdAt: Date;
  }>;
}

type Json = Record<string, unknown>;

const asObject = (value: unknown): Json | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Json)
    : null;

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null;

const REVIEW_LABEL: Record<string, string> = {
  APROBADA: 'Aprobó la rutina',
  APROBADA_CON_CAMBIOS: 'Aprobó la rutina con cambios',
  RECHAZADA: 'Rechazó la rutina',
};

function describeGeneration(
  row: NonNullable<RoutineHistoryRow['generation']>,
): RoutineHistoryGeneration {
  const preferences = asObject(row.preferences) ?? {};
  const task = asObject(preferences.generation_task);
  const parameters = asObject(preferences.parameters);
  const output = asObject(row.structuredOutput);
  return {
    requestId: row.requestId,
    kind: asString(task?.kind) ?? 'INITIAL',
    freeText: asString(preferences.free_text),
    parameters: parameters
      ? {
          objective: String(parameters.objective ?? ''),
          weeklyFrequency: Number(parameters.weekly_frequency ?? 0),
          durationMinutes: Number(parameters.duration_minutes ?? 0),
          restrictions: Array.isArray(parameters.restrictions)
            ? parameters.restrictions.map(String)
            : [],
        }
      : null,
    changeRequest: asString(task?.change_request),
    trainerFeedback: asString(task?.trainer_feedback),
    explanation: asString(output?.explanation),
    attempts: row.attempts,
    modelVersion: row.modelVersion,
    requestedAt: row.requestCreatedAt.toISOString(),
    finishedAt: row.requestFinishedAt?.toISOString() ?? null,
  };
}

function replacedRoutineId(
  generation: RoutineHistoryRow['generation'],
): string | null {
  const preferences = asObject(generation?.preferences);
  const target =
    asObject(preferences?.routine_change_replacement) ??
    asObject(preferences?.local_test_regeneration);
  return asString(target?.replaces_proposed_routine_id);
}

export function buildRoutineHistory(
  rows: RoutineHistoryRow[],
  users: Map<string, string>,
): RoutineHistoryItem[] {
  const actor = (id: string | null): RoutineHistoryActor | null =>
    id ? { id, name: users.get(id) ?? 'Usuario' } : null;

  const replacedBy = new Map<string, string>();
  for (const row of rows) {
    const replaced = replacedRoutineId(row.generation);
    if (replaced) replacedBy.set(replaced, row.id);
  }

  const items = rows.map((row): RoutineHistoryItem => {
    const generation = row.generation
      ? describeGeneration(row.generation)
      : null;
    const events: RoutineHistoryEvent[] = [];
    const requester = actor(row.requestedByUserId);

    if (!generation) {
      events.push({
        type: 'ASIGNADA_DESDE_PLANTILLA',
        at: row.requestedAt.toISOString(),
        actor: requester,
        detail: 'Rutina asignada por el entrenador a partir de una plantilla.',
      });
    } else {
      const base = {
        at: generation.requestedAt,
        actor: requester,
      };
      switch (generation.kind) {
        case 'CHANGE_REQUEST':
          events.push({
            ...base,
            type: 'CAMBIO_SOLICITADO',
            detail: generation.changeRequest,
          });
          break;
        case 'TRAINER_REGENERATION':
          events.push({
            ...base,
            type: 'REGENERACION_ENTRENADOR',
            detail: generation.trainerFeedback,
          });
          break;
        case 'AUTOMATIC_RENEWAL':
          events.push({
            ...base,
            type: 'RENOVACION_AUTOMATICA',
            detail: 'Renovación automática de la rutina vigente.',
          });
          break;
        default:
          events.push({
            ...base,
            type: 'GENERACION_SOLICITADA',
            detail: generation.freeText,
            ...(generation.parameters
              ? { data: { parameters: generation.parameters } }
              : {}),
          });
      }
      events.push({
        type: 'PROPUESTA_GENERADA',
        at: row.generation!.resultCreatedAt.toISOString(),
        actor: null,
        detail: generation.explanation,
        data: {
          attempts: generation.attempts,
          modelVersion: generation.modelVersion,
        },
      });
    }

    for (const review of row.reviews) {
      events.push({
        type: 'REVISION_ENTRENADOR',
        at: review.reviewedAt.toISOString(),
        actor: actor(review.reviewerTrainerId),
        detail: review.observation,
        data: {
          result: review.result,
          label: REVIEW_LABEL[review.result] ?? review.result,
        },
      });
    }

    for (const audit of row.audits) {
      const previous = asObject(audit.previousValue);
      const next = asObject(audit.newValue);
      const from = asString(previous?.state);
      const to = asString(next?.state);
      if (!to) continue;
      events.push({
        type: 'CAMBIO_DE_ESTADO',
        at: audit.createdAt.toISOString(),
        actor: actor(audit.actorUserId),
        detail: from ? `${from} → ${to}` : to,
        data: { operation: audit.operation, from, to },
      });
    }

    events.sort((a, b) => a.at.localeCompare(b.at));

    return {
      routineId: row.id,
      state: row.state,
      origin: row.origin,
      routineType: row.routineType,
      targetWeeklyFrequency: row.targetWeeklyFrequency,
      requestedAt: row.requestedAt.toISOString(),
      requestedBy: requester,
      replacesRoutineId: replacedRoutineId(row.generation),
      replacedByRoutineId: replacedBy.get(row.id) ?? null,
      versionCount: row.versionCount,
      generation,
      events,
    };
  });

  return items.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
}
