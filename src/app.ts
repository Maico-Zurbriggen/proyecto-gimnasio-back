import cors, { type CorsOptions } from 'cors';
import express, { type ErrorRequestHandler } from 'express';

import {
  databaseHealthCheck,
  prisma,
  type HealthCheck,
} from './database/client';
import { createRoutineGenerationGatewayFromEnv } from './integrations/ai/http-routine-generation.gateway';
import type { AuthUsersRepository } from './modules/auth/application/ports/auth-users.repository';
import type { SessionsRepository } from './modules/auth/application/ports/sessions.repository';
import { GetSessionUseCase } from './modules/auth/application/use-cases/get-session.use-case';
import { LoginUseCase } from './modules/auth/application/use-cases/login.use-case';
import { LogoutUseCase } from './modules/auth/application/use-cases/logout.use-case';
import { AuthController } from './modules/auth/infrastructure/http/auth.controller';
import { createAuthRouter } from './modules/auth/infrastructure/http/auth.routes';
import { createSessionMiddleware } from './modules/auth/infrastructure/http/session.middleware';
import { PrismaAuthRepository } from './modules/auth/infrastructure/persistence/prisma-auth.repository';
import type { ProposalsRepository } from './modules/evolution/application/ports/proposals.repository';
import { GetProposalReviewUseCase } from './modules/evolution/application/use-cases/get-proposal-review.use-case';
import { ListTrainerProposalsUseCase } from './modules/evolution/application/use-cases/list-trainer-proposals.use-case';
import { ResolveProposalUseCase } from './modules/evolution/application/use-cases/resolve-proposal.use-case';
import { ProposalsController } from './modules/evolution/infrastructure/http/proposals.controller';
import { createProposalsRouter } from './modules/evolution/infrastructure/http/proposals.routes';
import { PrismaProposalsRepository } from './modules/evolution/infrastructure/persistence/prisma-proposals.repository';
import {
  SystemClock,
  type Clock,
} from './modules/routines/application/ports/clock';
import type { RoutinesRepository } from './modules/routines/application/ports/routines.repository';
import { DetectExpiredCyclesUseCase } from './modules/routines/application/use-cases/detect-expired-cycles.use-case';
import { GetActiveRoutineUseCase } from './modules/routines/application/use-cases/get-active-routine.use-case';
import { RoutinesController } from './modules/routines/infrastructure/http/routines.controller';
import { createRoutinesRouter } from './modules/routines/infrastructure/http/routines.routes';
import { PrismaRoutinesRepository } from './modules/routines/infrastructure/persistence/prisma-routines.repository';
import type { GenerationContextRepository } from './modules/routine-generations/application/ports/generation-context.repository';
import {
  CryptoIdGenerator,
  type IdGenerator,
} from './modules/routine-generations/application/ports/id-generator';
import type { LatestRoutineGenerationRepository } from './modules/routine-generations/application/ports/latest-routine-generation.repository';
import type { RoutineGenerationGateway } from './modules/routine-generations/application/ports/routine-generation.gateway';
import type { RoutineGenerationsRepository } from './modules/routine-generations/application/ports/routine-generations.repository';
import { GetLatestRoutineGenerationUseCase } from './modules/routine-generations/application/use-cases/get-latest-routine-generation.use-case';
import { GetRoutineGenerationUseCase } from './modules/routine-generations/application/use-cases/get-routine-generation.use-case';
import { RequestRoutineGenerationUseCase } from './modules/routine-generations/application/use-cases/request-routine-generation.use-case';
import { RoutineGenerationsController } from './modules/routine-generations/infrastructure/http/routine-generations.controller';
import { createRoutineGenerationsRouter } from './modules/routine-generations/infrastructure/http/routine-generations.routes';
import { PrismaGenerationContextRepository } from './modules/routine-generations/infrastructure/persistence/prisma-generation-context.repository';
import { PrismaLatestRoutineGenerationRepository } from './modules/routine-generations/infrastructure/persistence/prisma-latest-routine-generation.repository';
import { PrismaRoutineGenerationsRepository } from './modules/routine-generations/infrastructure/persistence/prisma-routine-generations.repository';
import type { StudentsRepository } from './modules/students/application/ports/students.repository';
import type { TrainerAssignments } from './modules/students/application/ports/trainer-assignments.port';
import { GetStudentStatusUseCase } from './modules/students/application/use-cases/get-student-status.use-case';
import { ListTrainerStudentsUseCase } from './modules/students/application/use-cases/list-trainer-students.use-case';
import { UnlockStudentUseCase } from './modules/students/application/use-cases/unlock-student.use-case';
import { StudentsController } from './modules/students/infrastructure/http/students.controller';
import { createStudentsRouter } from './modules/students/infrastructure/http/students.routes';
import { PrismaStudentsRepository } from './modules/students/infrastructure/persistence/prisma-students.repository';
import { PrismaTrainerAssignments } from './modules/students/infrastructure/persistence/prisma-trainer-assignments.repository';
import type { UsersRepository } from './modules/users/application/ports/users.repository';
import { BlockUserOnInactivityUseCase } from './modules/users/application/use-cases/block-user-on-inactivity.use-case';
import { UsersController } from './modules/users/infrastructure/http/users.controller';
import { createUsersRouter } from './modules/users/infrastructure/http/users.routes';
import { PrismaUsersRepository } from './modules/users/infrastructure/persistence/prisma-users.repository';
import { requireTrainerAssignment } from './shared/middleware/assignment.middleware';

