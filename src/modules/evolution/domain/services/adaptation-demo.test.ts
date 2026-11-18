import { describe, expect, it } from 'vitest';
import {
  RULES,
  type TrainingPurpose,
} from '../../../routine-generations/domain/services/generated-routine-validator';
import {
  ADAPTATION_DEMO_SCENARIOS,
  buildAdaptationDemoPlan,
} from './adaptation-demo';
import { diagnosticarEjercicio } from './evolution-diagnosis';
import { elaborateAdjustments } from './adjustment-table';

const end = new Date('2026-11-15T00:00:00Z');

describe.each(Object.keys(RULES) as TrainingPurpose[])(
  'adaptation demo: %s',
  (purpose) => {
    it.each(ADAPTATION_DEMO_SCENARIOS)(
      '%s keeps its diagnosis with varied exercises, sessions and routine days',
      (scenario) => {
        for (const exerciseIndex of [0, 1, 2, 3, 4, 7, 11, 23, 59]) {
          for (const dayIndex of [0, 1, 3, 6]) {
            const plan = buildAdaptationDemoPlan(scenario, purpose, end, {
              exerciseIndex,
              dayIndex,
            });
            const sessions = plan.sessions.filter(
              (session) =>
                session.occurredOn >= new Date(end.getTime() - 42 * 86_400_000),
            );
            expect(diagnosticarEjercicio(sessions, end).situacion).toBe(
              scenario.startsWith('ESTANCAMIENTO') ? 'ESTANCAMIENTO' : scenario,
            );
            if (plan.previousDiagnosisAt) {
              expect(
                diagnosticarEjercicio(
                  plan.sessions.filter(
                    (session) =>
                      session.occurredOn <= plan.previousDiagnosisAt!,
                  ),
                  plan.previousDiagnosisAt,
                ).situacion,
              ).toBe('ESTANCAMIENTO');
            }
            for (const session of sessions) {
              for (const set of session.series) {
                expect(Number.isInteger(set.performedRepetitions)).toBe(true);
                expect(set.perceivedEffort).toBeGreaterThanOrEqual(1);
                expect(set.perceivedEffort).toBeLessThanOrEqual(10);
                expect(set.performedLoad).toBeGreaterThan(0);
              }
            }
          }
        }
      },
    );

    it('varies stagnation metrics within and between exercises and repeats deterministically', () => {
      const plans = [0, 1, 2].map((exerciseIndex) =>
        buildAdaptationDemoPlan('ESTANCAMIENTO_PRIMERO', purpose, end, {
          exerciseIndex,
        }),
      );
      const metrics = plans.map(
        (plan) => diagnosticarEjercicio(plan.sessions, end).metricas,
      );
      for (const metric of metrics) {
        expect(new Set(metric.esfuerzoMedioPorSesion).size).toBeGreaterThan(1);
        expect(
          new Set(metric.cumplimientoRepeticionesPorSesion).size,
        ).toBeGreaterThan(1);
        expect(metric.variacionCargaMaxima).not.toBe(0);
      }
      expect(
        new Set(metrics.map((metric) => metric.variacionCargaMaxima)).size,
      ).toBe(3);
      expect(metrics[0]!.cumplimientoRepeticionesPorSesion).not.toEqual(
        metrics[1]!.cumplimientoRepeticionesPorSesion,
      );
      expect(
        buildAdaptationDemoPlan('ESTANCAMIENTO_PRIMERO', purpose, end, {
          exerciseIndex: 1,
        }),
      ).toEqual(plans[1]);
    });

    it.each(ADAPTATION_DEMO_SCENARIOS)(
      '%s is diagnosed by the actual rules',
      (scenario) => {
        const plan = buildAdaptationDemoPlan(scenario, purpose, end);
        const sessions = plan.sessions.filter(
          (session) =>
            session.occurredOn >= new Date(end.getTime() - 42 * 86_400_000),
        );
        const diagnosis = diagnosticarEjercicio(sessions, end);
        expect(diagnosis.situacion).toBe(
          scenario.startsWith('ESTANCAMIENTO') ? 'ESTANCAMIENTO' : scenario,
        );
        const rules = RULES[purpose];
        expect(plan.sets.length).toBeGreaterThanOrEqual(rules.workSets[0]);
        expect(plan.sets.length).toBeLessThanOrEqual(rules.workSets[1]);
        for (const set of plan.sets) {
          expect(set.minRepetitions).toBeGreaterThanOrEqual(
            rules.repetitions[0],
          );
          expect(set.maxRepetitions).toBeLessThanOrEqual(rules.repetitions[1]);
          expect(set.maxRepetitions).toBeGreaterThanOrEqual(set.minRepetitions);
        }
        if (plan.previousDiagnosisAt) {
          const previous = plan.sessions.filter(
            (session) => session.occurredOn <= plan.previousDiagnosisAt!,
          );
          expect(
            diagnosticarEjercicio(previous, plan.previousDiagnosisAt).situacion,
          ).toBe('ESTANCAMIENTO');
        }
        const result = elaborateAdjustments({
          diagnosticId: 'diagnostic',
          globalSituation: diagnosis.situacion,
          adherence: 80,
          routine: {
            routineType: purpose,
            targetWeeklyFrequency: rules.frequency[0],
            exercisesPerDay: [1],
          },
          exercises: [
            {
              routineExerciseId: 'source',
              exerciseId: 'exercise',
              exerciseName: 'Existing exercise',
              situation: diagnosis.situacion,
              compatibilityState: 'COMPATIBLE',
              sets: plan.sets,
              consecutiveStagnations:
                scenario === 'ESTANCAMIENTO_SEGUNDO'
                  ? 2
                  : scenario === 'ESTANCAMIENTO_PRIMERO'
                    ? 1
                    : 0,
              metrics: diagnosis.metricas,
              alternativeExerciseId: 'alternative',
              alternativeExerciseName: 'Existing alternative',
            },
          ],
          global: { lowAdherenceWeeks: 0, imbalances: [], goalChange: null },
        });
        if (
          scenario === 'PROGRESION_ADECUADA' ||
          scenario === 'DATOS_INSUFICIENTES'
        )
          expect(result.adjustments).toHaveLength(0);
        else expect(result.adjustments.length).toBeGreaterThan(0);
        if (scenario === 'ESTIMULO_INSUFICIENTE')
          expect(result.adjustments[0]?.proposedValue).toEqual({
            carga_sugerida: 62.5,
          });
        if (scenario === 'ESTANCAMIENTO_SEGUNDO')
          expect(result.adjustments[0]?.type).toBe('SUSTITUCION');
      },
    );
  },
);
