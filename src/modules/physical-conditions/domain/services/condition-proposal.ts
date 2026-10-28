export function conditionProposalState(hasActiveTrainer: boolean) {
  return hasActiveTrainer ? ('PENDIENTE' as const) : ('BLOQUEADA' as const);
}

export function conditionSubstitutionValue(
  replacement: { id: string; name: string } | null,
) {
  return replacement
    ? { exercise_id: replacement.id, exercise_name: replacement.name }
    : { requires_manual_intervention: true as const };
}
