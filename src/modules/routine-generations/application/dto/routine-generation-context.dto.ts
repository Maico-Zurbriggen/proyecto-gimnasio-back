export interface MinimizedContext {
  nivelExperiencia: string;
  diasSemanalesDisponibles: number;
  objetivosActivos: string[];
  condiciones: string[];
}

export interface CatalogExerciseRef {
  id: string;
  nombre: string;
  patronMovimiento: string;
}

export interface RoutineGenerationParameters {
  objetivo: string;
  frecuenciaSemanal: number;
  duracionMinutos: number;
  restricciones: string[];
  confianza: number;
}
