import type {
  AvailabilityChange,
  CatalogActor,
  CatalogQuery,
  ExerciseInput,
  ExerciseState,
} from '../domain/catalog';
import { CatalogError, requireCatalogRole } from '../domain/catalog';
import type { ExerciseCatalogRepository } from './catalog.repository';

export class ExerciseCatalogService {
  constructor(private readonly repository: ExerciseCatalogRepository) {}

  taxonomies() {
    return this.repository.taxonomies();
  }
  list(actor: CatalogActor, query: CatalogQuery) {
    return this.repository.list(actor, query);
  }
  async find(actor: CatalogActor, id: string) {
    const item = await this.repository.find(actor, id);
    if (!item) throw new CatalogError('exercise_not_found', 404);
    return item;
  }
  create(actor: CatalogActor, input: ExerciseInput) {
    requireCatalogRole(actor, 'ENTRENADOR');
    return this.repository.create(actor, input);
  }
  update(
    actor: CatalogActor,
    id: string,
    revision: number,
    input: ExerciseInput,
  ) {
    requireCatalogRole(actor, 'ENTRENADOR');
    return this.repository.update(actor, id, revision, input);
  }
  review(
    actor: CatalogActor,
    id: string,
    revision: number,
    state: ExerciseState,
    observation: string | null,
    enable = false,
  ) {
    requireCatalogRole(actor, 'ADMINISTRADOR');
    if (state === 'PROPUESTO')
      throw new CatalogError('invalid_review_state', 422);
    if (enable && state !== 'APROBADO')
      throw new CatalogError('invalid_review_state', 422);
    if ((state === 'RECHAZADO' || state === 'DESACTIVADO') && !observation)
      throw new CatalogError('review_observation_required', 422);
    return this.repository.review(
      actor,
      id,
      revision,
      state,
      observation,
      enable,
    );
  }
  setAvailability(actor: CatalogActor, changes: AvailabilityChange[]) {
    requireCatalogRole(actor, 'ADMINISTRADOR');
    return this.repository.setAvailability(actor, changes);
  }
  inventory(actor: CatalogActor) {
    return this.repository.inventory(actor);
  }
  setInventory(
    actor: CatalogActor,
    equipment: string[],
    expectedRevision: number,
  ) {
    requireCatalogRole(actor, 'ADMINISTRADOR');
    return this.repository.setInventory(actor, equipment, expectedRevision);
  }
}
