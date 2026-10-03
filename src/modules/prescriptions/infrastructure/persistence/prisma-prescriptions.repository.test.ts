import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaPrescriptionsRepository } from './prisma-prescriptions.repository';

const studentId = '21000000-0000-4000-8000-000000000004';
const routineId = '48d43d8c-5064-4087-be95-08d1767a05bf';
function setup(preferences: unknown, generated = true) {
  const findFirst = vi.fn().mockResolvedValue({
    id: routineId,
    studentId,
    routineType: 'HIPERTROFIA',
    state: 'PROPUESTA',
    origin: 'GENERADA',
    targetWeeklyFrequency: 3,
    requestedAt: new Date('2026-09-30T22:00:00Z'),
    versions: [{ id: 'version', versionNumber: 1, days: [] }],
    sourceGenerationResult: generated
      ? { attempt: { request: { preferences } } }
      : null,
  });
  return {
    findFirst,
    repository: new PrismaPrescriptionsRepository({
      routine: { findFirst },
    } as unknown as PrismaClient),
  };
}
describe('routine content generation prompt', () => {
  it('reads the stored user prompt from its source request and filters by owner', async () => {
    const prompt =
      'Genera rutina con 3 ejercicios de triceps por dia\nSin inventar cargas.';
    const { repository, findFirst } = setup({ free_text: prompt });
    expect(
      (await repository.findContent(studentId, routineId))?.generationPrompt,
    ).toBe(prompt);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: routineId, studentId } }),
    );
  });
  it('returns null for routines without a generation source', async () => {
    expect(
      (await setup(null, false).repository.findContent(studentId, routineId))
        ?.generationPrompt,
    ).toBeNull();
  });
  it.each([null, [], { free_text: 3 }, { parameters: {} }])(
    'ignores malformed or absent prompt: %j',
    async (preferences) => {
      expect(
        (await setup(preferences).repository.findContent(studentId, routineId))
          ?.generationPrompt,
      ).toBeNull();
    },
  );
});
