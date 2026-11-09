import { describe, expect, it, vi, type Mock } from 'vitest';

import { ElaborateWeeklyAdjustmentProposalsUseCase } from './elaborate-weekly-adjustment-proposals.use-case';

const NOW = new Date('2026-11-09T04:00:00Z');

function setup(ids: string[], execute: Mock) {
  const list = vi.fn().mockResolvedValue(ids);
  const useCase = new ElaborateWeeklyAdjustmentProposalsUseCase(
    { listDiagnosticIdsWithoutProposal: list } as never,
    { execute: execute as never },
    { now: () => NOW },
  );
  return { useCase, list };
}

describe('ElaborateWeeklyAdjustmentProposalsUseCase', () => {
  it('looks back 8 days and counts proposals, empty elaborations and failures', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ proposalId: 'p-1', alreadyExisted: false })
      .mockResolvedValueOnce({ proposalId: null, alreadyExisted: false })
      .mockRejectedValueOnce(new Error('boom'));
    const { useCase, list } = setup(['d-1', 'd-2', 'd-3'], execute);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await useCase.execute();

    expect(list).toHaveBeenCalledWith(new Date('2026-11-01T04:00:00Z'));
    expect(result).toEqual({
      scanned: 3,
      proposed: 1,
      withoutAdjustments: 1,
      failed: 1,
    });
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it('does nothing when there are no pending diagnostics', async () => {
    const execute = vi.fn();
    const { useCase } = setup([], execute);
    expect(await useCase.execute()).toEqual({
      scanned: 0,
      proposed: 0,
      withoutAdjustments: 0,
      failed: 0,
    });
    expect(execute).not.toHaveBeenCalled();
  });
});
