export type RoutineHistoryEventType =
  | 'ASIGNADA_DESDE_PLANTILLA'
  | 'GENERACION_SOLICITADA'
  | 'CAMBIO_SOLICITADO'
  | 'REGENERACION_ENTRENADOR'
  | 'RENOVACION_AUTOMATICA'
  | 'PROPUESTA_GENERADA'
  | 'REVISION_ENTRENADOR'
  | 'CAMBIO_DE_ESTADO';

export interface RoutineHistoryActor {
  id: string;
  name: string;
}

export interface RoutineHistoryEvent {
  type: RoutineHistoryEventType;
  at: string;
  actor: RoutineHistoryActor | null;
  /** Texto del alumno/profe o resumen legible del evento. */
  detail: string | null;
  /** Datos estructurados opcionales (parámetros pedidos, resultado de revisión…). */
  data?: Record<string, unknown>;
}

export interface RoutineHistoryGeneration {
  requestId: string;
  kind: string;
  freeText: string | null;
  parameters: {
    objective: string;
    weeklyFrequency: number;
    durationMinutes: number;
    restrictions: string[];
  } | null;
  changeRequest: string | null;
  trainerFeedback: string | null;
  explanation: string | null;
  attempts: number;
  modelVersion: string | null;
  requestedAt: string;
  finishedAt: string | null;
}

export interface RoutineHistoryItem {
  routineId: string;
  state: string;
  origin: string;
  routineType: string;
  targetWeeklyFrequency: number;
  requestedAt: string;
  requestedBy: RoutineHistoryActor | null;
  /** Propuesta que esta rutina reemplazó (pedido de cambios o regeneración). */
  replacesRoutineId: string | null;
  /** Propuesta posterior que reemplazó a esta. */
  replacedByRoutineId: string | null;
  versionCount: number;
  generation: RoutineHistoryGeneration | null;
  events: RoutineHistoryEvent[];
}

export interface RoutineHistoryRepository {
  listByStudent(studentId: string): Promise<RoutineHistoryItem[]>;
}
