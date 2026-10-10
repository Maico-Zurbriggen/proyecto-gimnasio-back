import type {
  CatalogExerciseRef,
  MinimizedContext,
} from '../dto/routine-generation-context.dto';

export interface StudentGenerationContext {
  gymId: string;
  generationSettings?: import('../../../gyms/domain/generation-settings').GenerationSettingsSnapshot;
  minimizedContext: MinimizedContext;
}

export interface GenerationContextRepository {
  getStudentContext(
    studentId: string,
    asOf: Date,
  ): Promise<StudentGenerationContext | null>;
  getEnabledCatalog(gymId: string): Promise<CatalogExerciseRef[]>;
}
