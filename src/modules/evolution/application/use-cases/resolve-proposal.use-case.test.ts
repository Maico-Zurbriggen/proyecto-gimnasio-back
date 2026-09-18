import { describe, expect, it, vi } from 'vitest';

import { TrainerNotAssignedError } from '../../../students/domain/errors/student-errors';
import {
  ProposalNotFoundError,
  ProposalNotPendingError,
  RoutineNotAvailableError,
} from '../../domain/errors/proposal-errors';
import type {
  CurrentVersionSnapshot,
  ProposalRecord,
  ProposalsRepository,
} from '../ports/proposals.repository';
import { ResolveProposalUseCase } from './resolve-proposal.use-case';

const TRAINER_ID = '33333333-3333-4333-a333-333333333333';
const STUDENT_ID = '11111111-1111-4111-a111-111111111111';
const PROPOSAL_ID = '66666666-6666-4666-a666-666666666666';
const ROUTINE_ID = '60000000-0000-4000-8000-000000000005';
const ADJ_LOAD_ID = '67000000-0000-4000-8000-000000000001';
const ADJ_SCHEME_ID = '67000000-0000-4000-8000-000000000002';

const resolvedAt = new Date('2026-09-17T12:00:00Z');
const clock = { now: () => resolvedAt };

function createProposalRecord(
  overrides: Partial<ProposalRecord> = {},
): ProposalRecord {
  return {
    id: PROPOSAL_ID,
    state: 'PENDIENTE',
    createdAt: new Date('2026-09-15T12:00:00Z'),
    resolvedAt: null,
    resolutionReason: null,
    student: { id: STUDENT_ID, displayName: 'Alumno Prueba' },
    diagnostic: {
      periodStart: new Date('2026-08-15T12:00:00Z'),
      periodEnd: new Date('2026-09-15T12:00:00Z'),
      globalSituation: 'ESTANCAMIENTO',
      adherence: 80,
    },
    routine: {
      id: ROUTINE_ID,
      routineType: 'FUERZA',
      cycleStart: new Date('2026-07-15T12:00:00Z'),
      currentVersionNumber: 1,
    },
    adjustments: [
      {
        id: ADJ_LOAD_ID,
        type: 'CARGA',
        routineExerciseId: 're-sentadilla',
        exerciseName: 'Sentadilla con barra',
        criterion: 'Estancamiento',
        previousValue: { carga_sugerida: 60 },
        proposedValue: { carga_sugerida: 65 },
        supportingData: { sesiones: 6 },
        state: 'PENDIENTE',
      },
      {
        id: ADJ_SCHEME_ID,
        type: 'ESQUEMA',
        routineExerciseId: 're-sentadilla',
        exerciseName: 'Sentadilla con barra',
        criterion: 'Tope del rango',
        previousValue: { min_repetitions: 3, max_repetitions: 6 },
        proposedValue: { min_repetitions: 4, max_repetitions: 6 },
        supportingData: {},
        state: 'PENDIENTE',
      },
    ],
    measurementDates: [new Date('2026-09-16T12:00:00Z')],
    previousProposalDates: [],
    ...overrides,
  };
}

function createCurrentVersionSnapshot(): CurrentVersionSnapshot {
  return {
    routineId: ROUTINE_ID,
    days: [
      {
        position: 1,
        name: 'Día A · Pierna',
        dominantPattern: 'DOMINANTE_RODILLA',
        exercises: [
          {
            sourceId: 're-sentadilla',
            exerciseId: 'e-sentadilla',
            position: 1,
            note: null,
            compatibilityState: 'COMPATIBLE',
            compatibilityReason: null,
            sets: [
              {
                position: 1,
                minRepetitions: 3,
                maxRepetitions: 6,
                suggestedLoad: 20,
                restSeconds: 180,
                warmup: true,
              },
              {
                position: 2,
                minRepetitions: 3,
                maxRepetitions: 6,
                suggestedLoad: 60,
                restSeconds: 180,
                warmup: false,
              },
              {
                position: 3,
                minRepetitions: 3,
                maxRepetitions: 6,
                suggestedLoad: 60,
                restSeconds: 180,
                warmup: false,
              },
            ],
          },
        ],
      },
    ],
  };
}

