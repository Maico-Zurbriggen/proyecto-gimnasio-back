import { describe, expect, it } from 'vitest';

import { InvalidResolutionError } from '../errors/proposal-errors';
import { planResolution } from './proposal-resolution';

const adjustmentIds = ['a1', 'a2', 'a3'];

describe('planResolution (HU04 - T3, RN-86/RN-90)', () => {
  it('total acceptance accepts every adjustment and approves the review', () => {
    expect(
      planResolution({ decision: 'ACEPTADA_TOTAL', adjustmentIds }),
    ).toEqual({
      state: 'ACEPTADA_TOTAL',
      acceptedIds: adjustmentIds,
      rejectedIds: [],
      reviewResult: 'APROBADA',
      reason: null,
    });
  });

  it('partial acceptance splits accepted and rejected adjustments', () => {
    const plan = planResolution({
      decision: 'ACEPTADA_PARCIAL',
      adjustmentIds,
      acceptedAdjustmentIds: ['a2'],
      reason: '  sólo la carga  ',
    });

    expect(plan).toEqual({
      state: 'ACEPTADA_PARCIAL',
      acceptedIds: ['a2'],
      rejectedIds: ['a1', 'a3'],
      reviewResult: 'APROBADA_CON_CAMBIOS',
      reason: 'sólo la carga',
    });
  });

  it.each([[[]], [adjustmentIds]])(
    'partial acceptance requires a proper, non-empty subset (%j)',
    (accepted) => {
      expect(() =>
        planResolution({
          decision: 'ACEPTADA_PARCIAL',
          adjustmentIds,
          acceptedAdjustmentIds: accepted,
        }),
      ).toThrow(new InvalidResolutionError('partial_requires_subset'));
    },
  );

  it('partial acceptance rejects adjustments that are not in the proposal', () => {
    expect(() =>
      planResolution({
        decision: 'ACEPTADA_PARCIAL',
        adjustmentIds,
        acceptedAdjustmentIds: ['otro'],
      }),
    ).toThrow(new InvalidResolutionError('unknown_adjustment'));
  });

  it('Esc. 4: rejection requires a reason and generates no accepted adjustment', () => {
    expect(() =>
      planResolution({ decision: 'RECHAZADA', adjustmentIds, reason: '   ' }),
    ).toThrow(new InvalidResolutionError('rejection_reason_required'));

    expect(
      planResolution({
        decision: 'RECHAZADA',
        adjustmentIds,
        reason: 'El alumno está lesionado',
      }),
    ).toMatchObject({
      state: 'RECHAZADA',
      acceptedIds: [],
      rejectedIds: adjustmentIds,
      reviewResult: null,
    });
  });
});
