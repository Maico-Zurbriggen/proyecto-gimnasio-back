export const noticeEventKeys = {
  goalChangeProposal: (proposalId: string) =>
    `goal-change-proposal:${proposalId}`,
  physicalConditionProposal: (proposalId: string) =>
    `physical-condition-proposal:${proposalId}`,
  routineReview: (
    routineId: string,
    versionId: string,
    decision: 'approved' | 'rejected',
  ) => `routine-review:${routineId}:${versionId}:${decision}`,
  routineAdjusted: (routineId: string, versionNumber: number) =>
    `routine-adjusted:${routineId}:version:${versionNumber}`,
  proposalRegenerationFailed: (regenerationId: string) =>
    `proposal-regeneration-failed:${regenerationId}`,
  renewalProposal: (proposalId: string) => `renewal-proposal:${proposalId}`,
  renewalGenerationFailed: (cycleId: string) =>
    `renewal-generation-failed:${cycleId}`,
} as const;
