import { describe, expect, it, vi } from 'vitest';

import { ResolveProposalUseCase } from '../../src/modules/evolution/application/use-cases/resolve-proposal.use-case';
import type {
  CurrentVersionSnapshot,
  ProposalRecord,
  ProposalsRepository,
} from '../../src/modules/evolution/application/ports/proposals.repository';
import { Routine } from '../../src/modules/routines/domain/entities/routine.entity';
import { EstadoAvisoRenovacion } from '../../src/modules/routines/domain/services/routine-renewal';
import type { RoutinesRepository } from '../../src/modules/routines/application/ports/routines.repository';
import { GetActiveRoutineUseCase } from '../../src/modules/routines/application/use-cases/get-active-routine.use-case';
import type { TrainerAssignments } from '../../src/modules/students/application/ports/trainer-assignments.port';

const TRAINER_ID = '33333333-3333-4333-a333-333333333333';
const STUDENT_ID = '11111111-1111-4111-a111-111111111111';
const PROPOSAL_ID = '66666666-6666-4666-a666-666666666666';
const ROUTINE_ID = '60000000-0000-4000-8000-000000000005';
const VERSION_1_ID = '70000000-0000-4000-8000-000000000001';
const ADJ_LOAD_ID = '67000000-0000-4000-8000-000000000001';