describe('ResolveProposalUseCase - HU04 / RF-092', () => {
  it('Esc. 3: total approval creates a new version with all adjustments, without second review and resets cycle date (RF-092, RN-35a, RN-88)', async () => {
    const record = createProposalRecord();
    const currentVersion = createCurrentVersionSnapshot();

    const mockProposalsRepository: ProposalsRepository = {
      findById: vi.fn().mockResolvedValue(record),
      findPendingForTrainer: vi.fn().mockResolvedValue([record]),
      findCurrentVersion: vi.fn().mockResolvedValue(currentVersion),
      persistResolution: vi.fn().mockResolvedValue({
        resolved: true,
        resultingVersionNumber: 2,
      }),
    };
    const mockAssignments = {
      isActive: vi.fn().mockResolvedValue(true),
    };

    const useCase = new ResolveProposalUseCase(
      mockProposalsRepository,
      mockAssignments,
      clock,
    );

    const result = await useCase.execute({
      trainerId: TRAINER_ID,
      proposalId: PROPOSAL_ID,
      decision: 'ACEPTADA_TOTAL',
    });

    expect(result).toEqual({
      proposalId: PROPOSAL_ID,
      state: 'ACEPTADA_TOTAL',
      resultingVersionNumber: 2,
    });

    expect(mockAssignments.isActive).toHaveBeenCalledWith(
      TRAINER_ID,
      STUDENT_ID,
    );
    expect(mockProposalsRepository.findCurrentVersion).toHaveBeenCalledWith(
      ROUTINE_ID,
    );

    const command = vi.mocked(mockProposalsRepository.persistResolution).mock
      .calls[0]![0];
    expect(command.proposalId).toBe(PROPOSAL_ID);
    expect(command.trainerId).toBe(TRAINER_ID);
    expect(command.studentId).toBe(STUDENT_ID);
    expect(command.routineId).toBe(ROUTINE_ID);
    expect(command.resolvedAt).toEqual(resolvedAt);

    // RN-35a: La resolución favorable es la revisión y no se pide otra.
    expect(command.plan).toEqual({
      state: 'ACEPTADA_TOTAL',
      acceptedIds: [ADJ_LOAD_ID, ADJ_SCHEME_ID],
      rejectedIds: [],
      reviewResult: 'APROBADA',
      reason: null,
    });

    // RF-092: Se aplicaron todos los ajustes a los sets de trabajo de la nueva versión.
    expect(command.newVersionDays).toBeDefined();
    const newSets = command.newVersionDays![0]!.exercises[0]!.sets;
    // Set de calentamiento no se altera
    expect(newSets[0]).toMatchObject({
      warmup: true,
      suggestedLoad: 20,
      minRepetitions: 3,
    });
    // Sets de trabajo actualizados con carga y esquema
    expect(newSets[1]).toMatchObject({
      warmup: false,
      suggestedLoad: 65,
      minRepetitions: 4,
      maxRepetitions: 6,
    });
    expect(newSets[2]).toMatchObject({
      warmup: false,
      suggestedLoad: 65,
      minRepetitions: 4,
      maxRepetitions: 6,
    });

    // Invariante RF-092: La versión de origen se conserva íntegra sin mutaciones
    expect(currentVersion.days[0]!.exercises[0]!.sets[1]!.suggestedLoad).toBe(
      60,
    );
    expect(currentVersion.days[0]!.exercises[0]!.sets[1]!.minRepetitions).toBe(
      3,
    );
  });

  it('Esc. 3: partial approval creates a new version with only the accepted adjustments (RN-88)', async () => {
    const record = createProposalRecord();
    const currentVersion = createCurrentVersionSnapshot();

    const mockProposalsRepository: ProposalsRepository = {
      findById: vi.fn().mockResolvedValue(record),
      findPendingForTrainer: vi.fn().mockResolvedValue([record]),
      findCurrentVersion: vi.fn().mockResolvedValue(currentVersion),
      persistResolution: vi.fn().mockResolvedValue({
        resolved: true,
        resultingVersionNumber: 2,
      }),
    };
    const mockAssignments = {
      isActive: vi.fn().mockResolvedValue(true),
    };

    const useCase = new ResolveProposalUseCase(
      mockProposalsRepository,
      mockAssignments,
      clock,
    );

    const result = await useCase.execute({
      trainerId: TRAINER_ID,
      proposalId: PROPOSAL_ID,
      decision: 'ACEPTADA_PARCIAL',
      acceptedAdjustmentIds: [ADJ_LOAD_ID],
      reason: 'Ajuste de carga únicamente',
    });

    expect(result.state).toBe('ACEPTADA_PARCIAL');
    expect(result.resultingVersionNumber).toBe(2);

    const command = vi.mocked(mockProposalsRepository.persistResolution).mock
      .calls[0]![0];
    expect(command.plan.reviewResult).toBe('APROBADA_CON_CAMBIOS');
    expect(command.plan.acceptedIds).toEqual([ADJ_LOAD_ID]);
    expect(command.plan.rejectedIds).toEqual([ADJ_SCHEME_ID]);
    expect(command.plan.reason).toBe('Ajuste de carga únicamente');

    const newSets = command.newVersionDays![0]!.exercises[0]!.sets;
    expect(newSets[1]!.suggestedLoad).toBe(65);
    // El esquema no aceptado mantiene el valor original
    expect(newSets[1]!.minRepetitions).toBe(3);
  });

  it('Esc. 4: rejection requires reason and does not create a new version (RN-90)', async () => {
    const record = createProposalRecord();

    const mockProposalsRepository: ProposalsRepository = {
      findById: vi.fn().mockResolvedValue(record),
      findPendingForTrainer: vi.fn().mockResolvedValue([record]),
      findCurrentVersion: vi.fn(),
      persistResolution: vi.fn().mockResolvedValue({
        resolved: true,
        resultingVersionNumber: null,
      }),
    };
    const mockAssignments = {
      isActive: vi.fn().mockResolvedValue(true),
    };

    const useCase = new ResolveProposalUseCase(
      mockProposalsRepository,
      mockAssignments,
      clock,
    );

    const result = await useCase.execute({
      trainerId: TRAINER_ID,
      proposalId: PROPOSAL_ID,
      decision: 'RECHAZADA',
      reason: 'Alumno con sobreentrenamiento, mantener descarga',
    });

    expect(result).toEqual({
      proposalId: PROPOSAL_ID,
      state: 'RECHAZADA',
      resultingVersionNumber: null,
    });

    expect(mockProposalsRepository.findCurrentVersion).not.toHaveBeenCalled();

    const command = vi.mocked(mockProposalsRepository.persistResolution).mock
      .calls[0]![0];
    expect(command.newVersionDays).toBeNull();
    expect(command.routineId).toBeNull();
    expect(command.plan.reviewResult).toBeNull();
    expect(command.plan.reason).toBe(
      'Alumno con sobreentrenamiento, mantener descarga',
    );
  });

  it('throws ProposalNotFoundError when proposal does not exist', async () => {
    const mockProposalsRepository: ProposalsRepository = {
      findById: vi.fn().mockResolvedValue(null),
      findPendingForTrainer: vi.fn().mockResolvedValue([]),
      findCurrentVersion: vi.fn(),
      persistResolution: vi.fn(),
    };
    const mockAssignments = { isActive: vi.fn().mockResolvedValue(true) };

    const useCase = new ResolveProposalUseCase(
      mockProposalsRepository,
      mockAssignments,
      clock,
    );

    await expect(
      useCase.execute({
        trainerId: TRAINER_ID,
        proposalId: PROPOSAL_ID,
        decision: 'ACEPTADA_TOTAL',
      }),
    ).rejects.toThrow(ProposalNotFoundError);
  });

  it('throws TrainerNotAssignedError when trainer is not actively assigned to the student (RN-86)', async () => {
    const record = createProposalRecord();
    const mockProposalsRepository: ProposalsRepository = {
      findById: vi.fn().mockResolvedValue(record),
      findPendingForTrainer: vi.fn().mockResolvedValue([]),
      findCurrentVersion: vi.fn(),
      persistResolution: vi.fn(),
    };
    const mockAssignments = { isActive: vi.fn().mockResolvedValue(false) };

    const useCase = new ResolveProposalUseCase(
      mockProposalsRepository,
      mockAssignments,
      clock,
    );

    await expect(
      useCase.execute({
        trainerId: TRAINER_ID,
        proposalId: PROPOSAL_ID,
        decision: 'ACEPTADA_TOTAL',
      }),
    ).rejects.toThrow(TrainerNotAssignedError);
  });

  it('throws ProposalNotPendingError when proposal is already resolved', async () => {
    const record = createProposalRecord({ state: 'ACEPTADA_TOTAL' });
    const mockProposalsRepository: ProposalsRepository = {
      findById: vi.fn().mockResolvedValue(record),
      findPendingForTrainer: vi.fn().mockResolvedValue([]),
      findCurrentVersion: vi.fn(),
      persistResolution: vi.fn(),
    };
    const mockAssignments = { isActive: vi.fn().mockResolvedValue(true) };

    const useCase = new ResolveProposalUseCase(
      mockProposalsRepository,
      mockAssignments,
      clock,
    );

    await expect(
      useCase.execute({
        trainerId: TRAINER_ID,
        proposalId: PROPOSAL_ID,
        decision: 'ACEPTADA_TOTAL',
      }),
    ).rejects.toThrow(ProposalNotPendingError);
  });

  it('throws RoutineNotAvailableError when routine of proposal has no current version snapshot', async () => {
    const record = createProposalRecord({ routine: null });
    const mockProposalsRepository: ProposalsRepository = {
      findById: vi.fn().mockResolvedValue(record),
      findPendingForTrainer: vi.fn().mockResolvedValue([]),
      findCurrentVersion: vi.fn().mockResolvedValue(null),
      persistResolution: vi.fn(),
    };
    const mockAssignments = { isActive: vi.fn().mockResolvedValue(true) };

    const useCase = new ResolveProposalUseCase(
      mockProposalsRepository,
      mockAssignments,
      clock,
    );

    await expect(
      useCase.execute({
        trainerId: TRAINER_ID,
        proposalId: PROPOSAL_ID,
        decision: 'ACEPTADA_TOTAL',
      }),
    ).rejects.toThrow(RoutineNotAvailableError);
  });

  it('throws ProposalNotPendingError when persistResolution reports concurrency conflict (already resolved)', async () => {
    const record = createProposalRecord();
    const currentVersion = createCurrentVersionSnapshot();

    const mockProposalsRepository: ProposalsRepository = {
      findById: vi.fn().mockResolvedValue(record),
      findPendingForTrainer: vi.fn().mockResolvedValue([]),
      findCurrentVersion: vi.fn().mockResolvedValue(currentVersion),
      persistResolution: vi.fn().mockResolvedValue({
        resolved: false,
        resultingVersionNumber: null,
      }),
    };
    const mockAssignments = { isActive: vi.fn().mockResolvedValue(true) };

    const useCase = new ResolveProposalUseCase(
      mockProposalsRepository,
      mockAssignments,
      clock,
    );

    await expect(
      useCase.execute({
        trainerId: TRAINER_ID,
        proposalId: PROPOSAL_ID,
        decision: 'ACEPTADA_TOTAL',
      }),
    ).rejects.toThrow(ProposalNotPendingError);
  });
});
