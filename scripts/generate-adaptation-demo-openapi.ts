import { writeFile } from 'node:fs/promises';
import { z } from 'zod';
import {
  adaptationDemoScenarioSchema,
  prepareAdaptationDemoSchema,
  adaptationDemoResultSchema,
  adaptationDemoStudentSchema,
  adaptationDemoListSchema,
  adaptationDemoRestoreSchema,
} from '../src/modules/evolution/infrastructure/http/adaptation-demo.schemas';

const schemas = {
  AdaptationDemoScenario: adaptationDemoScenarioSchema,
  PrepareAdaptationDemo: prepareAdaptationDemoSchema,
  AdaptationDemoResult: adaptationDemoResultSchema,
  AdaptationDemoStudent: adaptationDemoStudentSchema,
  AdaptationDemoList: adaptationDemoListSchema,
  AdaptationDemoRestore: adaptationDemoRestoreSchema,
  EvolutionDiagnosticDataOrigin: z.enum(['REAL', 'SIMULATED']),
};
const json = (name: keyof typeof schemas) => ({
  'application/json': { schema: { $ref: '#/components/schemas/' + name } },
});
const errors = {
  '400': { description: 'Invalid UUID, scenario or unknown input field' },
  '401': { description: 'Session required' },
  '403': {
    description: 'Trainer role and current assignment in the same gym required',
  },
  '404': { description: 'ADAPTATION_DEMO_ENABLED is disabled' },
  '409': {
    description:
      'Missing current routine or alternative, unavailable exercise, ongoing training, regeneration pending or restore conflict. Preparation rolls back completely.',
  },
};
const security = [{ SessionCookie: [] }];
const parameters = [
  {
    in: 'path',
    name: 'studentId',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  },
];
async function main() {
  await writeFile(
    'openapi/adaptation-demo.openapi.json',
    JSON.stringify(
      {
        openapi: '3.1.0',
        info: {
          title: 'Reversible adaptation demonstration on assigned students',
          version: '1.0.0',
        },
        paths: {
          '/demo/adaptations': {
            get: {
              operationId: 'listAdaptationDemoStudents',
              security,
              summary:
                'Assigned students and durable active preparation, including current proposal state',
              responses: {
                '200': {
                  description: 'Assigned students',
                  content: json('AdaptationDemoList'),
                },
                ...errors,
              },
            },
          },
          '/demo/adaptations/{studentId}': {
            parameters,
            post: {
              operationId: 'prepareAdaptationDemo',
              security,
              summary:
                'Prepare historical simulated sessions and invoke the real diagnosis and proposal rules',
              description:
                'Temporarily archives the original routine and creates a tagged working routine with the same catalogue exercises and type. No original history is rewritten. Same scenario on the same day is reused until resolved. Switching cases or repeating after resolution restores the previous preparation atomically. Second stagnation requires an eligible existing alternative.',
              requestBody: {
                required: true,
                content: json('PrepareAdaptationDemo'),
              },
              responses: {
                '200': {
                  description:
                    'Calculated diagnosis and optional pending proposal',
                  content: json('AdaptationDemoResult'),
                },
                ...errors,
              },
            },
          },
          '/demo/adaptations/{studentId}/restore': {
            parameters,
            post: {
              operationId: 'restoreAdaptationDemo',
              security,
              summary:
                'Reactivate the original routine and retire generated artifacts, retaining audit and immutable evidence',
              description:
                'Idempotent. Archives the working routine including approval versions, invalidates pending proposals and expires related notices. Refuses conflicting real activity or another current routine. Simulated diagnoses remain identified and are excluded from real analytics and periodic jobs.',
              responses: {
                '200': {
                  description: 'Whether an active preparation was restored',
                  content: json('AdaptationDemoRestore'),
                },
                ...errors,
              },
            },
          },
        },
        components: {
          securitySchemes: {
            SessionCookie: {
              type: 'apiKey',
              in: 'cookie',
              name: 'gym_session',
            },
          },
          schemas: Object.fromEntries(
            Object.entries(schemas).map(([name, schema]) => [
              name,
              z.toJSONSchema(schema),
            ]),
          ),
        },
        'x-evolution-diagnostic-extension': {
          endpoint: 'GET /students/{studentId}/evolution-diagnostic',
          when: 'disponible=true',
          property: 'dataOrigin',
          schema: {
            $ref: '#/components/schemas/EvolutionDiagnosticDataOrigin',
          },
          description:
            'REAL excludes simulated sessions; SIMULATED identifies an explicitly prepared demonstration diagnosis.',
        },
      },
      null,
      2,
    ) + '\n',
  );
}
void main();
