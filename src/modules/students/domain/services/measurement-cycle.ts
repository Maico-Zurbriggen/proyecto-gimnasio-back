const DAY_MS = 86_400_000;

/** Inicio del seguimiento persistido; evita inferir faltas sobre datos históricos incompletos. */
export const MEASUREMENT_TRACKING_ROLLOUT_DATE = new Date(
  '2026-09-28T00:00:00.000Z',
);

export function initialMeasurementBaseline(firstRoutineOn: Date): Date {
  return firstRoutineOn > MEASUREMENT_TRACKING_ROLLOUT_DATE
    ? firstRoutineOn
    : MEASUREMENT_TRACKING_ROLLOUT_DATE;
}

export function localDateAt(instant: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((candidate) => candidate.type === type)?.value);

  return new Date(Date.UTC(part('year'), part('month') - 1, part('day')));
}

export function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function dueMeasurementCycles(
  baseline: Date,
  lastDueOn: Date | null,
  today: Date,
): Array<{ cycleStartsOn: Date; dueOn: Date }> {
  const cycles: Array<{ cycleStartsOn: Date; dueOn: Date }> = [];
  let cycleStartsOn = lastDueOn ?? baseline;

  while (true) {
    const dueOn = addUtcDays(cycleStartsOn, 60);
    if (dueOn > today) {
      return cycles;
    }
    cycles.push({ cycleStartsOn, dueOn });
    cycleStartsOn = dueOn;
  }
}

export function updateConsecutiveMisses(
  current: number,
  result: 'CUMPLIDO' | 'FALTA',
): number {
  return result === 'CUMPLIDO' ? 0 : current + 1;
}
