import {
  validateGenerationSettings,
  type GenerationSettings,
  type GenerationSettingsSnapshot,
} from '../domain/generation-settings';

export interface GenerationSettingsRepository {
  get(gymId: string): Promise<GenerationSettingsSnapshot>;
  save(
    gymId: string,
    actorId: string,
    settings: GenerationSettings | null,
    expectedRevision: number,
  ): Promise<GenerationSettingsSnapshot>;
}

export class GenerationSettingsService {
  constructor(private readonly repository: GenerationSettingsRepository) {}
  get(gymId: string) {
    return this.repository.get(gymId);
  }
  save(
    gymId: string,
    actorId: string,
    settings: GenerationSettings | null,
    revision: number,
  ) {
    if (settings) validateGenerationSettings(settings);
    return this.repository.save(gymId, actorId, settings, revision);
  }
}
