import { describe, expect, it } from 'vitest';

import {
  dueMeasurementCycles,
  initialMeasurementBaseline,
  localDateAt,
  updateConsecutiveMisses,
} from './measurement-cycle';

describe('measurement cycles', () => {
  it('closes every 60 days and catches up missed runs', () => {
    const cycles = dueMeasurementCycles(
      new Date('2026-01-01T00:00:00Z'),
      null,
      new Date('2026-07-01T00:00:00Z'),
    );

    expect(cycles).toEqual([
      {
        cycleStartsOn: new Date('2026-01-01T00:00:00Z'),
        dueOn: new Date('2026-03-02T00:00:00Z'),
      },
      {
        cycleStartsOn: new Date('2026-03-02T00:00:00Z'),
        dueOn: new Date('2026-05-01T00:00:00Z'),
      },
      {
        cycleStartsOn: new Date('2026-05-01T00:00:00Z'),
        dueOn: new Date('2026-06-30T00:00:00Z'),
      },
    ]);
  });

  it('uses the gym local date', () => {
    expect(
      localDateAt(
        new Date('2026-09-29T01:30:00Z'),
        'America/Argentina/Buenos_Aires',
      ),
    ).toEqual(new Date('2026-09-28T00:00:00Z'));
  });

  it('does not infer missing checkpoints before tracking existed', () => {
    expect(
      initialMeasurementBaseline(new Date('2025-01-01T00:00:00Z')),
    ).toEqual(new Date('2026-09-28T00:00:00Z'));
    expect(
      initialMeasurementBaseline(new Date('2026-10-10T00:00:00Z')),
    ).toEqual(new Date('2026-10-10T00:00:00Z'));
  });

  it('a fulfilled checkpoint resets the consecutive streak', () => {
    expect(updateConsecutiveMisses(2, 'CUMPLIDO')).toBe(0);
    expect(updateConsecutiveMisses(2, 'FALTA')).toBe(3);
  });
});
