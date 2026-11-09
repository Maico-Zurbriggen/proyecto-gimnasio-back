import { describe, expect, it } from 'vitest';

import {
  buildRoutineHistory,
  type RoutineHistoryRow,
} from './build-routine-history';

const base = {
  origin: 'GENERADA',
  routineType: 'FUERZA',
  targetWeeklyFrequency: 3,
  sourceTemplateId: null,
  versionCount: 1,
  reviews: [],
  audits: [],
};

const users = new Map([
  ['student', 'Ana Alumna'],
  ['trainer', 'Tomás Profe'],
]);

function generation(
  requestId: string,
  preferences: unknown,
  at: string,
): NonNullable<RoutineHistoryRow['generation']> {
  return {
    requestId,
    preferences,
    requestCreatedAt: new Date(at),
    requestFinishedAt: new Date(at),
    attempts: 1,
    modelVersion: 'm-1',
    resultCreatedAt: new Date(at),
    structuredOutput: { explanation: `explicación ${requestId}` },
  };
}

describe('buildRoutineHistory', () => {
  const rows: RoutineHistoryRow[] = [
    {
      ...base,
      id: 'r1',
      state: 'DESCARTADA',
      requestedAt: new Date('2026-10-01T10:00:00Z'),
      requestedByUserId: 'student',
      generation: generation(
        'q1',
        {
          free_text: 'Quiero ganar fuerza',
          parameters: null,
          generation_task: { kind: 'INITIAL' },
        },
        '2026-10-01T10:00:00Z',
      ),
      audits: [
        {
          operation: 'ROUTINE_CHANGE_REQUEST',
          actorUserId: 'student',
          previousValue: { state: 'PROPUESTA' },
          newValue: { state: 'DESCARTADA' },
          createdAt: new Date('2026-10-01T11:00:00Z'),
        },
      ],
    },
    {
      ...base,
      id: 'r2',
      state: 'VIGENTE',
      requestedAt: new Date('2026-10-01T11:00:00Z'),
      requestedByUserId: 'student',
      generation: generation(
        'q2',
        {
          free_text: null,
          parameters: null,
          generation_task: {
            kind: 'CHANGE_REQUEST',
            change_request: 'Más pecho',
          },
          routine_change_replacement: { replaces_proposed_routine_id: 'r1' },
        },
        '2026-10-01T11:00:00Z',
      ),
      reviews: [
        {
          result: 'APROBADA_CON_CAMBIOS',
          observation: 'Bajé el volumen de piernas',
          reviewerTrainerId: 'trainer',
          reviewedAt: new Date('2026-10-02T09:00:00Z'),
        },
      ],
    },
    {
      ...base,
      id: 'r0',
      origin: 'PLANTILLA_ENTRENADOR',
      state: 'ARCHIVADA',
      requestedAt: new Date('2026-09-01T10:00:00Z'),
      requestedByUserId: 'trainer',
      generation: null,
    },
  ];

  const history = buildRoutineHistory(rows, users);

  it('orders routines newest first', () => {
    expect(history.map((item) => item.routineId)).toEqual(['r2', 'r1', 'r0']);
  });

  it('links a replacement with the proposal it replaced', () => {
    const [r2, r1] = history;
    expect(r2?.replacesRoutineId).toBe('r1');
    expect(r1?.replacedByRoutineId).toBe('r2');
    expect(r1?.replacesRoutineId).toBeNull();
  });

  it('records the student request, the change request and the trainer review', () => {
    const [r2, r1] = history;
    expect(r1?.events.map((e) => e.type)).toEqual([
      'GENERACION_SOLICITADA',
      'PROPUESTA_GENERADA',
      'CAMBIO_DE_ESTADO',
    ]);
    expect(r1?.events[0]).toMatchObject({
      detail: 'Quiero ganar fuerza',
      actor: { id: 'student', name: 'Ana Alumna' },
    });
    expect(r1?.events[2]?.detail).toBe('PROPUESTA → DESCARTADA');
    expect(r2?.generation).toMatchObject({
      kind: 'CHANGE_REQUEST',
      changeRequest: 'Más pecho',
      explanation: 'explicación q2',
    });
    expect(r2?.events.map((e) => e.type)).toEqual([
      'CAMBIO_SOLICITADO',
      'PROPUESTA_GENERADA',
      'REVISION_ENTRENADOR',
    ]);
    expect(r2?.events[2]).toMatchObject({
      detail: 'Bajé el volumen de piernas',
      actor: { name: 'Tomás Profe' },
      data: { label: 'Aprobó la rutina con cambios' },
    });
  });

  it('marks template routines without generation', () => {
    const r0 = history[2];
    expect(r0?.generation).toBeNull();
    expect(r0?.events[0]?.type).toBe('ASIGNADA_DESDE_PLANTILLA');
  });
});
