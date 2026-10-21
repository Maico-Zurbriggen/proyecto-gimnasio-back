import { describe, expect, it } from 'vitest';

import {
  calcularAdherencia,
  SEMANAS_MINIMAS_PARA_CALCULAR,
  SEMANAS_VENTANA_ADHERENCIA,
  semanasConRutinaVigente,
  sesionesEsperadasEnVentana,
  type FrecuenciaVigente,
  type SesionDeAdherencia,
} from './adherence';

const HOY = new Date('2026-10-21T12:00:00Z');

function hace(dias: number): Date {
  return new Date(HOY.getTime() - dias * 24 * 60 * 60 * 1000);
}

function sesion(diasAtras: number, completada = true): SesionDeAdherencia {
  return { occurredOn: hace(diasAtras), completada };
}

/** Rutina vigente desde hace `diasAtras`, con la frecuencia indicada. */
function rutina(
  diasAtras: number,
  sesionesPorSemana: number,
): FrecuenciaVigente {
  return { desde: hace(diasAtras), hasta: null, sesionesPorSemana };
}

describe('adherence (HU23 - T1)', () => {
  describe('constantes del corpus', () => {
    it('la ventana es de 4 semanas (RN-67)', () => {
      expect(SEMANAS_VENTANA_ADHERENCIA).toBe(4);
    });

    it('hacen falta 2 semanas con rutina vigente (RN-68)', () => {
      expect(SEMANAS_MINIMAS_PARA_CALCULAR).toBe(2);
    });
  });

  describe('semanasConRutinaVigente (RN-68)', () => {
    it('cuenta desde la primera rutina, no desde la actual', () => {
      // Cambiar de rutina no reinicia el conteo: lo que importa es el tiempo
      // acumulado bajo cualquier rutina.
      const frecuencias: FrecuenciaVigente[] = [
        { desde: hace(60), hasta: hace(20), sesionesPorSemana: 3 },
        rutina(20, 4),
      ];
      expect(semanasConRutinaVigente(frecuencias, HOY)).toBe(8);
    });

    it('devuelve 0 sin ninguna rutina', () => {
      expect(semanasConRutinaVigente([], HOY)).toBe(0);
    });

    it('devuelve 1 con una semana cumplida', () => {
      expect(semanasConRutinaVigente([rutina(10, 3)], HOY)).toBe(1);
    });
  });

  describe('sesionesEsperadasEnVentana (RN-67)', () => {
    it('suma la misma frecuencia en las cuatro semanas', () => {
      expect(sesionesEsperadasEnVentana([rutina(60, 3)], HOY)).toBe(12);
    });

    it('usa la frecuencia vigente en cada semana, no la de hoy', () => {
      // Es la corrección de RN-67: la rutina cambió de 2 a 5 sesiones hace dos
      // semanas. Tomar 5 × 4 = 20 sería un denominador falso.
      const frecuencias: FrecuenciaVigente[] = [
        { desde: hace(60), hasta: hace(14), sesionesPorSemana: 2 },
        rutina(14, 5),
      ];
      // Dos semanas con 5 y dos con 2.
      expect(sesionesEsperadasEnVentana(frecuencias, HOY)).toBe(14);
    });

    it('cuenta 0 en las semanas sin ninguna rutina vigente', () => {
      expect(sesionesEsperadasEnVentana([rutina(14, 4)], HOY)).toBe(8);
    });
  });

  describe('calcularAdherencia', () => {
    const frecuencia = [rutina(60, 4)];

    it('calcula el porcentaje sobre la ventana', () => {
      const sesiones = [sesion(2), sesion(5), sesion(9), sesion(12)];
      const resultado = calcularAdherencia(sesiones, frecuencia, HOY);

      expect(resultado.disponible).toBe(true);
      if (resultado.disponible) {
        expect(resultado.sesionesEsperadas).toBe(16);
        expect(resultado.sesionesCompletadas).toBe(4);
        expect(resultado.porcentaje).toBe(25);
      }
    });

    it('RN-68: no se calcula antes de las dos semanas con rutina', () => {
      const resultado = calcularAdherencia([sesion(1)], [rutina(10, 4)], HOY);

      expect(resultado.disponible).toBe(false);
      if (!resultado.disponible) {
        expect(resultado.motivo).toBe('SIN_HISTORIAL_SUFICIENTE');
      }
    });

    it('RN-73: declara la ausencia en lugar de devolver cero', () => {
      // Un alumno sin rutina no tiene adherencia 0%: no tiene adherencia.
      const resultado = calcularAdherencia([], [], HOY);

      expect(resultado.disponible).toBe(false);
    });

    it('sólo cuenta las sesiones completadas (D6/§4)', () => {
      const sesiones = [sesion(2), sesion(3, false), sesion(4, false)];
      const resultado = calcularAdherencia(sesiones, frecuencia, HOY);

      if (resultado.disponible) {
        expect(resultado.sesionesCompletadas).toBe(1);
      }
    });

    it('ignora las sesiones anteriores a la ventana', () => {
      const sesiones = [sesion(2), sesion(40), sesion(50)];
      const resultado = calcularAdherencia(sesiones, frecuencia, HOY);

      if (resultado.disponible) {
        expect(resultado.sesionesCompletadas).toBe(1);
      }
    });

    it('CB-52: se acota al 100% y no premia el exceso', () => {
      const sesiones = Array.from({ length: 30 }, (_, i) => sesion(i % 25));
      const resultado = calcularAdherencia(sesiones, frecuencia, HOY);

      if (resultado.disponible) {
        expect(resultado.porcentaje).toBe(100);
      }
    });

    it('devuelve 0% cuando hubo rutina pero ninguna sesión', () => {
      // Distinto de «no disponible»: acá sí se puede calcular, y el resultado
      // es que no vino nunca.
      const resultado = calcularAdherencia([], frecuencia, HOY);

      expect(resultado.disponible).toBe(true);
      if (resultado.disponible) {
        expect(resultado.porcentaje).toBe(0);
      }
    });

    it('calcula correctamente tras un cambio de frecuencia', () => {
      const frecuencias: FrecuenciaVigente[] = [
        { desde: hace(60), hasta: hace(14), sesionesPorSemana: 2 },
        rutina(14, 5),
      ];
      const sesiones = [
        sesion(1),
        sesion(3),
        sesion(6),
        sesion(10),
        sesion(20),
      ];
      const resultado = calcularAdherencia(sesiones, frecuencias, HOY);

      if (resultado.disponible) {
        // Las cinco sesiones caen dentro de la ventana de 28 días; el
        // denominador son 14 porque la frecuencia cambió a mitad de ventana.
        expect(resultado.sesionesEsperadas).toBe(14);
        expect(resultado.sesionesCompletadas).toBe(5);
        expect(resultado.porcentaje).toBeCloseTo(35.71, 1);
      }
    });
  });
});
