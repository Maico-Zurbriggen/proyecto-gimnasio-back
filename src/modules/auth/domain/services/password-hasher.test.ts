import { describe, expect, it } from 'vitest';
import bcrypt from 'bcrypt';

import {
  contrasenaCoincide,
  COSTE_BCRYPT_POR_DEFECTO,
  hashearContrasena,
} from './password-hasher';

describe('password-hasher domain service (HU07 - T1)', () => {
  it('accepts the correct password', async () => {
    const hash = await hashearContrasena('unaClaveSegura123');
    await expect(contrasenaCoincide('unaClaveSegura123', hash)).resolves.toBe(
      true,
    );
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashearContrasena('unaClaveSegura123');
    await expect(contrasenaCoincide('otraClave', hash)).resolves.toBe(false);
  });

  it('is case sensitive', async () => {
    const hash = await hashearContrasena('Clave');
    await expect(contrasenaCoincide('clave', hash)).resolves.toBe(false);
  });

  it('RNF-15: never stores the password in clear text', async () => {
    const hash = await hashearContrasena('unaClaveSegura123');
    expect(hash).not.toContain('unaClaveSegura123');
  });

  it('RNF-15: uses a unique salt, so the same password yields different hashes', async () => {
    const primero = await hashearContrasena('mismaClave');
    const segundo = await hashearContrasena('mismaClave');

    expect(primero).not.toBe(segundo);
    // Y aun así ambos verifican: la sal viaja dentro del hash.
    await expect(contrasenaCoincide('mismaClave', primero)).resolves.toBe(true);
    await expect(contrasenaCoincide('mismaClave', segundo)).resolves.toBe(true);
  });

  it('RNF-15: stores the configured work factor in the hash', async () => {
    const hash = await hashearContrasena('unaClaveSegura123');

    // El tiempo de pared depende del hardware y de la carga del runner. El test
    // estable de seguridad es comprobar el factor de trabajo que bcrypt codifica
    // en el propio hash; los 200 ms se validan al calibrar cada entorno.
    expect(bcrypt.getRounds(hash)).toBe(COSTE_BCRYPT_POR_DEFECTO);
  });

  it('uses a cost of 12 by default', () => {
    expect(COSTE_BCRYPT_POR_DEFECTO).toBe(12);
  });

  it('returns false instead of throwing when the stored hash is corrupt', async () => {
    // Un registro dañado debe comportarse como credencial incorrecta, no como un
    // 500 que revelaría que ese usuario existe.
    await expect(contrasenaCoincide('clave', 'no-es-un-hash')).resolves.toBe(
      false,
    );
    await expect(contrasenaCoincide('clave', '')).resolves.toBe(false);
  });
});
