import { describe, expect, it } from 'vitest';

import {
  conditionProposalState,
  conditionSubstitutionValue,
} from './condition-proposal';

describe('condition proposal policy', () => {
  it('keeps the proposal pending for the assigned trainer even without an automatic replacement', () => {
    expect(conditionProposalState(true)).toBe('PENDIENTE');
    expect(conditionSubstitutionValue(null)).toEqual({
      requires_manual_intervention: true,
    });
  });

  it('blocks the proposal only when no active trainer is assigned', () => {
    expect(conditionProposalState(false)).toBe('BLOQUEADA');
  });
});
