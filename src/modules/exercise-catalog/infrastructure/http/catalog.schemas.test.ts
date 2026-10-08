import { describe, expect, it } from 'vitest';
import { exerciseInputSchema } from './catalog.schemas';
const input = {
  name: 'Synthetic exercise',
  instructions: 'Synthetic original instructions',
  movementPattern: 'CORE',
  difficultyLevel: 'PRINCIPIANTE',
  unilateral: false,
  equipment: ['PESO_CORPORAL'],
  primaryMuscles: ['GLUTEO'],
  secondaryMuscles: [],
  joints: ['CADERA'],
};
const revision = 'a'.repeat(64);
describe('Catalogue media input boundary', () => {
  it('preserves an existing internal image reference for an own exercise edit', () => {
    expect(
      exerciseInputSchema.safeParse({
        ...input,
        media: [
          { pose: 'PRINCIPAL', url: `/catalog/media/${revision}/image.webp` },
        ],
      }).success,
    ).toBe(true);
    expect(
      exerciseInputSchema.safeParse({
        ...input,
        media: [{ pose: 'PRINCIPAL', url: 'https://example.test/image.webp' }],
      }).success,
    ).toBe(true);
  });
  it('rejects arbitrary relative files, traversal, credentials and insecure resources', () => {
    for (const url of [
      '/private/image.webp',
      `/catalog/media/${revision}/../image.webp`,
      `/catalog/media/${revision}/image.gif`,
      'http://example.test/image.webp',
      'https://user:password@example.test/image.webp',
    ])
      expect(
        exerciseInputSchema.safeParse({
          ...input,
          media: [{ pose: 'PRINCIPAL', url }],
        }).success,
      ).toBe(false);
  });
});
