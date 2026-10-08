import type {
  AvailabilityChange,
  CatalogActor,
  CatalogExercise,
  CatalogQuery,
  ExerciseInput,
  ExerciseState,
} from '../domain/catalog';

export interface TaxonomyItem {
  code: string;
  name: string;
}
export interface CatalogTaxonomies {
  equipment: TaxonomyItem[];
  muscles: TaxonomyItem[];
  joints: TaxonomyItem[];
}
export interface ExerciseCatalogRepository {
  taxonomies(): Promise<CatalogTaxonomies>;
  list(
    actor: CatalogActor,
    query: CatalogQuery,
  ): Promise<{
    items: CatalogExercise[];
    total: number;
    page: number;
    pageSize: number;
  }>;
  find(actor: CatalogActor, id: string): Promise<CatalogExercise | null>;
  create(actor: CatalogActor, input: ExerciseInput): Promise<CatalogExercise>;
  update(
    actor: CatalogActor,
    id: string,
    revision: number,
    input: ExerciseInput,
  ): Promise<CatalogExercise>;
  review(
    actor: CatalogActor,
    id: string,
    revision: number,
    state: ExerciseState,
    observation: string | null,
    enable?: boolean,
  ): Promise<CatalogExercise>;
  setAvailability(
    actor: CatalogActor,
    changes: AvailabilityChange[],
  ): Promise<{ changed: number }>;
  inventory(actor: CatalogActor): Promise<{
    equipment: string[];
    updatedAt: string | null;
    revision: number;
  }>;
  setInventory(
    actor: CatalogActor,
    equipment: string[],
    expectedRevision: number,
  ): Promise<{
    relatedExerciseIds: string[];
    relatedExercises: { id: string; name: string }[];
  }>;
}
