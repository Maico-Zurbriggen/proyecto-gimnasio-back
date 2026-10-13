/**
 * Catálogo prescribible e inventario del gimnasio (RN-115, RN-116, RN-118).
 * Funciones puras.
 */

/** RN-115: el peso corporal se considera siempre presente. */
export const EQUIPAMIENTO_SIEMPRE_PRESENTE = 'PESO_CORPORAL';

/**
 * Cobertura mínima de patrones (D5/§5): empuje horizontal, una tracción
 * (horizontal o vertical), dominante de rodilla y dominante de cadera.
 * Cada grupo se cubre con cualquiera de sus patrones.
 */
export const GRUPOS_DE_PATRONES_MINIMOS: readonly {
  nombre: string;
  patrones: readonly string[];
}[] = [
  { nombre: 'EMPUJE_HORIZONTAL', patrones: ['EMPUJE_HORIZONTAL'] },
  {
    nombre: 'TRACCION',
    patrones: ['TRACCION_HORIZONTAL', 'TRACCION_VERTICAL'],
  },
  { nombre: 'DOMINANTE_RODILLA', patrones: ['DOMINANTE_RODILLA'] },
  { nombre: 'DOMINANTE_CADERA', patrones: ['DOMINANTE_CADERA'] },
];

export interface EjercicioDelCatalogo {
  movementPattern: string;
  equipment: readonly string[];
}

/** Equipamiento efectivamente disponible: lo declarado más el peso corporal. */
export function equipamientoDisponible(
  declarado: Iterable<string>,
): Set<string> {
  return new Set([...declarado, EQUIPAMIENTO_SIEMPRE_PRESENTE]);
}

/** RN-116: un ejercicio es prescribible si todo su equipamiento está presente. */
export function esPrescribible(
  ejercicio: EjercicioDelCatalogo,
  disponible: ReadonlySet<string>,
): boolean {
  return ejercicio.equipment.every((codigo) => disponible.has(codigo));
}

/**
 * RN-118: grupos de patrones mínimos que el catálogo prescribible no cubre. Si
 * la lista no está vacía, ninguna rutina completa se puede construir y hay que
 * advertirlo al administrador.
 */
export function patronesNoCubiertos(
  catalogo: readonly EjercicioDelCatalogo[],
  disponible: ReadonlySet<string>,
): string[] {
  const cubiertos = new Set(
    catalogo
      .filter((ejercicio) => esPrescribible(ejercicio, disponible))
      .map((ejercicio) => ejercicio.movementPattern),
  );
  return GRUPOS_DE_PATRONES_MINIMOS.filter(
    (grupo) => !grupo.patrones.some((patron) => cubiertos.has(patron)),
  ).map((grupo) => grupo.nombre);
}
