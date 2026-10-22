import { describe, expect, it } from 'vitest';

import { InvalidAdjustmentEvidenceError } from '../errors/proposal-errors';
import {
  assertValidAdjustmentEvidence,
  assertValidCriterion,
  assertValidSupportingData,
  buildGoalChangeCriterion,
  buildGoalChangeSupportingData,
} from './adjustment-evidence';

describe('adjustment-evidence (T1 · RN-84, RF-090)', () => {
  it('acepta un criterio legible y un dato con evidencia', () => {
    const result = assertValidAdjustmentEvidence(
      'Estancamiento: variación +0,8% < +2,5% (RN-79a).',
      {
        situacion: 'ESTANCAMIENTO',
        sesionesConsideradas: 6,
      },
    );
    expect(result.criterion.toLowerCase()).toContain('estancamiento');
    expect(result.supportingData).toMatchObject({ sesionesConsideradas: 6 });
  });

  it('rechaza criterio vacío y dato sin evidencia', () => {
    expect(() => assertValidCriterion('   ')).toThrow(
      InvalidAdjustmentEvidenceError,
    );
    expect(() => assertValidSupportingData({})).toThrow(
      InvalidAdjustmentEvidenceError,
    );
    expect(() => assertValidSupportingData(null)).toThrow(
      InvalidAdjustmentEvidenceError,
    );
    expect(() => assertValidSupportingData([])).toThrow(
      InvalidAdjustmentEvidenceError,
    );
  });

  it('rechaza dato con secretos aunque el resto sea válido', () => {
    expect(() =>
      assertValidSupportingData({ sesiones: 6, password_hash: 'x' }),
    ).toThrow(InvalidAdjustmentEvidenceError);
  });

  it('construye criterio y dato de cambio de objetivo con anterior y nuevo', () => {
    const criterion = buildGoalChangeCriterion('FUERZA', 'HIPERTROFIA');
    expect(criterion).toContain('FUERZA');
    expect(criterion).toContain('HIPERTROFIA');
    expect(criterion).toContain('RN-89a');

    const data = buildGoalChangeSupportingData({
      goalId: 'g1',
      previousGoal: 'FUERZA',
      newGoal: 'HIPERTROFIA',
      routineTypeBefore: 'FUERZA',
      exerciseCount: 9,
      scheme: {
        minSets: 3,
        maxSets: 4,
        minRepetitions: 6,
        maxRepetitions: 12,
        restSeconds: 60,
      },
    });
    expect(data).toMatchObject({
      motivo: 'CAMBIO_OBJETIVO',
      objetivoAnterior: 'FUERZA',
      objetivoNuevo: 'HIPERTROFIA',
      ejerciciosAfectados: 9,
    });
  });
});
