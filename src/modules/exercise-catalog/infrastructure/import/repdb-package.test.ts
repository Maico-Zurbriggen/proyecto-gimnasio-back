import { describe, expect, it } from 'vitest';
import { zipSync } from 'fflate';
import {
  extractRepdbImages,
  parseRepdbPackage,
  repdbReviewSchema,
  sha256,
  validateReviewedEntries,
} from './repdb-package';

const fixture = {
  id: 'synthetic-exercise',
  name_es: 'Ejercicio sintético',
  description_es: 'Ficha original de prueba.',
  instructions_es: ['Instrucciones originales de prueba.'],
  tips_es: [],
  difficulty: 'beginner',
  equipment: null,
  primary_muscles: ['synthetic'],
  secondary_muscles: null,
  is_unilateral: false,
  images: { flat: { main: 'images/flat/synthetic-exercise.webp' } },
};
const bytes = (exercises = [fixture]) =>
  Buffer.from(
    JSON.stringify({
      schema_version: 1,
      license: 'Synthetic test only',
      count: exercises.length,
      exercises,
    }),
  );
const webp = Buffer.from('RIFFxxxxWEBPsynthetic');

describe('RepDB staging and reviewed publication', () => {
  it('validates every entry and rejects repeated identities or mismatched counts', () => {
    expect(parseRepdbPackage(bytes()).count).toBe(1);
    expect(() => parseRepdbPackage(bytes([fixture, fixture]))).toThrow(
      'repeated source identity',
    );
    const payload = JSON.parse(bytes().toString());
    payload.count = 2;
    expect(() =>
      parseRepdbPackage(Buffer.from(JSON.stringify(payload))),
    ).toThrow('Invalid count');
    payload.count = 1;
    payload.exercises[0].primary_muscles = [];
    expect(() =>
      parseRepdbPackage(Buffer.from(JSON.stringify(payload))),
    ).toThrow();
  });

  it('extracts only referenced flat media, rejects unsafe paths, and quarantines missing media', () => {
    const entries = parseRepdbPackage(bytes()).exercises;
    const zip = zipSync({
      'images/flat/synthetic-exercise.webp': webp,
      'premium-samples/never-import.webp': webp,
    });
    expect(Object.keys(extractRepdbImages(zip, entries))).toEqual([
      'images/flat/synthetic-exercise.webp',
    ]);
    expect(() =>
      extractRepdbImages(zipSync({ '../unsafe.webp': webp }), entries),
    ).toThrow('Unsafe ZIP path');
    expect(() => extractRepdbImages(zipSync({}), entries)).toThrow(
      'Missing or invalid image',
    );
    expect(extractRepdbImages(zipSync({}), entries, true)).toEqual({});
    expect(() =>
      extractRepdbImages(
        zipSync({
          'images/flat/synthetic-exercise.webp': Buffer.from('not webp'),
        }),
        entries,
      ),
    ).toThrow('Missing or invalid image');
  });

  it('binds reviews to a package hash and never approves incomplete classifications', () => {
    const source = parseRepdbPackage(bytes());
    const revision = sha256(bytes());
    const draft = repdbReviewSchema.parse({
      sourceRevision: revision,
      entries: [
        {
          sourceId: fixture.id,
          reviewed: false,
          reviewer: '',
          reviewedAt: null,
          movementPattern: null,
          difficultyLevel: 'PRINCIPIANTE',
          equipment: null,
          primaryMuscles: null,
          secondaryMuscles: null,
          joints: null,
        },
      ],
    });
    expect(validateReviewedEntries(draft, revision, source.exercises)).toEqual(
      [],
    );
    expect(() =>
      validateReviewedEntries(draft, '0'.repeat(64), source.exercises),
    ).toThrow('revision mismatch');
    draft.entries[0]!.reviewed = true;
    expect(() =>
      validateReviewedEntries(draft, revision, source.exercises),
    ).toThrow('Incomplete review');
  });
});
