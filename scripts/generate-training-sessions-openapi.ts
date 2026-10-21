import { mkdir, writeFile } from 'node:fs/promises';
import { z } from 'zod';
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
  SessionSetRecord: z.object({
    position: z.number().int().min(1),
    prescribedExerciseId: z.uuid(),
    prescribedExerciseName: z.string(),
    performedExerciseId: z.uuid().nullable(),
    performedExerciseName: z.string().nullable(),
    prescribedMinRepetitions: z.number().int(),
    prescribedMaxRepetitions: z.number().int(),
    prescribedLoad: z.number().nullable(),
    warmup: z.boolean(),
    performedLoad: z.number().nullable(),
    performedRepetitions: z.number().int().nullable(),
    perceivedEffort: z.number().int().nullable(),
    completed: z.boolean(),
    additional: z.boolean(),
    omissionReason: z.string().nullable(),
    atypicalConfirmed: z.boolean(),
  }),
  TrainingSession: z.object({
    id: z.uuid(),
    studentId: z.uuid(),
    routineId: z.uuid(),
    routineVersionId: z.uuid(),
    routineDayId: z.uuid(),
    routineDayName: z.string(),
    routineDayPosition: z.number().int(),
    state: z.enum(['EN_CURSO', 'COMPLETADA', 'ABANDONADA', 'BLOQUEADA']),
    startedAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
    occurredOn: z.string(),
    lastActivityAt: z.iso.datetime(),
    aptitudeWarning: z.enum(['AUSENTE', 'VENCIDA']).nullable(),
    compatibilityWarnings: z.array(
      z.object({ exerciseId: z.uuid(), state: z.string() }),
    ),
    setRecords: z.array(
      z.object({
        position: z.number().int().min(1),
        prescribedExerciseId: z.uuid(),
        prescribedExerciseName: z.string(),
        performedExerciseId: z.uuid().nullable(),
        performedExerciseName: z.string().nullable(),
        prescribedMinRepetitions: z.number().int(),
        prescribedMaxRepetitions: z.number().int(),
        prescribedLoad: z.number().nullable(),
        warmup: z.boolean(),
        performedLoad: z.number().nullable(),
        performedRepetitions: z.number().int().nullable(),
        perceivedEffort: z.number().int().nullable(),
        completed: z.boolean(),
        additional: z.boolean(),
        omissionReason: z.string().nullable(),
        atypicalConfirmed: z.boolean(),
      }),
    ),
  }),
  ExpireResult: z.object({
    abandoned: z.number().int().nonnegative(),
    blocked: z.number().int().nonnegative(),
  }),
  TrainingSessionSummary: z.object({
    id: z.uuid(),
    studentId: z.uuid(),
    routineDayName: z.string(),
    routineDayPosition: z.number().int(),
    state: z.enum(['EN_CURSO', 'COMPLETADA', 'ABANDONADA', 'BLOQUEADA']),
    startedAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
    occurredOn: z.string(),
    totalSeries: z.number().int().nonnegative(),
    completedSeries: z.number().int().nonnegative(),
  }),
  TrainingSessionPage: z.object({
    items: z.array(
      z.object({
        id: z.uuid(),
        studentId: z.uuid(),
        routineDayName: z.string(),
        routineDayPosition: z.number().int(),
        state: z.enum(['EN_CURSO', 'COMPLETADA', 'ABANDONADA', 'BLOQUEADA']),
        startedAt: z.iso.datetime(),
        completedAt: z.iso.datetime().nullable(),
        occurredOn: z.string(),
        totalSeries: z.number().int().nonnegative(),
        completedSeries: z.number().int().nonnegative(),
      }),
    ),
    total: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
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
    version: '1.0.0',
  },
  paths: {
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
          'De la más reciente a la más vieja, con conteo de series completadas. Filtros opcionales por estado y rango de ocurrencia (fecha local del gimnasio).',
        security,
        parameters: [
          studentIdParam,
          {
            in: 'query',
            name: 'state',
            required: false,
            schema: { type: 'string', enum: ref('TrainingSessionState') },
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
          'Actualiza sólo valores ejecutados; la prescripción congelada es inmutable (RN-61). Valida rangos RN-55, exige confirmación ante atípico RN-55a y es idempotente por (sesión, orden) RN-60. Cada escritura renueva lastActivityAt.',
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
      post: {
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
      Object.entries(schemas).map(([name, schema]) => [
        name,
        z.toJSONSchema(schema),
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
