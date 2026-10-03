import { describe, expect, it, vi } from 'vitest';

import { Routine } from '../../domain/entities/routine.entity';
import {
  RoutineNotActiveError,
  RoutineNotFoundError,
} from '../../domain/errors/routine-errors';
import { EstadoAvisoRenovacion } from '../../domain/services/routine-renewal';
import type { Clock } from '../ports/clock';
import type { RoutinesRepository } from '../ports/routines.repository';
import { GetActiveRoutineUseCase } from './get-active-routine.use-case';

describe('GetActiveRoutineUseCase', () => {
  const fixedNow = new Date('2026-09-08T12:00:00Z');
  const mockClock: Clock = {
    now: () => fixedNow,
  };

  it('returns active routine response with derived renewal days and notice status (T2 and T3)', async () => {
    const studentId = '11111111-1111-1111-1111-111111111111';
    const activeRoutine = new Routine({
      id: '22222222-2222-2222-2222-222222222222',
      studentId,
      routineType: 'HIPERTROFIA',
      targetWeeklyFrequency: 4,
      state: 'VIGENTE',
      origin: 'PLANTILLA_ENTRENADOR',
      startDate: new Date('2026-08-09T00:00:00Z'),
      currentVersionNumber: 1,
    });

    const mockRepository: RoutinesRepository = {
      findActiveByStudentId: vi.fn().mockResolvedValue(activeRoutine),
    };

    const useCase = new GetActiveRoutineUseCase(mockRepository, mockClock);
    const result = await useCase.execute({ studentId });

    expect(result.id).toBe(activeRoutine.id);
    expect(result.studentId).toBe(studentId);
    expect(result.state).toBe('VIGENTE');
    expect(result.startDate).toBe('2026-08-09T00:00:00.000Z');
    // Ciclo de 60 días: 2026-08-09 + 60 = 2026-10-08
    expect(result.renewalDate).toBe('2026-10-08T00:00:00.000Z');
    // 2026-09-08 to 2026-10-08 is 30 days
    expect(result.diasRestantesRenovacion).toBe(30);
    expect(result.avisoRenovacion).toEqual({
      estado: EstadoAvisoRenovacion.PENDIENTE,
      diasRestantes: 30,
      fechaVencimiento: '2026-10-08T00:00:00.000Z',
    });
  });

  it('derives "cerrado hoy" when cycle renewal expires on the current date', async () => {
    const studentId = '11111111-1111-1111-1111-111111111111';
    const activeRoutine = new Routine({
      id: '22222222-2222-2222-2222-222222222222',
      studentId,
      routineType: 'FUERZA',
      targetWeeklyFrequency: 3,
      state: 'VIGENTE',
      origin: 'GENERADA',
      // Ciclo de 60 días: 2026-07-10 + 60 = 2026-09-08, el "ahora" del test
      startDate: new Date('2026-07-10T00:00:00Z'),
    });

    const mockRepository: RoutinesRepository = {
      findActiveByStudentId: vi.fn().mockResolvedValue(activeRoutine),
    };

    const useCase = new GetActiveRoutineUseCase(mockRepository, mockClock);
    const result = await useCase.execute({ studentId });

    expect(result.diasRestantesRenovacion).toBe(0);
    expect(result.avisoRenovacion.estado).toBe(
      EstadoAvisoRenovacion.CERRADO_HOY,
    );
  });

  it('derives "vencido" when cycle renewal date has passed', async () => {
    const studentId = '11111111-1111-1111-1111-111111111111';
    const activeRoutine = new Routine({
      id: '22222222-2222-2222-2222-222222222222',
      studentId,
      routineType: 'RESISTENCIA_MUSCULAR',
      targetWeeklyFrequency: 3,
      state: 'VIGENTE',
      origin: 'PLANTILLA_ENTRENADOR',
      startDate: new Date('2026-05-01T00:00:00Z'),
    });

    const mockRepository: RoutinesRepository = {
      findActiveByStudentId: vi.fn().mockResolvedValue(activeRoutine),
    };

    const useCase = new GetActiveRoutineUseCase(mockRepository, mockClock);
    const result = await useCase.execute({ studentId });

    expect(result.diasRestantesRenovacion).toBeLessThan(0);
    expect(result.avisoRenovacion.estado).toBe(EstadoAvisoRenovacion.VENCIDO);
  });

  it('throws RoutineNotFoundError when student has no active routine', async () => {
    const studentId = '11111111-1111-1111-1111-111111111111';
    const mockRepository: RoutinesRepository = {
      findActiveByStudentId: vi.fn().mockResolvedValue(null),
    };

    const useCase = new GetActiveRoutineUseCase(mockRepository, mockClock);
    await expect(useCase.execute({ studentId })).rejects.toThrow(
      RoutineNotFoundError,
    );
  });

  it('throws RoutineNotActiveError if returned routine is not VIGENTE', async () => {
    const studentId = '11111111-1111-1111-1111-111111111111';
    const nonActiveRoutine = new Routine({
      id: '22222222-2222-2222-2222-222222222222',
      studentId,
      routineType: 'FUERZA',
      targetWeeklyFrequency: 3,
      state: 'ARCHIVADA',
      origin: 'PLANTILLA_ENTRENADOR',
      startDate: new Date('2026-01-01T00:00:00Z'),
    });

    const mockRepository: RoutinesRepository = {
      findActiveByStudentId: vi.fn().mockResolvedValue(nonActiveRoutine),
    };

    const useCase = new GetActiveRoutineUseCase(mockRepository, mockClock);
    await expect(useCase.execute({ studentId })).rejects.toThrow(
      RoutineNotActiveError,
    );
  });
});
