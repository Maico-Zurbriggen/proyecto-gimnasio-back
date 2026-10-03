import { describe, expect, it } from 'vitest';

import {
  generarTokenDeSesion,
  hashearToken,
  hashesCoinciden,
} from './session-token';

describe('session-token domain service (HU07 - T2)', () => {
  describe('generarTokenDeSesion', () => {
    it('produces a 256-bit token in hexadecimal', () => {
      const token = generarTokenDeSesion();
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });

    it('never repeats a token', () => {
      const tokens = new Set(
        Array.from({ length: 200 }, () => generarTokenDeSesion()),
      );
      expect(tokens.size).toBe(200);
    });
  });

  describe('hashearToken', () => {
    it('is deterministic for the same token', () => {
      const token = generarTokenDeSesion();
      expect(hashearToken(token)).toBe(hashearToken(token));
    });

    it('produces different hashes for different tokens', () => {
      expect(hashearToken('a')).not.toBe(hashearToken('b'));
    });

    it('never returns the token itself: the stored value is not usable', () => {
      const token = generarTokenDeSesion();
      expect(hashearToken(token)).not.toBe(token);
    });
  });

  describe('hashesCoinciden', () => {
    it('accepts two identical hashes', () => {
      const hash = hashearToken('token');
      expect(hashesCoinciden(hash, hash)).toBe(true);
    });

    it('rejects two different hashes', () => {
      expect(hashesCoinciden(hashearToken('a'), hashearToken('b'))).toBe(false);
    });

    it('rejects values of different length without throwing', () => {
      expect(hashesCoinciden('abc', hashearToken('a'))).toBe(false);
    });

    it('rejects an empty value', () => {
      expect(hashesCoinciden('', hashearToken('a'))).toBe(false);
    });
  });
});
