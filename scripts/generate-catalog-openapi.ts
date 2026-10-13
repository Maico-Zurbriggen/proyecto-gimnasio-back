import { mkdir, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import {
  exerciseInputSchema,
  updateExerciseSchema,
  reviewExerciseSchema,
  availabilitySchema,
  inventorySchema,
} from '../src/modules/exercise-catalog/infrastructure/http/catalog.schemas';
import {
  EXERCISE_STATES,
  LEVELS,
  PATTERNS,
} from '../src/modules/exercise-catalog/domain/catalog';

const entity = exerciseInputSchema.safeExtend({
  id: z.uuid(),
  origin: z.enum(['CATALOGO_BASE', 'GIMNASIO']),
  state: z.enum(EXERCISE_STATES),
  revision: z.number().int(),
  authorUserId: z.uuid().nullable(),
  source: z.string().nullable(),
  reviewObservation: z.string().nullable(),
  enabled: z.boolean(),
  availabilityUpdatedAt: z.iso.datetime().nullable(),
  availabilityRevision: z.number().int().nullable(),
  updatedAt: z.iso.datetime(),
  media: z.array(
    z.strictObject({
      pose: z.enum(['INICIO', 'FINAL', 'PRINCIPAL']),
      url: z.string(),
    }),
  ),
});
const codeName = z.strictObject({ code: z.string(), name: z.string() });
const schemas = {
  ExerciseInput: exerciseInputSchema,
  CatalogExercise: entity,
  UpdateExercise: updateExerciseSchema,
  ReviewExercise: reviewExerciseSchema,
  AvailabilityInput: availabilitySchema,
  InventoryInput: inventorySchema,
  CatalogPage: z.strictObject({
    items: z.array(entity),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
  }),
  Taxonomies: z.strictObject({
    equipment: z.array(codeName),
    muscles: z.array(codeName),
    joints: z.array(codeName),
  }),
  Inventory: z.strictObject({
    equipment: z.array(z.string()),
    updatedAt: z.iso.datetime().nullable(),
    revision: z.number().int(),
  }),
  InventoryResult: z.strictObject({
    relatedExerciseIds: z.array(z.uuid()),
    relatedExercises: z.array(
      z.strictObject({ id: z.uuid(), name: z.string() }),
    ),
  }),
  AvailabilityResult: z.strictObject({ changed: z.number().int() }),
  Error: z.object({ error: z.string(), details: z.unknown().optional() }),
};
const ref = (name: keyof typeof schemas) => ({
  $ref: `#/components/schemas/${name}`,
});
const json = (name: keyof typeof schemas) => ({
  'application/json': { schema: ref(name) },
});
const id = {
  in: 'path',
  name: 'exerciseId',
  required: true,
  schema: { type: 'string', format: 'uuid' },
};
const query = (name: string, schema: object) => ({
  in: 'query',
  name,
  required: false,
  schema,
});
const operation = (
  operationId: string,
  response: keyof typeof schemas,
  input?: keyof typeof schemas,
  parameters: object[] = [],
) => ({
  operationId,
  security: [{ SessionCookie: [] }],
  parameters,
  ...(input ? { requestBody: { required: true, content: json(input) } } : {}),
  responses: {
    [operationId === 'createCatalogExercise' ? '201' : '200']: {
      description: 'Success',
      content: json(response),
    },
    ...Object.fromEntries(
      [400, 401, 403, 404, 409, 422].map((status) => [
        status,
        { description: 'Request rejected', content: json('Error') },
      ]),
    ),
  },
});
const spec = {
  openapi: '3.1.0',
  info: { title: 'Gym exercise catalog', version: '1.0.0' },
  components: {
    securitySchemes: {
      SessionCookie: { type: 'apiKey', in: 'cookie', name: 'gym_session' },
    },
    schemas: Object.fromEntries(
      Object.entries(schemas).map(([name, schema]) => [
        name,
        z.toJSONSchema(schema, { unrepresentable: 'any' }),
      ]),
    ),
  },
  paths: {
    '/catalog/taxonomies': {
      get: operation('getCatalogTaxonomies', 'Taxonomies'),
    },
    '/catalog/inventory': {
      get: operation('getGymInventory', 'Inventory'),
      post: operation('setGymInventory', 'InventoryResult', 'InventoryInput'),
    },
    '/catalog/availability': {
      post: operation(
        'setGymAvailability',
        'AvailabilityResult',
        'AvailabilityInput',
      ),
    },
    '/catalog/exercises': {
      get: operation('listCatalogExercises', 'CatalogPage', undefined, [
        query('search', { type: 'string', maxLength: 160 }),
        ...['muscle', 'equipment'].map((name) =>
          query(name, { type: 'string' }),
        ),
        query('pattern', { type: 'string', enum: PATTERNS }),
        query('difficulty', { type: 'string', enum: LEVELS }),
        query('state', { type: 'string', enum: EXERCISE_STATES }),
        query('origin', {
          type: 'string',
          enum: ['CATALOGO_BASE', 'GIMNASIO'],
        }),
        query('enabled', { type: 'string', enum: ['true', 'false'] }),
        query('page', { type: 'integer', minimum: 1, default: 1 }),
        query('pageSize', {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          default: 24,
        }),
      ]),
      post: operation(
        'createCatalogExercise',
        'CatalogExercise',
        'ExerciseInput',
      ),
    },
    '/catalog/exercises/{exerciseId}': {
      get: operation('getCatalogExercise', 'CatalogExercise', undefined, [id]),
      patch: operation(
        'updateCatalogExercise',
        'CatalogExercise',
        'UpdateExercise',
        [id],
      ),
    },
    '/catalog/exercises/{exerciseId}/review': {
      post: operation(
        'reviewCatalogExercise',
        'CatalogExercise',
        'ReviewExercise',
        [id],
      ),
    },
  },
};
async function main() {
  await mkdir('openapi', { recursive: true });
  await writeFile(
    'openapi/catalog.openapi.json',
    JSON.stringify(spec, null, 2) + '\n',
  );
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
