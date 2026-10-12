import type { AuthUser } from '../../../shared/types/auth';
import {
  EQUIPAMIENTO_SIEMPRE_PRESENTE,
  equipamientoDisponible,
  esPrescribible,
  patronesNoCubiertos,
  type EjercicioDelCatalogo,
} from '../domain/prescribable-catalog';

/**
 * Inventario del gimnasio (FL-20, RF-114) y primeros pasos del administrador
 * en un gimnasio recién aprovisionado (CB-59).
 */

export interface EquipmentRecord {
  code: string;
  name: string;
  present: boolean;
}

export interface InventoryRepository {
  /** Enumeración cerrada con lo que el gimnasio declaró presente. */
  listEquipment(gymId: string): Promise<EquipmentRecord[]>;
  /** Catálogo accesible: base más ejercicios propios del gimnasio. */
  listCatalog(gymId: string): Promise<EjercicioDelCatalogo[]>;
  /**
   * Guarda el inventario, marca INCOMPATIBLE en rutinas vigentes lo que dejó
   * de estar disponible y vuelve a COMPATIBLE lo que se recuperó (RN-117), con
   * auditoría, en una transacción. Devuelve cuántos ejercicios cambiaron.
   */
  save(input: {
    gymId: string;
    actorUserId: string;
    present: string[];
  }): Promise<{ markedIncompatible: number; restored: number }>;
  countActiveTrainers(gymId: string): Promise<number>;
  hasDeclaredInventory(gymId: string): Promise<boolean>;
}

export class UnknownEquipmentError extends Error {
  constructor(readonly codes: string[]) {
    super(`Equipamiento desconocido: ${codes.join(', ')}`);
    this.name = 'UnknownEquipmentError';
  }
}

export class InventoryUseCases {
  constructor(private readonly repository: InventoryRepository) {}

  private async cobertura(gymId: string, presentes: string[]) {
    const disponible = equipamientoDisponible(presentes);
    const catalogo = await this.repository.listCatalog(gymId);
    return {
      prescribableExercises: catalogo.filter((ejercicio) =>
        esPrescribible(ejercicio, disponible),
      ).length,
      totalExercises: catalogo.length,
      missingPatterns: patronesNoCubiertos(catalogo, disponible),
      /** FL-20/E2: sin nada declarado sólo queda el peso corporal. */
      onlyBodyweight: presentes.length === 0,
    };
  }

  async read(actor: AuthUser) {
    const equipment = await this.repository.listEquipment(actor.gymId);
    const presentes = equipment
      .filter(
        (item) => item.present && item.code !== EQUIPAMIENTO_SIEMPRE_PRESENTE,
      )
      .map((item) => item.code);
    return {
      equipment: equipment.map((item) => ({
        ...item,
        // RN-115: siempre presente, no se puede retirar.
        present: item.code === EQUIPAMIENTO_SIEMPRE_PRESENTE || item.present,
        alwaysPresent: item.code === EQUIPAMIENTO_SIEMPRE_PRESENTE,
      })),
      ...(await this.cobertura(actor.gymId, presentes)),
    };
  }

  async save(actor: AuthUser, present: string[]) {
    const equipment = await this.repository.listEquipment(actor.gymId);
    const conocidos = new Set(equipment.map((item) => item.code));
    const desconocidos = present.filter((code) => !conocidos.has(code));
    if (desconocidos.length > 0) throw new UnknownEquipmentError(desconocidos);

    const declarados = [...new Set(present)].filter(
      (code) => code !== EQUIPAMIENTO_SIEMPRE_PRESENTE,
    );
    const cambios = await this.repository.save({
      gymId: actor.gymId,
      actorUserId: actor.id,
      present: declarados,
    });
    return { ...(await this.read(actor)), ...cambios };
  }

  /** CB-59: lo que falta para que alguien pueda entrenar en el gimnasio. */
  async setup(actor: AuthUser) {
    const [trainers, inventory] = await Promise.all([
      this.repository.countActiveTrainers(actor.gymId),
      this.repository.hasDeclaredInventory(actor.gymId),
    ]);
    return {
      hasTrainer: trainers > 0,
      hasInventory: inventory,
      ready: trainers > 0 && inventory,
    };
  }
}
