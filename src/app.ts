import cors, { type CorsOptions } from 'cors';
import express, { type ErrorRequestHandler } from 'express';

import {
  databaseHealthCheck,
  prisma,
  type HealthCheck,
} from './database/client';
import type { ProposalsRepository } from './modules/evolution/application/ports/proposals.repository';
import { GetProposalReviewUseCase } from './modules/evolution/application/use-cases/get-proposal-review.use-case';
import { ListTrainerProposalsUseCase } from './modules/evolution/application/use-cases/list-trainer-proposals.use-case';
import { ResolveProposalUseCase } from './modules/evolution/application/use-cases/resolve-proposal.use-case';
import { ProposalsController } from './modules/evolution/infrastructure/http/proposals.controller';
import { createProposalsRouter } from './modules/evolution/infrastructure/http/proposals.routes';
import { PrismaProposalsRepository } from './modules/evolution/infrastructure/persistence/prisma-proposals.repository';
import type { InvitationsRepository } from './modules/invitations/application/ports/invitations.repository';
import { CompleteAccountUseCase } from './modules/invitations/application/use-cases/complete-account.use-case';
import { ValidateInvitationUseCase } from './modules/invitations/application/use-cases/validate-invitation.use-case';
import { InvitationsController } from './modules/invitations/infrastructure/http/invitations.controller';
import { createInvitationsRouter } from './modules/invitations/infrastructure/http/invitations.routes';
import { PrismaInvitationsRepository } from './modules/invitations/infrastructure/persistence/prisma-invitations.repository';
import {
  SystemClock,
  type Clock,
} from './modules/routines/application/ports/clock';
import type { RoutinesRepository } from './modules/routines/application/ports/routines.repository';
import { GetActiveRoutineUseCase } from './modules/routines/application/use-cases/get-active-routine.use-case';
import { RoutinesController } from './modules/routines/infrastructure/http/routines.controller';
import { createRoutinesRouter } from './modules/routines/infrastructure/http/routines.routes';
import { PrismaRoutinesRepository } from './modules/routines/infrastructure/persistence/prisma-routines.repository';
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
  invitationsRepository?: InvitationsRepository;
  trainerAssignments?: TrainerAssignments;
  clock?: Clock;
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
  invitationsRepository,
  trainerAssignments,
  clock,
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
  const routinesController = new RoutinesController(getActiveRoutineUseCase);
  const routinesRouter = createRoutinesRouter(
    routinesController,
    requireTrainerAssignment(resolvedAssignments),
  );

  app.use(routinesRouter);

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

  const resolvedInvitationsRepo =
    invitationsRepository ?? new PrismaInvitationsRepository(prisma);
  const invitationsController = new InvitationsController(
    new ValidateInvitationUseCase(resolvedInvitationsRepo, resolvedClock),
    new CompleteAccountUseCase(resolvedInvitationsRepo, resolvedClock),
  );

  app.use(createInvitationsRouter(invitationsController));

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

    console.error('Unhandled request error', error);
    response.status(500).json({ error: 'internal_server_error' });
  };

  app.use(errorHandler);

  return app;
}

export const app = createApp();

export default app;
