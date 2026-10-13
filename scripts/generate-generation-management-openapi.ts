import { mkdir, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { generationSettingsSchema } from '../src/modules/gyms/infrastructure/http/generation-settings.routes';

const schemas = {
  GenerationSettings: generationSettingsSchema,
  GenerationSettingsSnapshot: z.object({
    settings: generationSettingsSchema.nullable(),
    revision: z.number().int().nonnegative(),
  }),
  RegenerateProposalInput: z
    .object({
      feedback: z.string().trim().min(1).max(2000),
      idempotencyKey: z.uuid(),
      candidateRequestId: z.uuid(),
    })
    .strict(),
  ProposalRegeneration: z.object({
    id: z.uuid(),
    proposalId: z.uuid(),
    trainerId: z.uuid(),
    feedback: z.string(),
    candidateRequestId: z.uuid(),
    requestId: z.uuid().nullable(),
    state: z.enum(['PENDIENTE', 'COMPLETADA', 'NO_DISPONIBLE']),
    error: z.string().nullable(),
  }),
  ProposalRegenerationReference: z.object({ candidateRequestId: z.uuid() }),
};
const ref = (name: keyof typeof schemas) => ({
  $ref: '#/components/schemas/' + name,
});
const json = (schema: unknown) => ({ 'application/json': { schema } });
const security = [{ SessionCookie: [] }];
const errors = {
  '401': { description: 'Missing session' },
  '403': { description: 'Role or current assignment is not authorized' },
  '409': {
    description:
      'Pending regeneration, changed candidate, resolved proposal or stale configuration revision',
  },
};
const document = {
  openapi: '3.1.0',
  info: {
    title: 'Gym generation parameters and trainer regeneration',
    version: '1.0.0',
  },
  paths: {
    '/gyms/me/generation-settings': {
      get: {
        operationId: 'getGenerationSettings',
        summary: 'Current session gym settings; administrator or trainer',
        security,
        responses: {
          '200': {
            description: 'Captured gym policy',
            content: json(ref('GenerationSettingsSnapshot')),
          },
          ...errors,
        },
      },
      put: {
        operationId: 'saveGenerationSettings',
        summary:
          'Administrator configures its own gym; optimistic revision required',
        security,
        description:
          'Null settings leaves training choices to AI. Explicit ranges apply to all series; warmupSetsPerExercise is additional to work sets. Limits and total 500-set transport capacity are validated. Every save increments revision and is audited.',
        requestBody: {
          required: true,
          content: json(ref('GenerationSettingsSnapshot')),
        },
        responses: {
          '200': {
            description: 'Saved revision',
            content: json(ref('GenerationSettingsSnapshot')),
          },
          '400': { description: 'Invalid ranges or capacity exceeded' },
          ...errors,
        },
      },
    },
    '/proposals/{proposalId}/regeneration': {
      parameters: [
        {
          in: 'path',
          name: 'proposalId',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      post: {
        operationId: 'regenerateProposal',
        summary:
          'Assigned trainer regenerates a pending automatic ESTRUCTURA proposal',
        security,
        description:
          'Asynchronous and idempotent. Retains the old candidate until a different, valid result replaces it. Never changes the active version. Full gym catalog and current parameter revision are captured in the request. Approval is blocked while pending.',
        requestBody: {
          required: true,
          content: json(ref('RegenerateProposalInput')),
        },
        responses: {
          '202': {
            description:
              'Durable regeneration request (possibly terminal on dispatch failure)',
            content: json(ref('ProposalRegeneration')),
          },
          '400': { description: 'Invalid input' },
          '404': { description: 'Unknown proposal' },
          ...errors,
        },
      },
      get: {
        operationId: 'getProposalRegeneration',
        summary: 'Assigned trainer polls and finalizes the last regeneration',
        security,
        description:
          'Returns null if there was no regeneration. Reloading resumes a reserved request. Validates current profile, assignment, source version, enabled catalog and gym configuration before replacing the pending candidate. Failure keeps the old candidate and creates one alert.',
        responses: {
          '200': {
            description: 'Latest regeneration, or null',
            content: json({
              anyOf: [ref('ProposalRegeneration'), { type: 'null' }],
            }),
          },
          '404': { description: 'Unknown proposal' },
          ...errors,
        },
      },
    },
  },
  components: {
    securitySchemes: {
      SessionCookie: { type: 'apiKey', in: 'cookie', name: 'gym_session' },
    },
    schemas: Object.fromEntries(
      Object.entries(schemas).map(([name, schema]) => [
        name,
        z.toJSONSchema(schema),
      ]),
    ),
  },
  'x-proposal-review-extension': {
    endpoint: 'GET /proposals/{proposalId}',
    optionalProperty: 'regeneration',
    schema: ref('ProposalRegenerationReference'),
    description:
      'Present for automatically generated structure proposals. Send candidateRequestId when resolving to prevent approving a stale candidate.',
  },
};
async function main() {
  await mkdir('openapi', { recursive: true });
  await writeFile(
    'openapi/generation-management.openapi.json',
    JSON.stringify(document, null, 2) + '\n',
  );
}
void main();
