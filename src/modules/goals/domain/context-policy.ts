export function goalContext(input: {
  objective: string | null;
  experienceLevel: string | null;
  availableDaysPerWeek: number;
}) {
  const missing = [
    input.objective === null ? 'objetivo' : null,
    !input.experienceLevel ? 'nivelExperiencia' : null,
    !Number.isInteger(input.availableDaysPerWeek) ||
    input.availableDaysPerWeek < 1
      ? 'diasSemanalesDisponibles'
      : null,
  ].filter((value): value is string => value !== null);
  return { sufficient: missing.length === 0, missing };
}