const now = new Date('2026-09-17T12:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);
const clock = { now: () => now };

describe('Integration: Routine Adaptation Versioning & Cycle Reset (RF-092, RN-35a, RN-88, RN-89)', () => {
  it('approving adaptation proposal generates new version, preserves previous version and executed sessions, and resets the renewal cycle date', async () => {
    // 1. Estado inicial: Rutina en Versión 1 iniciada hace 60 días (ciclo cumplido/vencido).
    const version1Date = daysAgo(60);
    let currentVersionNumber = 1;
    let currentStartDate = version1Date;

    // Sesiones ejecutadas históricamente bajo la Versión 1 (RN-89)
    const executedSessions = [
      {
        id: 'session-1',
        routineVersionId: VERSION_1_ID,
        occurredOn: daysAgo(50),
      },
      {
        id: 'session-2',
        routineVersionId: VERSION_1_ID,
        occurredOn: daysAgo(30),
      },
      {
        id: 'session-3',
        routineVersionId: VERSION_1_ID,
        occurredOn: daysAgo(10),
      },
    ];

    // Snapshot de la versión actual (Versión 1)
    const version1Snapshot: CurrentVersionSnapshot = {
      routineId: ROUTINE_ID,
      days: [
        {
          position: 1,
          name: 'Día A · Torso',
          dominantPattern: 'EMPUJE_HORIZONTAL',
          exercises: [
            {
              sourceId: 're-press-banca',
              exerciseId: 'press-banca',
              position: 1,
              note: null,
              compatibilityState: 'COMPATIBLE',
              compatibilityReason: null,
              sets: [
                {
                  position: 1,
                  minRepetitions: 8,
                  maxRepetitions: 12,
                  suggestedLoad: 50,
                  restSeconds: 120,
                  warmup: false,
                },
              ],
            },
          ],
        },
      ],
    };

    // Propuesta de adaptación PENDIENTE
    const proposalRecord: ProposalRecord = {
      id: PROPOSAL_ID,
      state: 'PENDIENTE',
      createdAt: daysAgo(1),
      resolvedAt: null,
      resolutionReason: null,
      student: { id: STUDENT_ID, displayName: 'Martín Gómez' },
      diagnostic: {
        periodStart: daysAgo(20),
        periodEnd: daysAgo(1),
        globalSituation: 'PROGRESION_ADECUADA',
        adherence: 95,
      },
      routine: {
        id: ROUTINE_ID,
        routineType: 'FUERZA',
        cycleStart: currentStartDate,
        currentVersionNumber: 1,
      },
      adjustments: [
        {
          id: ADJ_LOAD_ID,
          type: 'CARGA',
          routineExerciseId: 're-press-banca',
          exerciseName: 'Press de banca plano con barra',
          criterion: 'Sobrecarga progresiva',
          previousValue: { carga_sugerida: 50 },
          proposedValue: { carga_sugerida: 55 },
          supportingData: { variacion_1rm: '+5%' },
          state: 'PENDIENTE',
        },
      ],
      measurementDates: [daysAgo(5)],
      previousProposalDates: [],
    };

    // Repositorio de rutinas que devuelve la rutina vigente del alumno
    const routinesRepository: RoutinesRepository = {
      findActiveByStudentId: vi
        .fn()
        .mockImplementation(async (studentId: string) => {
          if (studentId !== STUDENT_ID) return null;
          return new Routine({
            id: ROUTINE_ID,
            studentId,
            routineType: 'FUERZA',
            targetWeeklyFrequency: 3,
            state: 'VIGENTE',
            origin: 'PLANTILLA_ENTRENADOR',
            startDate: currentStartDate,
            currentVersionNumber,
          });
        }),
    };

    // Repositorio de propuestas en memoria
    const proposalsRepository: ProposalsRepository = {
      findById: vi.fn().mockResolvedValue(proposalRecord),
      findPendingForTrainer: vi.fn().mockResolvedValue([proposalRecord]),
      findCurrentVersion: vi.fn().mockResolvedValue(version1Snapshot),
      persistResolution: vi.fn().mockImplementation(async (command) => {
        // Simulación fiel de PrismaProposalsRepository.persistResolution:
        // 1. Incrementa versión
        currentVersionNumber = 2;
        // 2. Registra revisión favorable en resolvedAt y actualiza la fecha de inicio de ciclo (startDate)
        currentStartDate = command.resolvedAt;

        return {
          resolved: true,
          resultingVersionNumber: currentVersionNumber,
        };
      }),
    };

    const trainerAssignments: TrainerAssignments = {
      isActive: vi.fn().mockResolvedValue(true),
    };

    // Caso de uso para consultar la rutina activa antes de la aprobación
    const getActiveRoutineUseCase = new GetActiveRoutineUseCase(
      routinesRepository,
      clock,
    );

    // Verificación previa: Ciclo de 60 días iniciado hace 60 días -> vence hoy (0 días restantes)
    const routineBeforeApproval = await getActiveRoutineUseCase.execute({
      studentId: STUDENT_ID,
    });
    expect(routineBeforeApproval.currentVersionNumber).toBe(1);
    expect(routineBeforeApproval.diasRestantesRenovacion).toBe(0);
    expect(routineBeforeApproval.avisoRenovacion.estado).toBe(
      EstadoAvisoRenovacion.CERRADO_HOY,
    );

    // 2. El entrenador aprueba la propuesta de adaptación (HU04 - T3, RF-092)
    const resolveProposalUseCase = new ResolveProposalUseCase(
      proposalsRepository,
      trainerAssignments,
      clock,
    );

    const resolutionResult = await resolveProposalUseCase.execute({
      trainerId: TRAINER_ID,
      proposalId: PROPOSAL_ID,
      decision: 'ACEPTADA_TOTAL',
    });

    expect(resolutionResult).toEqual({
      proposalId: PROPOSAL_ID,
      state: 'ACEPTADA_TOTAL',
      resultingVersionNumber: 2,
    });

    // 3. Verificación post-aprobación:
    // A. RF-092 / RN-88: Versión 2 generada con nuevos ajustes
    const persistCommand = vi.mocked(proposalsRepository.persistResolution).mock
      .calls[0]![0];
    expect(persistCommand.plan.reviewResult).toBe('APROBADA'); // RN-35a: revisión registrada, no pide 2da revisión
    expect(persistCommand.resolvedAt).toEqual(now);

    const v2Sets = persistCommand.newVersionDays![0]!.exercises[0]!.sets;
    expect(v2Sets[0]!.suggestedLoad).toBe(55);

    // B. RF-092: La versión 1 se conserva íntegra (snapshot original no fue mutado)
    expect(version1Snapshot.days[0]!.exercises[0]!.sets[0]!.suggestedLoad).toBe(
      50,
    );

    // C. RF-092 / RN-89: Las sesiones ejecutadas bajo la Versión 1 conservan inalterada su referencia
    expect(
      executedSessions.every((s) => s.routineVersionId === VERSION_1_ID),
    ).toBe(true);

    // D. Reinicio de la fecha del ciclo:
    // Al consultar la rutina activa, startDate ahora es `now`, los días restantes son 60 y el aviso es PENDIENTE.
    const routineAfterApproval = await getActiveRoutineUseCase.execute({
      studentId: STUDENT_ID,
    });
    expect(routineAfterApproval.currentVersionNumber).toBe(2);
    expect(routineAfterApproval.startDate).toBe(now.toISOString());
    expect(routineAfterApproval.diasRestantesRenovacion).toBe(60);
    expect(routineAfterApproval.avisoRenovacion.estado).toBe(
      EstadoAvisoRenovacion.PENDIENTE,
    );
    expect(routineAfterApproval.avisoRenovacion.diasRestantes).toBe(60);
  });
});
