import { describe, expect, it } from 'vitest';

import {
  equipamientoDisponible,
  esPrescribible,
  patronesNoCubiertos,
} from './prescribable-catalog';

const CATALOGO = [
  { movementPattern: 'EMPUJE_HORIZONTAL', equipment: ['PESO_CORPORAL'] },
  { movementPattern: 'DOMINANTE_RODILLA', equipment: [] },
  { movementPattern: 'TRACCION_VERTICAL', equipment: ['POLEA_ALTA'] },
  { movementPattern: 'DOMINANTE_CADERA', equipment: ['BARRA', 'DISCOS'] },
];

describe('catálogo prescribible (RN-115, RN-116, RN-118)', () => {
  it('el peso corporal está siempre disponible, aun con inventario vacío', () => {
    const disponible = equipamientoDisponible([]);
    expect(esPrescribible(CATALOGO[0]!, disponible)).toBe(true);
    expect(esPrescribible(CATALOGO[1]!, disponible)).toBe(true);
    expect(esPrescribible(CATALOGO[2]!, disponible)).toBe(false);
  });

  it('un ejercicio exige todo su equipamiento', () => {
    expect(
      esPrescribible(CATALOGO[3]!, equipamientoDisponible(['BARRA'])),
    ).toBe(false);
    expect(
      esPrescribible(CATALOGO[3]!, equipamientoDisponible(['BARRA', 'DISCOS'])),
    ).toBe(true);
  });

  it('con inventario vacío informa los patrones mínimos sin cubrir', () => {
    expect(patronesNoCubiertos(CATALOGO, equipamientoDisponible([]))).toEqual([
      'TRACCION',
      'DOMINANTE_CADERA',
    ]);
  });

  it('con el inventario completo no falta ningún patrón', () => {
    expect(
      patronesNoCubiertos(
        CATALOGO,
        equipamientoDisponible(['POLEA_ALTA', 'BARRA', 'DISCOS']),
      ),
    ).toEqual([]);
  });
});