class CorsOriginError extends Error {}

interface AppDependencies {
  allowedOrigins?: readonly string[];
  database?: HealthCheck;
  usersRepository?: UsersRepository;
  routinesRepository?: RoutinesRepository;
  studentsRepository?: StudentsRepository;
  proposalsRepository?: ProposalsRepository;
  trainerAssignments?: TrainerAssignments;
  clock?: Clock;
  generationContextRepository?: GenerationContextRepository;
  routineGenerationGateway?: RoutineGenerationGateway;
  routineGenerationsRepository?: RoutineGenerationsRepository;
  latestRoutineGenerationRepository?: LatestRoutineGenerationRepository;
  idGenerator?: IdGenerator;
  generationRetentionDays?: number;
  authUsersRepository?: AuthUsersRepository;
  sessionsRepository?: SessionsRepository;
  sessionTtlHours?: number;
}

function parseAllowedOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function createCorsOptions(allowedOrigins: readonly string[]): CorsOptions {
  const allowedOriginSet = new Set(allowedOrigins);

  return {
    credentials: true,
    origin(origin, callback) {
      if (origin === undefined || allowedOriginSet.has(origin)) {
        callback(null, true);
        return;
      }

      callback(new CorsOriginError('Origin is not allowed by CORS'));
    },
  };
}

