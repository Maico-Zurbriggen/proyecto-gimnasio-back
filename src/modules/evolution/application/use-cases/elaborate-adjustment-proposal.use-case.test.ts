import { describe, expect, it, vi } from 'vitest';

import type {
  AdjustmentProposalsRepository,
  DeliveredProposal,
} from '../ports/adjustment-proposals.repository';
import type { DiagnosticInput } from '../../domain/services/adjustment-table';
import {
  DiagnosticNotFoundError,
  ElaborateAdjustmentProposalUseCase,
} from './elaborate-adjustment-proposal.use-case';

const AT = new Date('2026-11-02T12:00:00Z');

function diagnostic(overrides: Partial<DiagnosticInput> = {}): DiagnosticInput {
  return {
    diagnosticId: 'd-1',
    globalSituation: 'ESTIMULO_INSUFICIENTE',
    adherence: 90,
    routine: {
      routineType: 'HIPERTROFIA',
      targetWeeklyFrequency: 4,
      exercisesPerDay: [5, 5, 5, 5],
    },
    exercises: [
      {
        routineExerciseId: 're-1',
        exerciseId: 'ex-1',
        exerciseName: 'Press banca',
        situation: 'ESTIMULO_INSUFICIENTE',
        compatibilityState: 'COMPATIBLE',
        consecutiveStagnations: 0,
        sets: [
          {
            position: 1,
            minRepetitions: 6,
            maxRepetitions: 8,
            suggestedLoad: 60,
            restSeconds: 90,
            warmup: false,
          },
        ],
        metrics: {},
        alternativeExerciseId: null,
      },
    ],
    global: { lowAdherenceWeeks: 0, imbalances: [], goalChange: null },
    ...overrides,
  };
}

function setup(
  loaded: DiagnosticInput | null,
  existing: DeliveredProposal | null = null,
) {
  const deliver = vi.fn().mockResolvedValue({
    proposalId: 'p-1',
    state: 'PENDIENTE',
    alreadyExisted: false,
  } satisfies DeliveredProposal);
  const repository: AdjustmentProposalsRepository = {
    listDiagnosticIdsWithoutProposal: vi.fn().mockResolvedValue([]),
    loadDiagnostic: vi.fn().mockResolvedValue(loaded),
    findProposalByDiagnostic: vi.fn().mockResolvedValue(existing),
    deliver,
  };
  return {
    deliver,
    repository,
    useCase: new ElaborateAdjustmentProposalUseCase(repository, {
      now: () => AT,
    }),
  };
}

describe('ElaborateAdjustmentProposalUseCase', () => {
  it('entrega a Evolution una propuesta con los ajustes de la tabla', async () => {
    const { useCase, deliver } = setup(diagnostic());
    const result = await useCase.execute({ diagnosticId: 'd-1' });

    expect(result).toMatchObject({
      status: 'PROPUESTA',
      proposalId: 'p-1',
      proposalState: 'PENDIENTE',
      alreadyExisted: false,
    });
    expect(deliver).toHaveBeenCalledOnce();
    const call = deliver.mock.calls[0]?.[0];
    expect(call).toMatchObject({
      diagnosticId: 'd-1',
      componentVersion: 'adjustment-table-v1',
      at: AT,
    });
    expect(call.elaboration.adjustments[0]).toMatchObject({
      type: 'CARGA',
      proposedValue: { carga_sugerida: 62.5 },
    });
  });

  it('no duplica la propuesta al reejecutar el mismo diagnóstico', async () => {
    const { useCase, deliver, repository } = setup(diagnostic(), {
      proposalId: 'p-9',
      state: 'BLOQUEADA',
      alreadyExisted: true,
    });
    const result = await useCase.execute({ diagnosticId: 'd-1' });

    expect(result).toMatchObject({
      proposalId: 'p-9',
      proposalState: 'BLOQUEADA',
      alreadyExisted: true,
    });
    expect(deliver).not.toHaveBeenCalled();
    expect(repository.loadDiagnostic).not.toHaveBeenCalled();
  });

  it('no genera propuesta con DATOS_INSUFICIENTES global (RN-82)', async () => {
    const { useCase, deliver } = setup(
      diagnostic({ globalSituation: 'DATOS_INSUFICIENTES' }),
    );
    const result = await useCase.execute({ diagnosticId: 'd-1' });
    expect(result).toMatchObject({
      status: 'DATOS_INSUFICIENTES',
      proposalId: null,
    });
    expect(deliver).not.toHaveBeenCalled();
  });

  it('sin ajustes no genera propuesta y declara las omisiones', async () => {
    const { useCase, deliver } = setup(
      diagnostic({
        exercises: [
          {
            ...diagnostic().exercises[0]!,
            situation: 'ESTANCAMIENTO',
            consecutiveStagnations: 2,
            alternativeExerciseId: null,
          },
        ],
      }),
    );
    const result = await useCase.execute({ diagnosticId: 'd-1' });
    expect(result.status).toBe('SIN_AJUSTES');
    expect(result.proposalId).toBeNull();
    expect(result.declared).toHaveLength(1);
    expect(deliver).not.toHaveBeenCalled();
  });

  it('falla si el diagnóstico no existe', async () => {
    const { useCase } = setup(null);
    await expect(useCase.execute({ diagnosticId: 'x' })).rejects.toBeInstanceOf(
      DiagnosticNotFoundError,
    );
  });

  it('informa BLOQUEADA cuando el alumno no tiene entrenador', async () => {
    const { useCase, deliver } = setup(diagnostic());
    deliver.mockResolvedValueOnce({
      proposalId: 'p-2',
      state: 'BLOQUEADA',
      alreadyExisted: false,
    });
    const result = await useCase.execute({ diagnosticId: 'd-1' });
    expect(result.proposalState).toBe('BLOQUEADA');
  });
});
