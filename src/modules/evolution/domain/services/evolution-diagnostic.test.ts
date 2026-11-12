import { describe, expect, it } from 'vitest';

import {
  diagnoseExercise,
  globalSituation,
  type DiagnosticSession,
} from './evolution-diagnostic';

const end = new Date('2026-11-12T12:00:00.000Z');

function session(
  daysAgo: number,
  load: number,
  repetitions = 10,
  effort: number | null = 7,
): DiagnosticSession {
  return {
    occurredOn: new Date(end.getTime() - daysAgo * 24 * 60 * 60 * 1000),
    sets: [
      {
        warmup: false,
        completed: true,
        prescribedMaxRepetitions: 10,
        performedRepetitions: repetitions,
        performedLoad: load,
        perceivedEffort: effort,
      },
    ],
  };
}

describe('evolution diagnostic (RN-79a)', () => {
  it('does not infer a situation with fewer than four sessions', () => {
    expect(diagnoseExercise([session(30, 50)], end).situation).toBe(
      'DATOS_INSUFICIENTES',
    );
  });

  it('respects overexertion precedence over load variation', () => {
    const result = diagnoseExercise(
      [
        session(35, 50),
        session(28, 50),
        session(14, 55, 5, 9),
        session(7, 55, 5, 9),
        session(1, 55, 5, 9),
      ],
      end,
    );
    expect(result.situation).toBe('SOBREEXIGENCIA');
  });

  it('detects adequate progression at 2.5 percent or more', () => {
    expect(
      diagnoseExercise(
        [session(35, 50), session(28, 50), session(14, 52), session(1, 52)],
        end,
      ).situation,
    ).toBe('PROGRESION_ADECUADA');
  });

  it('detects insufficient stimulus when the last two sessions top the range', () => {
    expect(
      diagnoseExercise(
        [
          session(35, 50),
          session(28, 50),
          session(7, 50, 10, 4),
          session(1, 50, 10, 5),
        ],
        end,
      ).situation,
    ).toBe('ESTIMULO_INSUFICIENTE');
  });

  it('falls back to stagnation and derives the global worst situation', () => {
    const stagnation = diagnoseExercise(
      [
        session(35, 50),
        session(28, 50),
        session(7, 50, 8, 7),
        session(1, 50, 8, 7),
      ],
      end,
    );
    expect(stagnation.situation).toBe('ESTANCAMIENTO');
    expect(
      globalSituation([
        stagnation,
        {
          situation: 'PROGRESION_ADECUADA',
          metrics: {},
          criteriaNotEvaluated: [],
        },
      ]),
    ).toBe('ESTANCAMIENTO');
  });
});
