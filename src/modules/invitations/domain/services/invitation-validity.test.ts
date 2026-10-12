import { describe, expect, it } from 'vitest';

import {
  calcularVencimiento,
  generarTokenDeInvitacion,
  hashearTokenDeInvitacion,
  motivoNoUsable,
  vencimientoEfectivo,
} from './invitation-validity';

describe('invitation-validity (HU06 - T1)', () => {
  const emitida = new Date('2026-10-01T12:00:00Z');

  it('vence a los 14 días de la emisión', () => {
    expect(calcularVencimiento(emitida).toISOString()).toBe(
      '2026-10-15T12:00:00.000Z',
    );
  });

  it('el vencimiento efectivo nunca supera los 14 días', () => {
    const lejano = new Date('2027-01-01T00:00:00Z');
    expect(vencimientoEfectivo(emitida, lejano).toISOString()).toBe(
      '2026-10-15T12:00:00.000Z',
    );
  });

  it('vigente dentro del plazo, vencida en el instante exacto', () => {
    const vence = calcularVencimiento(emitida);
    expect(
      motivoNoUsable('VIGENTE', emitida, vence, new Date(vence.getTime() - 1)),
    ).toBeNull();
    expect(motivoNoUsable('VIGENTE', emitida, vence, vence)).toBe('VENCIDA');
  });

  it('los estados terminales mandan sobre la fecha', () => {
    const pasado = new Date('2026-12-01T00:00:00Z');
    const vence = calcularVencimiento(emitida);
    expect(motivoNoUsable('USADA', emitida, vence, pasado)).toBe('USADA');
    expect(motivoNoUsable('REVOCADA', emitida, vence, pasado)).toBe('REVOCADA');
    expect(motivoNoUsable('CADUCADA', emitida, vence, emitida)).toBe('VENCIDA');
  });

  it('genera tokens distintos, aptos para URL, y guarda sólo su hash', () => {
    const a = generarTokenDeInvitacion();
    const b = generarTokenDeInvitacion();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hashearTokenDeInvitacion(a)).not.toContain(a);
    expect(hashearTokenDeInvitacion(a)).toMatch(/^[0-9a-f]{64}$/);
  });
});
