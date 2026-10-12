import { describe, expect, it } from 'vitest';

import {
  estadoInvitacionArranque,
  normalizarCorreo,
  normalizarNombreGimnasio,
  puedeReemitirse,
  tieneFormaDeZonaIana,
} from './gym-provisioning';

describe('gym-provisioning (HU13)', () => {
  it('normaliza el nombre sin espacios sobrantes', () => {
    expect(normalizarNombreGimnasio('  Gimnasio   Norte ')).toBe(
      'Gimnasio Norte',
    );
  });

  it('normaliza el correo igual que el login', () => {
    expect(normalizarCorreo(' Admin@Norte.TEST ')).toBe('admin@norte.test');
  });

  it.each([
    ['America/Argentina/Cordoba', true],
    ['America/Argentina/Buenos_Aires', true],
    ['Europe/Madrid', true],
    ['ZonaInventada', false],
    ['america/argentina/cordoba', false],
    ['', false],
  ])('forma IANA de %s: %s', (zona, esperado) => {
    expect(tieneFormaDeZonaIana(zona)).toBe(esperado);
  });

  it('informa PENDIENTE, VENCIDA, USADA y REVOCADA', () => {
    const emitida = new Date('2026-10-01T00:00:00Z');
    const vence = new Date('2026-10-15T00:00:00Z');
    const antes = new Date('2026-10-05T00:00:00Z');
    const despues = new Date('2026-10-20T00:00:00Z');
    expect(estadoInvitacionArranque('VIGENTE', emitida, vence, antes)).toBe(
      'PENDIENTE',
    );
    expect(estadoInvitacionArranque('VIGENTE', emitida, vence, despues)).toBe(
      'VENCIDA',
    );
    expect(estadoInvitacionArranque('USADA', emitida, vence, despues)).toBe(
      'USADA',
    );
    expect(estadoInvitacionArranque('REVOCADA', emitida, vence, antes)).toBe(
      'REVOCADA',
    );
  });

  it('sólo una invitación usada no se reemite', () => {
    expect(puedeReemitirse('USADA')).toBe(false);
    expect(puedeReemitirse('VENCIDA')).toBe(true);
    expect(puedeReemitirse('PENDIENTE')).toBe(true);
  });
});
