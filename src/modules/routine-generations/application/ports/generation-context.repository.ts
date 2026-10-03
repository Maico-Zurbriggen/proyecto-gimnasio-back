import type {
  CatalogExerciseRef,
  MinimizedContext,
} from '../dto/routine-generation-context.dto';

export interface StudentGenerationContext {
  gymId: string;
  minimizedContext: MinimizedContext;
}

export interface GenerationContextRepository {
  getStudentContext(
    studentId: string,
    asOf: Date,
  ): Promise<StudentGenerationContext | null>;
  getPrefilteredCatalog(
    studentId: string,
    gymId: string,
    asOf: Date,
  ): Promise<CatalogExerciseRef[]>;
}
