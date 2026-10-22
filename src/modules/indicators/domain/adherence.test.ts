import { describe, expect, it } from 'vitest';

import {
  calcularAdherencia,
  fechaLocal,
  finDeUltimaSemanaCompleta,
  inicioDeSemana,
  SEMANAS_MINIMAS_PARA_CALCULAR,
  SEMANAS_VENTANA_ADHERENCIA,
  semanasConRutinaVigente,
  sesionesEsperadasEnVentana,
  type FrecuenciaVigente,
  type SesionDeAdherencia,
} from './adherence';

// Miércoles. La ventana de RN-110 termina el lunes 2026-10-19 (inicio de la
// semana en curso, que no está completa) y cubre las cuatro semanas previas:
// del lunes 2026-09-21 al domingo 2026-10-18. Son los días 3 a 30 hacia atrás.
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
      const sesiones = [sesion(4), sesion(5), sesion(9), sesion(12)];
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
      const sesiones = [sesion(5), sesion(6, false), sesion(7, false)];
      const resultado = calcularAdherencia(sesiones, frecuencia, HOY);

      if (resultado.disponible) {
        expect(resultado.sesionesCompletadas).toBe(1);
      }
    });

    it('ignora las sesiones anteriores a la ventana', () => {
      const sesiones = [sesion(5), sesion(40), sesion(50)];
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

    it('el ejemplo del criterio: objetivo 3 por semana, 9 sesiones = 75%', () => {
      // 3 por semana durante 4 semanas = 12 esperadas; 9 completadas.
      const sesiones = Array.from({ length: 9 }, (_, i) => sesion(4 + i * 2));
      const resultado = calcularAdherencia(sesiones, [rutina(60, 3)], HOY);

      expect(resultado.disponible).toBe(true);
      if (resultado.disponible) {
        expect(resultado.sesionesEsperadas).toBe(12);
        expect(resultado.sesionesCompletadas).toBe(9);
        expect(resultado.porcentaje).toBe(75);
      }
    });

    it('calcula correctamente tras un cambio de frecuencia', () => {
      const frecuencias: FrecuenciaVigente[] = [
        { desde: hace(60), hasta: hace(14), sesionesPorSemana: 2 },
        rutina(14, 5),
      ];
      const sesiones = [
        sesion(4),
        sesion(5),
        sesion(6),
        sesion(10),
        sesion(20),
      ];
      const resultado = calcularAdherencia(sesiones, frecuencias, HOY);

      if (resultado.disponible) {
        // Las cinco sesiones caen dentro de las cuatro semanas completas; el
        // denominador mezcla las dos frecuencias porque el cambio ocurrió a
        // mitad de ventana.
        expect(resultado.sesionesEsperadas).toBe(11);
        expect(resultado.sesionesCompletadas).toBe(5);
        expect(resultado.porcentaje).toBeCloseTo(45.45, 1);
      }
    });
  });

  describe('RN-110 · semanas de lunes a domingo en la zona del gimnasio', () => {
    it('el inicio de semana de un miércoles es el lunes anterior', () => {
      // Miércoles 2026-10-21.
      const lunes = inicioDeSemana(new Date(Date.UTC(2026, 9, 21)));

      expect(lunes.toISOString().slice(0, 10)).toBe('2026-10-19');
    });

    it('el domingo pertenece a la semana que empezó el lunes anterior', () => {
      // Domingo 2026-10-18: en JavaScript es el día 0, y tratarlo como primer
      // día de la semana lo mandaría a la semana siguiente.
      const lunes = inicioDeSemana(new Date(Date.UTC(2026, 9, 18)));

      expect(lunes.toISOString().slice(0, 10)).toBe('2026-10-12');
    });

    it('el lunes es su propio inicio de semana', () => {
      const lunes = inicioDeSemana(new Date(Date.UTC(2026, 9, 19)));

      expect(lunes.toISOString().slice(0, 10)).toBe('2026-10-19');
    });

    it('la ventana termina donde empieza la semana en curso', () => {
      const corte = finDeUltimaSemanaCompleta(
        HOY,
        'America/Argentina/Buenos_Aires',
      );

      // La semana en curso no está completa, así que no entra: medir un
      // miércoles contra una frecuencia semanal entera mostraría al alumno
      // peor de lo que está.
      expect(corte.toISOString().slice(0, 10)).toBe('2026-10-19');
    });

    it('la fecha civil depende de la zona horaria del gimnasio', () => {
      // 2026-10-19T02:00Z es todavía domingo 18 en Buenos Aires (UTC-3).
      const instante = new Date('2026-10-19T02:00:00Z');

      expect(
        fechaLocal(instante, 'America/Argentina/Buenos_Aires')
          .toISOString()
          .slice(0, 10),
      ).toBe('2026-10-18');
      expect(fechaLocal(instante, 'UTC').toISOString().slice(0, 10)).toBe(
        '2026-10-19',
      );
    });

    it('una sesión del domingo a la noche cuenta en su semana, no en la siguiente', () => {
      // Domingo 2026-10-18 a las 22:00 de Buenos Aires = lunes 01:00 UTC.
      // Comparando instantes UTC caería fuera de la ventana; con la fecha
      // civil del gimnasio queda dentro, que es lo que vivió el alumno.
      const sesionDominical: SesionDeAdherencia = {
        occurredOn: new Date('2026-10-19T01:00:00Z'),
        completada: true,
      };
      const resultado = calcularAdherencia(
        [sesionDominical],
        [rutina(60, 1)],
        HOY,
        SEMANAS_VENTANA_ADHERENCIA,
        'America/Argentina/Buenos_Aires',
      );

      expect(resultado.disponible).toBe(true);
      if (resultado.disponible) {
        expect(resultado.sesionesCompletadas).toBe(1);
      }
    });

    it('la semana en curso no cuenta como semana completa', () => {
      // Sesión del martes de esta semana: todavía no cerró.
      const resultado = calcularAdherencia([sesion(1)], [rutina(60, 1)], HOY);

      expect(resultado.disponible).toBe(true);
      if (resultado.disponible) {
        expect(resultado.sesionesCompletadas).toBe(0);
      }
    });
  });
});