export function createApp({
  allowedOrigins = parseAllowedOrigins(process.env.CORS_ORIGINS),
  database = databaseHealthCheck,
  usersRepository,
  routinesRepository,
  studentsRepository,
  proposalsRepository,
  trainerAssignments,
  clock,
  generationContextRepository,
  routineGenerationGateway,
  routineGenerationsRepository,
  latestRoutineGenerationRepository,
  idGenerator,
  generationRetentionDays = Number(
    process.env.AI_RESULT_RETENTION_DAYS ?? '30',
  ),
  authUsersRepository,
  sessionsRepository,
  sessionTtlHours = Number(process.env.AUTH_SESSION_TTL_HOURS ?? '12'),
}: AppDependencies = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.use(cors(createCorsOptions(allowedOrigins)));
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_request, response) => {
    response.status(200).json({ status: 'ok' });
  });

  app.get('/ready', async (_request, response) => {
    try {
      await database.check();
      response.status(200).json({ status: 'ready', database: 'up' });
    } catch {
      response.status(503).json({ status: 'unavailable', database: 'down' });
    }
  });

  const resolvedUsersRepository =
    usersRepository ?? new PrismaUsersRepository(prisma);
  const resolvedClock = clock ?? new SystemClock();
  const resolvedAuthRepository = new PrismaAuthRepository(prisma);
  const resolvedAuthUsers = authUsersRepository ?? resolvedAuthRepository;
  const resolvedSessions = sessionsRepository ?? resolvedAuthRepository;
  const getSessionUseCase = new GetSessionUseCase(
    resolvedAuthUsers,
    resolvedSessions,
    resolvedClock,
  );
  const authController = new AuthController(
    new LoginUseCase(
      resolvedAuthUsers,
      resolvedSessions,
      resolvedClock,
      sessionTtlHours,
    ),
    getSessionUseCase,
    new LogoutUseCase(resolvedSessions, resolvedClock),
  );

  app.use(createSessionMiddleware(getSessionUseCase));
  app.use(createAuthRouter(authController));
  const blockUserOnInactivityUseCase = new BlockUserOnInactivityUseCase(
    resolvedUsersRepository,
    resolvedClock,
  );
  const usersController = new UsersController(blockUserOnInactivityUseCase);
  const usersRouter = createUsersRouter(usersController);

  app.use(usersRouter);

  const resolvedAssignments =
    trainerAssignments ?? new PrismaTrainerAssignments(prisma);

  const resolvedRoutinesRepo =
    routinesRepository ?? new PrismaRoutinesRepository(prisma);
  const getActiveRoutineUseCase = new GetActiveRoutineUseCase(
    resolvedRoutinesRepo,
    resolvedClock,
  );
  const detectExpiredCyclesUseCase = new DetectExpiredCyclesUseCase(
    resolvedRoutinesRepo,
    resolvedClock,
  );
  const routinesController = new RoutinesController(
    getActiveRoutineUseCase,
    detectExpiredCyclesUseCase,
  );
  const routinesRouter = createRoutinesRouter(
    routinesController,
    requireTrainerAssignment(resolvedAssignments),
  );

  app.use(routinesRouter);

  const resolvedGenerationContextRepository =
    generationContextRepository ??
    new PrismaGenerationContextRepository(prisma);
  const resolvedRoutineGenerationGateway =
    routineGenerationGateway ?? createRoutineGenerationGatewayFromEnv();
  const resolvedRoutineGenerationsRepository =
    routineGenerationsRepository ??
    new PrismaRoutineGenerationsRepository(prisma);
  const resolvedIdGenerator = idGenerator ?? new CryptoIdGenerator();

  const requestRoutineGenerationUseCase = new RequestRoutineGenerationUseCase(
    resolvedGenerationContextRepository,
    resolvedRoutineGenerationsRepository,
    resolvedRoutineGenerationGateway,
    resolvedIdGenerator,
    resolvedClock,
    generationRetentionDays,
  );
  const getRoutineGenerationUseCase = new GetRoutineGenerationUseCase(
    resolvedRoutineGenerationsRepository,
  );
  const resolvedLatestRoutineGenerationRepository =
    latestRoutineGenerationRepository ??
    new PrismaLatestRoutineGenerationRepository(
      prisma,
      resolvedRoutineGenerationsRepository,
    );
  const getLatestRoutineGenerationUseCase =
    new GetLatestRoutineGenerationUseCase(
      resolvedLatestRoutineGenerationRepository,
    );
  const routineGenerationsController = new RoutineGenerationsController(
    requestRoutineGenerationUseCase,
    getRoutineGenerationUseCase,
    getLatestRoutineGenerationUseCase,
  );
  const routineGenerationsRouter = createRoutineGenerationsRouter(
    routineGenerationsController,
  );

  app.use(routineGenerationsRouter);

  const resolvedStudentsRepo =
    studentsRepository ?? new PrismaStudentsRepository(prisma);
  const studentsController = new StudentsController(
    new ListTrainerStudentsUseCase(resolvedStudentsRepo, resolvedClock),
    new GetStudentStatusUseCase(
      resolvedStudentsRepo,
      resolvedAssignments,
      resolvedClock,
    ),
    new UnlockStudentUseCase(
      resolvedStudentsRepo,
      resolvedAssignments,
      resolvedClock,
    ),
  );

  app.use(createStudentsRouter(studentsController));

  const resolvedProposalsRepo =
    proposalsRepository ?? new PrismaProposalsRepository(prisma);
  const proposalsController = new ProposalsController(
    new ListTrainerProposalsUseCase(resolvedProposalsRepo),
    new GetProposalReviewUseCase(resolvedProposalsRepo, resolvedAssignments),
    new ResolveProposalUseCase(
      resolvedProposalsRepo,
      resolvedAssignments,
      resolvedClock,
    ),
  );

  app.use(createProposalsRouter(proposalsController));

  const errorHandler: ErrorRequestHandler = (
    error,
    _request,
    response,
    _next,
  ) => {
    void _next;

    if (error instanceof CorsOriginError) {
      response.status(403).json({ error: 'origin_not_allowed' });
      return;
    }

    if (isInvalidJsonError(error)) {
      response.status(400).json({ error: 'invalid_json_body' });
      return;
    }

    console.error('Unhandled request error', error);
    response.status(500).json({ error: 'internal_server_error' });
  };

  app.use(errorHandler);

  return app;
}

function isInvalidJsonError(error: unknown): boolean {
  if (!(error instanceof SyntaxError)) {
    return false;
  }

  return (error as { status?: unknown }).status === 400;
}

export const app = createApp();

export default app;
