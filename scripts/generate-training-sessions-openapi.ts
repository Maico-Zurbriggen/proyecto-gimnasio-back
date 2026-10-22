import { mkdir, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { sessionResponseSchemas } from '../src/modules/training-sessions/infrastructure/http/session-response.schemas';
import { GRUPOS_MUSCULARES } from '../src/modules/indicators/domain/muscle-activity';
import {
  listSessionsQuerySchema,
  startSessionBodySchema,
  updateSeriesBodySchema,
} from '../src/modules/training-sessions/infrastructure/http/training-sessions.schemas';

/**
 * T1 — Contrato OpenAPI de la sesión de entrenamiento (RF-027, D6/§4).
 * Fuente: los schemas Zod del módulo; el JSON generado es la verdad
 * que consume el frontend hasta el cliente generado.
 *
 * Pausar no es una transición del autómata: es estado local del cliente
 * (CB-25, FL-07). El backend sólo conoce EN_CURSO, COMPLETADA,
 * ABANDONADA y BLOQUEADA.
 */
const schemas = {
  StartSessionInput: startSessionBodySchema,
  UpdateSeriesInput: updateSeriesBodySchema,
  ListSessionsQuery: listSessionsQuerySchema,
  TrainingSessionState: z.enum([
    'EN_CURSO',
    'COMPLETADA',
    'ABANDONADA',
    'BLOQUEADA',
  ]),
  ...sessionResponseSchemas,
  ExpireResult: z.object({
    abandoned: z.number().int().nonnegative(),
    blocked: z.number().int().nonnegative(),
  }),
  Error: z.object({ error: z.string(), details: z.unknown().optional() }),
};

const ref = (name: keyof typeof schemas) => ({
  $ref: '#/components/schemas/' + name,
});
const json = (schema: unknown) => ({ 'application/json': { schema } });
const security = [{ SessionCookie: [] }];
const studentIdParam = {
  in: 'path',
  name: 'studentId',
  required: true,
  schema: { type: 'string', format: 'uuid' },
};
const sessionIdParam = {
  in: 'path',
  name: 'sessionId',
  required: true,
  schema: { type: 'string', format: 'uuid' },
};
const positionParam = {
  in: 'path',
  name: 'position',
  required: true,
  schema: { type: 'integer', minimum: 1 },
};

const document = {
  openapi: '3.1.0',
  info: {
    title: 'Training sessions lifecycle',
    version: '1.1.0',
  },
  paths: {
    '/students/{studentId}/indicators/muscle-activity': {
      get: {
        operationId: 'getMuscleActivity',
        summary:
          'Volumen en series efectivas y frecuencia por grupo muscular (HU25)',
        description:
          'Alumno propietario o entrenador con asignación vigente del mismo gimnasio. Excluye simuladas, EN_CURSO, ABANDONADA, calentamiento, omisiones e incompletas. Usa el ejercicio ejecutado y cuenta series adicionales. Fechas de ocurrencia locales, límites inclusivos. No permite futuro en el gimnasio. SIN_DATOS devuelve null; CALCULADO puede devolver cero. El resultado se deriva en cada consulta.',
        security,
        parameters: [
          studentIdParam,
          ...['from', 'to'].map((name) => ({
            in: 'query',
            name,
            required: true,
            schema: { type: 'string', format: 'date' },
          })),
        ],
        responses: {
          '200': {
            description: 'Actividad muscular calculada',
            content: json({ $ref: '#/components/schemas/MuscleActivity' }),
          },
          '400': { description: 'Período inválido' },
          '401': { description: 'Sin sesión' },
          '403': {
            description: 'Acceso no autorizado, sin revelar existencia',
          },
        },
      },
    },
    '/students/{studentId}/training-sessions': {
      post: {
        operationId: 'startTrainingSession',
        summary: 'Iniciar una sesión sobre un día de la rutina vigente',
        description:
          'FL-05 pasos 1 a 4. Exige rutina VIGENTE y ninguna sesión EN_CURSO (RN-50, RN-51). Congela la prescripción del día (RN-52). La inactividad previa de 8 h se abandona de forma perezosa antes de iniciar (RN-53). Pausar no existe en el servidor: es estado local del cliente.',
        security,
        parameters: [studentIdParam],
        requestBody: {
          required: false,
          content: json(ref('StartSessionInput')),
        },
        responses: {
          '201': {
            description: 'Sesión EN_CURSO con prescripción congelada',
            content: json(ref('TrainingSession')),
          },
          '400': { description: 'Parámetros o cuerpo inválidos' },
          '401': { description: 'Sin sesión' },
          '403': { description: 'Alumno ajeno o rol no autorizado' },
          '404': { description: 'Alumno, rutina o día inexistente' },
          '409': {
            description: 'Sin rutina vigente o ya existe una sesión en curso',
          },
          '423': { description: 'Alumno bloqueado por mediciones' },
        },
      },
      get: {
        operationId: 'listTrainingSessions',
        summary: 'Historial paginado de sesiones del alumno (RF-035)',
        description:
          'Orden estable por occurredOn, startedAt e id descendentes. Continuar con nextCursor; omitir cursor para la primera ventana. page sigue disponible por compatibilidad. Incluye ABANDONADA y simuladas identificadas. Usa sólo snapshot; los campos históricos no recuperables son null y snapshotComplete=false. Alumno propietario o entrenador con asignación vigente; administrador sin otro rol autorizado recibe 403. Instantes UTC acompañados por timezone y fecha local occurredOn.',
        security,
        parameters: [
          studentIdParam,
          {
            in: 'query',
            name: 'state',
            required: false,
            schema: ref('TrainingSessionState'),
          },
          {
            in: 'query',
            name: 'from',
            required: false,
            schema: { type: 'string', format: 'date' },
          },
          {
            in: 'query',
            name: 'to',
            required: false,
            schema: { type: 'string', format: 'date' },
          },
          {
            in: 'query',
            name: 'page',
            required: false,
            schema: { type: 'integer', minimum: 1, default: 1 },
          },
          {
            in: 'query',
            name: 'pageSize',
            required: false,
            schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
          },
          {
            in: 'query',
            name: 'cursor',
            required: false,
            schema: { type: 'string', maxLength: 512 },
          },
          {
            in: 'query',
            name: 'simulated',
            required: false,
            schema: { type: 'string', enum: ['true', 'false'] },
          },
        ],
        responses: {
          '200': {
            description: 'Página del historial',
            content: json(ref('TrainingSessionPage')),
          },
          '400': { description: 'Parámetros o consulta inválidos' },
          '401': { description: 'Sin sesión' },
          '403': { description: 'Alumno ajeno o rol no autorizado' },
          '404': { description: 'Alumno inexistente' },
        },
      },
    },
    '/students/{studentId}/training-sessions/active': {
      get: {
        operationId: 'getActiveTrainingSession',
        summary: 'Reanudar la sesión en curso (FL-07)',
        description:
          'Devuelve la sesión EN_CURSO con sus series conservadas. Si la última actividad supera 8 h, la sesión ya está ABANDONADA (RN-53) y responde 404.',
        security,
        parameters: [studentIdParam],
        responses: {
          '200': {
            description: 'Sesión en curso',
            content: json(ref('TrainingSession')),
          },
          '401': { description: 'Sin sesión' },
          '403': { description: 'Alumno ajeno o rol no autorizado' },
          '404': { description: 'Sin sesión en curso' },
        },
      },
    },
    '/training-sessions/active': {
      get: {
        operationId: 'getOwnActiveTrainingSession',
        summary: 'Atajo del alumno a su sesión en curso',
        description: 'Misma autorización que la lectura por studentId.',
        security,
        responses: {
          '200': {
            description: 'Sesión en curso',
            content: json(ref('TrainingSession')),
          },
          '401': { description: 'Sin sesión' },
          '403': { description: 'Rol no autorizado' },
          '404': { description: 'Sin sesión en curso' },
        },
      },
    },
    '/students/{studentId}/training-sessions/{sessionId}': {
      get: {
        operationId: 'getTrainingSession',
        summary: 'Detalle de una sesión del historial',
        description:
          'Prescripción congelada junto a lo ejecutado, serie por serie (D4/PD-02, RF-035).',
        security,
        parameters: [studentIdParam, sessionIdParam],
        responses: {
          '200': {
            description: 'Sesión con sus registros',
            content: json(ref('TrainingSession')),
          },
          '401': { description: 'Sin sesión' },
          '403': { description: 'Alumno ajeno o rol no autorizado' },
          '404': { description: 'Sesión inexistente' },
        },
      },
    },
    '/students/{studentId}/training-sessions/{sessionId}/records/{position}': {
      patch: {
        operationId: 'updateSeriesRecord',
        summary: 'Registrar una serie (RF-029)',
        description:
          'Sólo campos ejecutados, en EN_CURSO o corrección de COMPLETADA dentro de 48 h. Campos prescriptos desconocidos se rechazan con 400. additional es inmutable: additional=true en la siguiente posición global crea una serie sin prescripción, exige performedExerciseId y admite performedWarmup al crear. El reenvío de posición es idempotente. Carga atípica requiere confirmación. Una serie completada no admite motivo de omisión.',
        security,
        parameters: [studentIdParam, sessionIdParam, positionParam],
        requestBody: {
          required: true,
          content: json(ref('UpdateSeriesInput')),
        },
        responses: {
          '200': {
            description: 'Sesión actualizada',
            content: json(ref('TrainingSession')),
          },
          '400': { description: 'Rango inválido o cuerpo inválido' },
          '401': { description: 'Sin sesión' },
          '403': { description: 'Alumno ajeno o rol no autorizado' },
          '404': { description: 'Sesión o serie inexistente' },
          '409': {
            description: 'Sesión no en curso o serie atípica sin confirmación',
          },
        },
      },
    },
    '/students/{studentId}/training-sessions/{sessionId}/finish': {
      post: {
        operationId: 'finishTrainingSession',
        summary: 'Cierre manual: la sesión pasa a COMPLETADA (D6/§4)',
        description:
          'Sella la duración y habilita indicadores. La corrección posterior de 48 h y el bloqueo pertenecen a RF-034/RF-117 (diferidos): aquí sólo se cierra.',
        security,
        parameters: [studentIdParam, sessionIdParam],
        responses: {
          '200': {
            description: 'Sesión completada',
            content: json(ref('TrainingSession')),
          },
          '401': { description: 'Sin sesión' },
          '403': { description: 'Alumno ajeno o rol no autorizado' },
          '404': { description: 'Sesión inexistente' },
          '409': { description: 'Sesión no en curso o ya abandonada' },
        },
      },
    },
    '/students/{studentId}/training-sessions/{sessionId}/abandon': {
      post: {
        operationId: 'abandonTrainingSession',
        summary: 'Descartar la sesión (FL-07 A1): pasa a ABANDONADA',
        description:
          'Conserva lo registrado como señal de interrupción (D6/§4). Estado terminal.',
        security,
        parameters: [studentIdParam, sessionIdParam],
        responses: {
          '200': {
            description: 'Sesión abandonada',
            content: json(ref('TrainingSession')),
          },
          '401': { description: 'Sin sesión' },
          '403': { description: 'Alumno ajeno o rol no autorizado' },
          '404': { description: 'Sesión inexistente' },
          '409': { description: 'Sesión no en curso' },
        },
      },
    },
    '/internal/jobs/training-sessions/expire': {
      get: {
        operationId: 'expireTrainingSessions',
        summary: 'Cierre automático por inactividad (RN-53, RN-58)',
        description:
          'ABANDONADA tras 8 h sin actividad; BLOQUEADA tras 48 h de COMPLETADA. Idempotente, sólo scheduler con CRON_SECRET.',
        security: [{ CronSecret: [] }],
        responses: {
          '200': {
            description: 'Conteo de transiciones aplicadas',
            content: json(ref('ExpireResult')),
          },
          '401': { description: 'Credencial del scheduler inválida' },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      SessionCookie: { type: 'apiKey', in: 'cookie', name: 'gym_session' },
      CronSecret: {
        type: 'http',
        scheme: 'bearer',
        description: 'CRON_SECRET provided by the scheduler',
      },
    },
    schemas: Object.fromEntries(
      Object.entries({
        ...schemas,
        MuscleActivity: z.object({
          studentId: z.uuid(),
          from: z.iso.date(),
          to: z.iso.date(),
          timezone: z.string(),
          sessionCount: z.number().int(),
          calculatedAt: z.iso.datetime(),
          unit: z.literal('SERIES_EFECTIVAS'),
          groups: z
            .array(
              z.object({
                group: z.enum(GRUPOS_MUSCULARES),
                status: z.enum(['SIN_DATOS', 'CALCULADO']),
                volume: z.number().nullable(),
                frequency: z.number().int().nullable(),
              }),
            )
            .length(17),
          exerciseVolumes: z.array(
            z.object({
              exerciseId: z.uuid().nullable(),
              completedWorkSets: z.number().int(),
              unit: z.literal('SERIES_DE_TRABAJO'),
              classification: z.enum(['CLASIFICADO', 'NO_CLASIFICADO']),
            }),
          ),
        }),
      }).map(([name, schema]) => [
        name,
        z.toJSONSchema(schema, { io: 'input' }),
      ]),
    ),
  },
};

async function main() {
  await mkdir('openapi', { recursive: true });
  await writeFile(
    'openapi/training-sessions.openapi.json',
    JSON.stringify(document, null, 2) + '\n',
  );
}

void main();
