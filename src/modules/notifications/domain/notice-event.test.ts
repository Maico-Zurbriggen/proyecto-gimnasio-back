import { describe, expect, it } from 'vitest';

import { noticeEventKeys } from './notice-event';

describe('notice event keys', () => {
  it('is stable for retries of the same fact', () => {
    expect(noticeEventKeys.renewalProposal('proposal-1')).toBe(
      noticeEventKeys.renewalProposal('proposal-1'),
    );
  });

  it('distinguishes later legitimate events on the same routine', () => {
    expect(noticeEventKeys.routineAdjusted('routine-1', 2)).not.toBe(
      noticeEventKeys.routineAdjusted('routine-1', 3),
    );
    expect(
      noticeEventKeys.routineReview('routine-1', 'version-1', 'approved'),
    ).not.toBe(
      noticeEventKeys.routineReview('routine-1', 'version-2', 'approved'),
    );
  });
});
