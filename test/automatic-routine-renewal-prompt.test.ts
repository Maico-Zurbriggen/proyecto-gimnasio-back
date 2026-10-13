import { describe, expect, it } from 'vitest';
import { renewalEvidence } from '../src/modules/evolution/application/use-cases/renew-routine-cycles.use-case';

describe('automatic routine renewal context', () => {
  it('separates frozen evidence and missing information from system instructions', () => {
    const evidence = renewalEvidence({
      cycleStartsOn: new Date('2026-08-09T12:00:00.000Z'),
      dueOn: new Date('2026-10-08T12:00:00.000Z'),
      evaluation: {
        criterio: 'Renovación automática por ciclo cumplido.',
        sinDatosActualizados: true,
        mediciones: [],
        estructuraVigente: {
          routineType: 'HIPERTROFIA',
          targetWeeklyFrequency: 3,
          days: [
            {
              position: 1,
              name: 'Día A',
              dominantPattern: 'EMPUJE_HORIZONTAL',
              exercises: [
                {
                  position: 1,
                  exerciseId: 'exercise-1',
                  note: null,
                  sets: [
                    {
                      position: 1,
                      minRepetitions: 8,
                      maxRepetitions: 12,
                      suggestedLoad: 12.5,
                      restSeconds: 90,
                      warmup: false,
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    } as unknown as Parameters<typeof renewalEvidence>[0]);

    expect(evidence).toEqual({
      starts_on: '2026-08-09',
      due_on: '2026-10-08',
      criterion: 'Renovación automática por ciclo cumplido.',
      without_updated_measurements: true,
      missing_information: 'Medición corporal posterior al inicio del ciclo',
      measurements: [],
    });
  });
});
