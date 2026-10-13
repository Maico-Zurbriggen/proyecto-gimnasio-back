import { Prisma, type PrismaClient } from '@prisma/client';
import type { GenerationSettingsRepository } from '../../application/generation-settings.service';
import {
  GenerationSettingsError,
  type GenerationSettings,
} from '../../domain/generation-settings';
import { lockGymCatalog } from '../../../exercise-catalog/infrastructure/persistence/prisma-catalog.repository';

export class PrismaGenerationSettingsRepository implements GenerationSettingsRepository {
  constructor(private readonly prisma: PrismaClient) {}
  async get(gymId: string) {
    const gym = await this.prisma.gym.findUniqueOrThrow({
      where: { id: gymId },
    });
    return {
      settings: gym.generationSettings as unknown as GenerationSettings | null,
      revision: gym.generationSettingsRevision,
    };
  }
  async save(
    gymId: string,
    actorId: string,
    settings: GenerationSettings | null,
    expectedRevision: number,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await lockGymCatalog(tx, gymId);
      const gym = await tx.gym.findUniqueOrThrow({ where: { id: gymId } });
      if (gym.generationSettingsRevision !== expectedRevision)
        throw new GenerationSettingsError('generation_settings_conflict', 409);
      const revision = expectedRevision + 1;
      await tx.gym.update({
        where: { id: gymId },
        data: {
          generationSettings: settings ? { ...settings } : Prisma.DbNull,
          generationSettingsRevision: revision,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actorId,
          operation: 'UPDATE_GENERATION_SETTINGS',
          entityType: 'GYM',
          entityId: gymId,
          previousValue: {
            settings: gym.generationSettings,
            revision: expectedRevision,
          },
          newValue: { settings: settings ? { ...settings } : null, revision },
        },
      });
      return { settings, revision };
    });
  }
}
