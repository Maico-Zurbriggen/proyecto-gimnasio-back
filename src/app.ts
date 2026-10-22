import { resolve } from 'node:path';
import {
  GenerationSettingsService,
  type GenerationSettingsRepository,
} from './modules/gyms/application/generation-settings.service';
import { PrismaGenerationSettingsRepository } from './modules/gyms/infrastructure/persistence/prisma-generation-settings.repository';
import { createGenerationSettingsRouter } from './modules/gyms/infrastructure/http/generation-settings.routes';
import type { ProposalRegenerationsRepository } from './modules/evolution/application/ports/proposal-regenerations.repository';
import { PrismaProposalRegenerationsRepository } from './modules/evolution/infrastructure/persistence/prisma-proposal-regenerations.repository';
import { RegenerateProposalUseCase } from './modules/evolution/application/use-cases/regenerate-proposal.use-case';
import { createProposalRegenerationsRouter } from './modules/evolution/infrastructure/http/proposal-regenerations.routes';
import type { ExerciseCatalogRepository } from './modules/exercise-catalog/application/catalog.repository';
import { ExerciseCatalogService } from './modules/exercise-catalog/application/catalog.service';
import { ExerciseCatalogController } from './modules/exercise-catalog/infrastructure/http/catalog.controller';
import { createExerciseCatalogRouter } from './modules/exercise-catalog/infrastructure/http/catalog.routes';
import { createCatalogMediaRouter } from './modules/exercise-catalog/infrastructure/http/catalog-media.routes';
import { PrismaExerciseCatalogRepository } from './modules/exercise-catalog/infrastructure/persistence/prisma-catalog.repository';
import cors, { type CorsOptions } from 'cors';
import express, { type ErrorRequestHandler } from 'express';

import {
  databaseHealthCheck,
  prisma,
  type HealthCheck,
} from './database/client';
import { isLocalGenerationTestingEnabled } from './database/local-generation-testing';
import { createRoutineGenerationGatewayFromEnv } from './integrations/ai/http-routine-generation.gateway';
import type { AuthRepository } from './modules/auth/application/ports/auth.repository';
import { LoginUseCase } from './modules/auth/application/use-cases/login.use-case';
import { LogoutUseCase } from './modules/auth/application/use-cases/logout.use-case';
import { ResolveSessionUseCase } from './modules/auth/application/use-cases/resolve-session.use-case';
import { AuthController } from './modules/auth/infrastructure/http/auth.controller';
import { createAuthRouter } from './modules/auth/infrastructure/http/auth.routes';
import { PrismaAuthRepository } from './modules/auth/infrastructure/persistence/prisma-auth.repository';
import type {
  PasswordRecoveryRepository,
  RecoveryMailer,
} from './modules/auth/application/ports/password-recovery.repository';
import {
  ChangePasswordUseCase,
  RequestPasswordRecoveryUseCase,
  ResetPasswordUseCase,
} from './modules/auth/application/use-cases/password-recovery.use-cases';
import { PasswordRecoveryController } from './modules/auth/infrastructure/http/password-recovery.controller';
import { createPasswordRecoveryRouter } from './modules/auth/infrastructure/http/password-recovery.routes';
import { PrismaPasswordRecoveryRepository } from './modules/auth/infrastructure/persistence/prisma-password-recovery.repository';
import { HttpRecoveryMailer } from './modules/auth/infrastructure/email/http-recovery.mailer';
import type { GoalsRepository } from './modules/goals/application/ports/goals.repository';
import { GoalsUseCases } from './modules/goals/application/use-cases/goals.use-cases';
import { GoalsController } from './modules/goals/infrastructure/http/goals.controller';
import { createGoalsRouter } from './modules/goals/infrastructure/http/goals.routes';
import { PrismaGoalsRepository } from './modules/goals/infrastructure/persistence/prisma-goals.repository';
import type { RoutineRenewalsRepository } from './modules/evolution/application/ports/routine-renewals.repository';
import { RenewRoutineCyclesUseCase } from './modules/evolution/application/use-cases/renew-routine-cycles.use-case';
import { createRoutineRenewalsRouter } from './modules/evolution/infrastructure/http/routine-renewals.routes';
import { PrismaRoutineRenewalsRepository } from './modules/evolution/infrastructure/persistence/prisma-routine-renewals.repository';
import type { ProposalsRepository } from './modules/evolution/application/ports/proposals.repository';
import { GetProposalReviewUseCase } from './modules/evolution/application/use-cases/get-proposal-review.use-case';
import { ListTrainerProposalsUseCase } from './modules/evolution/application/use-cases/list-trainer-proposals.use-case';
import { ResolveProposalUseCase } from './modules/evolution/application/use-cases/resolve-proposal.use-case';
import { ProposalsController } from './modules/evolution/infrastructure/http/proposals.controller';
import { createProposalsRouter } from './modules/evolution/infrastructure/http/proposals.routes';
import { PrismaProposalsRepository } from './modules/evolution/infrastructure/persistence/prisma-proposals.repository';
import {
  AssignmentsUseCases,
  type AssignmentsRepository,
} from './modules/assignments/application/assignments';
import { createAssignmentsRouter } from './modules/assignments/infrastructure/assignments.http';
import { PrismaAssignmentsRepository } from './modules/assignments/infrastructure/prisma-assignments.repository';
import {
  InventoryUseCases,
  type InventoryRepository,
} from './modules/inventory/application/inventory';
import { createInventoryRouter } from './modules/inventory/infrastructure/inventory.http';
import { PrismaInventoryRepository } from './modules/inventory/infrastructure/prisma-inventory.repository';
import type { GymsRepository } from './modules/gyms/application/ports/gyms.repository';
import type { InvitationMailer } from './modules/invitations/application/ports/invitation-mailer';
import type { TimezoneCatalog } from './modules/gyms/application/ports/timezone-catalog';
import {
  ListGymsUseCase,
  ListTimezonesUseCase,
  ReissueBootstrapInvitationUseCase,
  SetGymStatusUseCase,
  UpdateGymUseCase,
} from './modules/gyms/application/use-cases/manage-gyms.use-cases';
import { ProvisionGymUseCase } from './modules/gyms/application/use-cases/provision-gym.use-case';
import { createInvitationMailerFromEnv } from './modules/invitations/infrastructure/email/invitation-mailers';
import { GymsController } from './modules/gyms/infrastructure/http/gyms.controller';
import { createGymsRouter } from './modules/gyms/infrastructure/http/gyms.routes';
import { PrismaGymsRepository } from './modules/gyms/infrastructure/persistence/prisma-gyms.repository';
import { PrismaTimezoneCatalog } from './modules/gyms/infrastructure/persistence/prisma-timezone-catalog';
import type { AttemptLimiter } from './modules/invitations/application/ports/attempt-limiter';
import type { InvitationsRepository } from './modules/invitations/application/ports/invitations.repository';
import { CompleteAccountUseCase } from './modules/invitations/application/use-cases/complete-account.use-case';
import {
  IssueInvitationUseCase,
  ListInvitationsUseCase,
  ResendInvitationUseCase,
} from './modules/invitations/application/use-cases/issue-invitation.use-case';
import { RevokeInvitationUseCase } from './modules/invitations/application/use-cases/revoke-invitation.use-case';
import { ValidateInvitationUseCase } from './modules/invitations/application/use-cases/validate-invitation.use-case';
import { InvitationsController } from './modules/invitations/infrastructure/http/invitations.controller';
import { createAttemptLimit } from './modules/invitations/infrastructure/http/attempt-limit.middleware';
import { createInvitationsRouter } from './modules/invitations/infrastructure/http/invitations.routes';
import { InMemoryAttemptLimiter } from './modules/invitations/infrastructure/persistence/in-memory-attempt-limiter';
import { PrismaAttemptLimiter } from './modules/invitations/infrastructure/persistence/prisma-attempt-limiter';
import { PrismaInvitationsRepository } from './modules/invitations/infrastructure/persistence/prisma-invitations.repository';
import type { PhysicalConditionsRepository } from './modules/physical-conditions/application/ports/physical-conditions.repository';
import { CloseConditionUseCase } from './modules/physical-conditions/application/use-cases/close-condition.use-case';
import { DeclareConditionUseCase } from './modules/physical-conditions/application/use-cases/declare-condition.use-case';
import { ListConditionsUseCase } from './modules/physical-conditions/application/use-cases/list-conditions.use-case';
import { PhysicalConditionsController } from './modules/physical-conditions/infrastructure/http/physical-conditions.controller';
import { createPhysicalConditionsRouter } from './modules/physical-conditions/infrastructure/http/physical-conditions.routes';
import { ConditionsDeclarationUseCases } from './modules/physical-conditions/application/use-cases/conditions-declaration.use-cases';
import { PrismaPhysicalConditionsRepository } from './modules/physical-conditions/infrastructure/persistence/prisma-physical-conditions.repository';
import type { PrescriptionsRepository } from './modules/prescriptions/application/ports/prescriptions.repository';
import { AssignRoutineFromTemplateUseCase } from './modules/prescriptions/application/use-cases/assign-routine-from-template.use-case';
import { CreateManualRoutineUseCase } from './modules/prescriptions/application/use-cases/create-manual-routine.use-case';
import { CreateRoutineTemplateUseCase } from './modules/prescriptions/application/use-cases/create-routine-template.use-case';
import {
  GetRoutineContentUseCase,
  GetRoutineTemplateUseCase,
  ListPendingRoutineReviewsUseCase,
  ListRoutineTemplatesUseCase,
  ListStudentRoutinesUseCase,
} from './modules/prescriptions/application/use-cases/read-prescriptions.use-cases';
import { ReviewRoutineUseCase } from './modules/prescriptions/application/use-cases/review-routine.use-case';
import {
  SetRoutineTemplateActiveUseCase,
  UpdateRoutineTemplateUseCase,
} from './modules/prescriptions/application/use-cases/update-routine-template.use-case';
import { PrescriptionsController } from './modules/prescriptions/infrastructure/http/prescriptions.controller';
import { createPrescriptionsRouter } from './modules/prescriptions/infrastructure/http/prescriptions.routes';
import { PrismaPrescriptionsRepository } from './modules/prescriptions/infrastructure/persistence/prisma-prescriptions.repository';
import {
  SystemClock,
  type Clock,
} from './modules/routines/application/ports/clock';
import type { RoutinesRepository } from './modules/routines/application/ports/routines.repository';
import { GetActiveRoutineUseCase } from './modules/routines/application/use-cases/get-active-routine.use-case';
import { RoutinesController } from './modules/routines/infrastructure/http/routines.controller';
import { createRoutinesRouter } from './modules/routines/infrastructure/http/routines.routes';
import { PrismaRoutinesRepository } from './modules/routines/infrastructure/persistence/prisma-routines.repository';
import type { GenerationContextRepository } from './modules/routine-generations/application/ports/generation-context.repository';
import type { GeneratedRoutinesRepository } from './modules/routine-generations/application/ports/generated-routines.repository';
import {
  CryptoIdGenerator,
  type IdGenerator,
} from './modules/routine-generations/application/ports/id-generator';
import type { RoutineGenerationGateway } from './modules/routine-generations/application/ports/routine-generation.gateway';
import type { RoutineGenerationsRepository } from './modules/routine-generations/application/ports/routine-generations.repository';
import { GetRoutineGenerationUseCase } from './modules/routine-generations/application/use-cases/get-routine-generation.use-case';
import { FinalizeRoutineGenerationUseCase } from './modules/routine-generations/application/use-cases/finalize-routine-generation.use-case';
import { RequestRoutineGenerationUseCase } from './modules/routine-generations/application/use-cases/request-routine-generation.use-case';
import { RoutineGenerationsController } from './modules/routine-generations/infrastructure/http/routine-generations.controller';
import { createRoutineGenerationsRouter } from './modules/routine-generations/infrastructure/http/routine-generations.routes';
import { PrismaGenerationContextRepository } from './modules/routine-generations/infrastructure/persistence/prisma-generation-context.repository';
import { PrismaGeneratedRoutinesRepository } from './modules/routine-generations/infrastructure/persistence/prisma-generated-routines.repository';
import { PrismaRoutineGenerationsRepository } from './modules/routine-generations/infrastructure/persistence/prisma-routine-generations.repository';
import type { MeasurementsRepository } from './modules/measurements/application/ports/measurements.repository';
import { RecordMeasurementUseCase } from './modules/measurements/application/use-cases/record-measurement.use-case';
import { MeasurementsController } from './modules/measurements/infrastructure/http/measurements.controller';
import { createMeasurementsRouter } from './modules/measurements/infrastructure/http/measurements.routes';
import { PrismaMeasurementsRepository } from './modules/measurements/infrastructure/persistence/prisma-measurements.repository';
import {
  StudentContextUseCases,
  type StudentContextRepository,
} from './modules/student-context/application/student-context.use-cases';
import {
  GetAdherenceUseCase,
  GetSessionComplianceUseCase,
  GetSignalsUseCase,
  type IndicatorsRepository,
} from './modules/indicators/application/indicators.use-cases';
import { createIndicatorsRouter } from './modules/indicators/infrastructure/indicators.http';
import { PrismaIndicatorsRepository } from './modules/indicators/infrastructure/prisma-indicators.repository';
import {
  GetSetPreloadUseCase,
  type SetPreloadRepository,
} from './modules/training-sessions/application/set-preload.use-cases';
import { PrismaSetPreloadRepository } from './modules/training-sessions/infrastructure/prisma-set-preload.repository';
import { createTrainingSessionsRouter as createSetPreloadRouter } from './modules/training-sessions/infrastructure/training-sessions.http';
import { PrismaStudentContextRepository } from './modules/student-context/infrastructure/prisma-student-context.repository';
import { createStudentContextRouter } from './modules/student-context/infrastructure/student-context.http';
import type { StudentsRepository } from './modules/students/application/ports/students.repository';
import type { MeasurementCheckpointsRepository } from './modules/students/application/ports/measurement-checkpoints.repository';
import type { StudentMeasurementAccess } from './modules/students/application/ports/student-measurement-access.port';
import type { TrainerAssignments } from './modules/students/application/ports/trainer-assignments.port';
import { EvaluateMeasurementCheckpointsUseCase } from './modules/students/application/use-cases/evaluate-measurement-checkpoints.use-case';
import { GetOwnMeasurementBlockUseCase } from './modules/students/application/use-cases/get-own-measurement-block.use-case';
import { GetStudentStatusUseCase } from './modules/students/application/use-cases/get-student-status.use-case';
import { ListTrainerStudentsUseCase } from './modules/students/application/use-cases/list-trainer-students.use-case';
import { UnlockStudentUseCase } from './modules/students/application/use-cases/unlock-student.use-case';
import { StudentsController } from './modules/students/infrastructure/http/students.controller';
import { createStudentsRouter } from './modules/students/infrastructure/http/students.routes';
import { MeasurementCheckpointsController } from './modules/students/infrastructure/http/measurement-checkpoints.controller';
import { createMeasurementCheckpointsRouter } from './modules/students/infrastructure/http/measurement-checkpoints.routes';
import { PrismaMeasurementCheckpointsRepository } from './modules/students/infrastructure/persistence/prisma-measurement-checkpoints.repository';
import { PrismaStudentMeasurementAccess } from './modules/students/infrastructure/persistence/prisma-student-measurement-access';
import { PrismaStudentsRepository } from './modules/students/infrastructure/persistence/prisma-students.repository';
import { PrismaTrainerAssignments } from './modules/students/infrastructure/persistence/prisma-trainer-assignments.repository';
import type { UsersRepository } from './modules/users/application/ports/users.repository';
import { BlockUserOnInactivityUseCase } from './modules/users/application/use-cases/block-user-on-inactivity.use-case';
import { UsersController } from './modules/users/infrastructure/http/users.controller';
import { createUsersRouter } from './modules/users/infrastructure/http/users.routes';
import { PrismaUsersRepository } from './modules/users/infrastructure/persistence/prisma-users.repository';
import type { TrainingSessionsRepository } from './modules/training-sessions/application/ports/training-sessions.repository';
import {
  AbandonTrainingSessionUseCase,
  ExpireTrainingSessionsUseCase,
  FinishTrainingSessionUseCase,
  GetActiveTrainingSessionUseCase,
  GetTrainingSessionUseCase,
  ListTrainingSessionsUseCase,
  StartTrainingSessionUseCase,
  UpdateSeriesUseCase,
} from './modules/training-sessions/application/use-cases/training-sessions.use-cases';
import { TrainingSessionsController } from './modules/training-sessions/infrastructure/http/training-sessions.controller';
import { createTrainingSessionsRouter } from './modules/training-sessions/infrastructure/http/training-sessions.routes';
import { PrismaTrainingSessionsRepository } from './modules/training-sessions/infrastructure/persistence/prisma-training-sessions.repository';
import { createAuthenticate } from './shared/middleware/auth.middleware';
import { requireTrainerAssignment } from './shared/middleware/assignment.middleware';
import { requireStudentMeasurementAccess } from './shared/middleware/student-measurement-access.middleware';

class CorsOriginError extends Error {}

interface AppDependencies {
  passwordRecoveryRepository?: PasswordRecoveryRepository;
  recoveryMailer?: RecoveryMailer;
  goalsRepository?: GoalsRepository;
  generationSettingsRepository?: GenerationSettingsRepository;
  proposalRegenerationsRepository?: ProposalRegenerationsRepository;
  exerciseCatalogRepository?: ExerciseCatalogRepository;
  catalogAssetsDirectory?: string;
  localGenerationTesting?: boolean;
  allowedOrigins?: readonly string[];
  database?: HealthCheck;
  usersRepository?: UsersRepository;
  authRepository?: AuthRepository;
  routinesRepository?: RoutinesRepository;
  studentsRepository?: StudentsRepository;
  measurementCheckpointsRepository?: MeasurementCheckpointsRepository;
  studentMeasurementAccess?: StudentMeasurementAccess;
  measurementsRepository?: MeasurementsRepository;
  proposalsRepository?: ProposalsRepository;
  routineRenewalsRepository?: RoutineRenewalsRepository;
  invitationsRepository?: InvitationsRepository;
  physicalConditionsRepository?: PhysicalConditionsRepository;
  invitationAttemptLimiter?: AttemptLimiter;
  gymsRepository?: GymsRepository;
  timezoneCatalog?: TimezoneCatalog;
  invitationMailer?: InvitationMailer;
  studentContextRepository?: StudentContextRepository;
  indicatorsRepository?: IndicatorsRepository;
  setPreloadRepository?: SetPreloadRepository;
  assignmentsRepository?: AssignmentsRepository;
  inventoryRepository?: InventoryRepository;
  prescriptionsRepository?: PrescriptionsRepository;
  trainerAssignments?: TrainerAssignments;
  clock?: Clock;
  generationContextRepository?: GenerationContextRepository;
  routineGenerationGateway?: RoutineGenerationGateway;
  routineGenerationsRepository?: RoutineGenerationsRepository;
  generatedRoutinesRepository?: GeneratedRoutinesRepository;
  trainingSessionsRepository?: TrainingSessionsRepository;
  idGenerator?: IdGenerator;
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
  passwordRecoveryRepository,
  recoveryMailer,
  goalsRepository,
  generationSettingsRepository,
  proposalRegenerationsRepository,
  exerciseCatalogRepository,
  catalogAssetsDirectory = process.env.CATALOG_ASSETS_DIR ??
    resolve(process.cwd(), '.catalog-private/assets'),
  localGenerationTesting = isLocalGenerationTestingEnabled(),
  allowedOrigins = parseAllowedOrigins(process.env.CORS_ORIGINS),
  database = databaseHealthCheck,
  usersRepository,
  authRepository,
  routinesRepository,
  studentsRepository,
  measurementCheckpointsRepository,
  studentMeasurementAccess,
  measurementsRepository,
  proposalsRepository,
  routineRenewalsRepository,
  invitationsRepository,
  physicalConditionsRepository,
  invitationAttemptLimiter,
  gymsRepository,
  timezoneCatalog,
  invitationMailer,
  studentContextRepository,
  indicatorsRepository,
  setPreloadRepository,
  assignmentsRepository,
  inventoryRepository,
  prescriptionsRepository,
  trainerAssignments,
  clock,
  generationContextRepository,
  routineGenerationGateway,
  routineGenerationsRepository,
  generatedRoutinesRepository,
  trainingSessionsRepository,
  idGenerator,
}: AppDependencies = {}) {
  const app = express();

  app.disable('x-powered-by');
  // Configurar sólo según la topología del proxy que realmente protege la API.
  const proxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
  if (Number.isInteger(proxyHops) && proxyHops > 0 && proxyHops <= 5)
    app.set('trust proxy', proxyHops);
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

  // HU07 - T2 y T5: la cookie de sesión se resuelve una vez, antes de los routers,
  // para que el `authenticate` que cada módulo ya importa encuentre `req.user`
  // resuelto y no haya que tocar sus rutas.
  const resolvedAuthRepo = authRepository ?? new PrismaAuthRepository(prisma);
  const authenticateWithSession = createAuthenticate(
    new ResolveSessionUseCase(resolvedAuthRepo, resolvedClock),
  );

  app.use(authenticateWithSession);
  const recoveryRepo =
    passwordRecoveryRepository ?? new PrismaPasswordRecoveryRepository(prisma);
  app.use(
    createPasswordRecoveryRouter(
      new PasswordRecoveryController(
        new RequestPasswordRecoveryUseCase(
          recoveryRepo,
          recoveryMailer ?? new HttpRecoveryMailer(),
          resolvedClock,
        ),
        new ResetPasswordUseCase(recoveryRepo, resolvedClock),
        new ChangePasswordUseCase(recoveryRepo, resolvedClock),
      ),
    ),
  );
  app.use(
    createGoalsRouter(
      new GoalsController(
        new GoalsUseCases(goalsRepository ?? new PrismaGoalsRepository(prisma)),
      ),
    ),
  );

  app.use(
    createAuthRouter(
      new AuthController(
        new LoginUseCase(resolvedAuthRepo, resolvedClock),
        new LogoutUseCase(resolvedAuthRepo, resolvedClock),
      ),
      authenticateWithSession,
    ),
  );

  // HU06: completar la cuenta desde la invitación. Va junto al router de auth
  // porque comparte su mecanismo de sesión: al completarla se emite la misma
  // cookie que emite el login.
  // El correo con el enlace lo usan la emisión (FL-19) y el aprovisionamiento
  // del primer administrador (HU13).
  const resolvedInvitationMailer =
    invitationMailer ?? createInvitationMailerFromEnv();
  const resolvedInvitationsRepo =
    invitationsRepository ?? new PrismaInvitationsRepository(prisma);
  app.use(
    createInvitationsRouter(
      new InvitationsController(
        new ValidateInvitationUseCase(resolvedInvitationsRepo, resolvedClock),
        new CompleteAccountUseCase(
          resolvedInvitationsRepo,
          resolvedAuthRepo,
          resolvedClock,
        ),
        new IssueInvitationUseCase(
          resolvedInvitationsRepo,
          resolvedInvitationMailer,
          resolvedClock,
        ),
        new ListInvitationsUseCase(resolvedInvitationsRepo, resolvedClock),
        new RevokeInvitationUseCase(resolvedInvitationsRepo, resolvedClock),
        new ResendInvitationUseCase(
          resolvedInvitationsRepo,
          resolvedInvitationMailer,
          resolvedClock,
        ),
      ),
      createAttemptLimit(
        invitationAttemptLimiter ??
          (process.env.NODE_ENV === 'test'
            ? new InMemoryAttemptLimiter()
            : new PrismaAttemptLimiter(prisma)),
        resolvedClock,
      ),
    ),
  );

  // HU13: aprovisionamiento de gimnasios por el SuperAdmin.
  const resolvedGymsRepo = gymsRepository ?? new PrismaGymsRepository(prisma);
  const resolvedTimezones =
    timezoneCatalog ?? new PrismaTimezoneCatalog(prisma);
  app.use(
    createGymsRouter(
      new GymsController(
        new ProvisionGymUseCase(
          resolvedGymsRepo,
          resolvedTimezones,
          resolvedInvitationMailer,
          resolvedClock,
        ),
        new ListGymsUseCase(resolvedGymsRepo, resolvedClock),
        new ReissueBootstrapInvitationUseCase(
          resolvedGymsRepo,
          resolvedInvitationMailer,
          resolvedClock,
        ),
        new ListTimezonesUseCase(resolvedTimezones),
        new UpdateGymUseCase(
          resolvedGymsRepo,
          resolvedTimezones,
          resolvedClock,
        ),
        new SetGymStatusUseCase(resolvedGymsRepo, resolvedClock),
      ),
    ),
  );

  // RF-066: el administrador asigna y cambia el entrenador de cada alumno.
  app.use(
    createAssignmentsRouter(
      new AssignmentsUseCases(
        assignmentsRepository ?? new PrismaAssignmentsRepository(prisma),
      ),
    ),
  );

  // FL-20 / CB-59: inventario del gimnasio y primeros pasos del administrador.
  app.use(
    createInventoryRouter(
      new InventoryUseCases(
        inventoryRepository ?? new PrismaInventoryRepository(prisma),
      ),
    ),
  );

  // FL-01: puesta en contexto del alumno recién dado de alta.
  app.use(
    createStudentContextRouter(
      new StudentContextUseCases(
        studentContextRepository ?? new PrismaStudentContextRepository(prisma),
        resolvedClock,
      ),
    ),
  );

  // HU23: adherencia y cumplimiento derivados de lo registrado.
  const resolvedIndicatorsRepo =
    indicatorsRepository ?? new PrismaIndicatorsRepository(prisma);
  app.use(
    createIndicatorsRouter(
      new GetAdherenceUseCase(resolvedIndicatorsRepo, resolvedClock),
      new GetSessionComplianceUseCase(resolvedIndicatorsRepo, resolvedClock),
      new GetSignalsUseCase(resolvedIndicatorsRepo, resolvedClock),
      trainerAssignments ?? new PrismaTrainerAssignments(prisma),
    ),
  );

  // HU22 - T2: precarga de las series con la última ejecución del alumno.
  app.use(
    createSetPreloadRouter(
      new GetSetPreloadUseCase(
        setPreloadRepository ?? new PrismaSetPreloadRepository(prisma),
        resolvedClock,
      ),
    ),
  );

  // HU11: declaración, historial y cierre de condiciones físicas.
  const resolvedConditionsRepo =
    physicalConditionsRepository ??
    new PrismaPhysicalConditionsRepository(prisma);
  app.use(
    createPhysicalConditionsRouter(
      new PhysicalConditionsController(
        new DeclareConditionUseCase(resolvedConditionsRepo, resolvedClock),
        new ListConditionsUseCase(resolvedConditionsRepo, resolvedClock),
        new CloseConditionUseCase(resolvedConditionsRepo, resolvedClock),
        new ConditionsDeclarationUseCases(
          resolvedConditionsRepo,
          resolvedClock,
        ),
      ),
      // HU11 - criterios 17 y 18: sin excepción para el administrador.
      requireTrainerAssignment(
        trainerAssignments ?? new PrismaTrainerAssignments(prisma),
        'studentId',
        false,
      ),
    ),
  );

  const blockUserOnInactivityUseCase = new BlockUserOnInactivityUseCase(
    resolvedUsersRepository,
    resolvedClock,
  );
  const usersController = new UsersController(blockUserOnInactivityUseCase);
  const usersRouter = createUsersRouter(usersController);

  app.use(usersRouter);

  const resolvedAssignments =
    trainerAssignments ?? new PrismaTrainerAssignments(prisma);
  const resolvedStudentMeasurementAccess =
    studentMeasurementAccess ??
    (process.env.NODE_ENV === 'test'
      ? { findActiveBlockState: async () => null }
      : new PrismaStudentMeasurementAccess(prisma));
  const requireMeasurementAccess = requireStudentMeasurementAccess(
    resolvedStudentMeasurementAccess,
  );

  app.use(
    createExerciseCatalogRouter(
      new ExerciseCatalogController(
        new ExerciseCatalogService(
          exerciseCatalogRepository ??
            new PrismaExerciseCatalogRepository(prisma),
        ),
      ),
      requireMeasurementAccess,
    ),
  );
  app.use(createCatalogMediaRouter(prisma, catalogAssetsDirectory));

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
    requireMeasurementAccess,
  );

  app.use(routinesRouter);

  // CAP-4: asignar una plantilla como rutina del alumno, revisarla y leerla.
  // Se registra después del router de rutinas para que `/routines/active` gane
  // el match frente a `/routines/:routineId`.
  const resolvedPrescriptionsRepo =
    prescriptionsRepository ?? new PrismaPrescriptionsRepository(prisma);
  app.use(
    createPrescriptionsRouter(
      new PrescriptionsController(
        new ListRoutineTemplatesUseCase(resolvedPrescriptionsRepo),
        new AssignRoutineFromTemplateUseCase(resolvedPrescriptionsRepo),
        new ListStudentRoutinesUseCase(resolvedPrescriptionsRepo),
        new GetRoutineContentUseCase(resolvedPrescriptionsRepo),
        new ReviewRoutineUseCase(resolvedPrescriptionsRepo),
        new GetRoutineTemplateUseCase(resolvedPrescriptionsRepo),
        new CreateRoutineTemplateUseCase(resolvedPrescriptionsRepo),
        new UpdateRoutineTemplateUseCase(resolvedPrescriptionsRepo),
        new SetRoutineTemplateActiveUseCase(resolvedPrescriptionsRepo),
        new CreateManualRoutineUseCase(resolvedPrescriptionsRepo),
        new ListPendingRoutineReviewsUseCase(resolvedPrescriptionsRepo),
      ),
      requireTrainerAssignment(resolvedAssignments),
      requireMeasurementAccess,
    ),
  );

  const resolvedGenerationContextRepository =
    generationContextRepository ??
    new PrismaGenerationContextRepository(prisma);
  const resolvedRoutineGenerationGateway =
    routineGenerationGateway ?? createRoutineGenerationGatewayFromEnv();
  const resolvedRoutineGenerationsRepository =
    routineGenerationsRepository ??
    new PrismaRoutineGenerationsRepository(prisma);
  const resolvedIdGenerator = idGenerator ?? new CryptoIdGenerator();
  const resolvedGeneratedRoutinesRepository =
    generatedRoutinesRepository ??
    new PrismaGeneratedRoutinesRepository(prisma, localGenerationTesting);

  const requestRoutineGenerationUseCase = new RequestRoutineGenerationUseCase(
    resolvedGenerationContextRepository,
    resolvedRoutineGenerationGateway,
    resolvedIdGenerator,
    resolvedClock,
    resolvedRoutineGenerationsRepository,
    localGenerationTesting,
  );
  const getRoutineGenerationUseCase = new GetRoutineGenerationUseCase(
    resolvedRoutineGenerationsRepository,
  );
  const routineGenerationsController = new RoutineGenerationsController(
    requestRoutineGenerationUseCase,
    getRoutineGenerationUseCase,
    new FinalizeRoutineGenerationUseCase(resolvedGeneratedRoutinesRepository),
  );
  const routineGenerationsRouter = createRoutineGenerationsRouter(
    routineGenerationsController,
    requireMeasurementAccess,
    requireTrainerAssignment(resolvedAssignments),
  );

  app.use(routineGenerationsRouter);

  const resolvedStudentsRepo =
    studentsRepository ?? new PrismaStudentsRepository(prisma);
  const studentsController = new StudentsController(
    new ListTrainerStudentsUseCase(resolvedStudentsRepo, resolvedClock),
    new GetStudentStatusUseCase(resolvedStudentsRepo, resolvedAssignments),
    new GetOwnMeasurementBlockUseCase(resolvedStudentsRepo),
    new UnlockStudentUseCase(resolvedStudentsRepo, resolvedClock),
  );

  app.use(createStudentsRouter(studentsController));

  const resolvedMeasurementCheckpointsRepo =
    measurementCheckpointsRepository ??
    new PrismaMeasurementCheckpointsRepository(prisma);
  app.use(
    createMeasurementCheckpointsRouter(
      new MeasurementCheckpointsController(
        new EvaluateMeasurementCheckpointsUseCase(
          resolvedMeasurementCheckpointsRepo,
          resolvedClock,
        ),
      ),
    ),
  );

  app.use(
    createRoutineRenewalsRouter(
      new RenewRoutineCyclesUseCase(
        routineRenewalsRepository ??
          new PrismaRoutineRenewalsRepository(prisma),
        new EvaluateMeasurementCheckpointsUseCase(
          resolvedMeasurementCheckpointsRepo,
          resolvedClock,
        ),
        requestRoutineGenerationUseCase,
        resolvedRoutineGenerationGateway,
        resolvedClock,
      ),
    ),
  );

  // HU02 - T1: carga de medidas del alumno desde el aviso de renovación.
  const resolvedMeasurementsRepo =
    measurementsRepository ?? new PrismaMeasurementsRepository(prisma);
  const measurementsController = new MeasurementsController(
    new RecordMeasurementUseCase(resolvedMeasurementsRepo, resolvedClock),
  );

  app.use(createMeasurementsRouter(measurementsController));

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
  // RF-027 — Ciclo de vida de la sesión (FL-05, FL-07, RN-50 a RN-61).
  // Pausar no es una transición: es estado local del cliente (CB-25, FL-07).
  const resolvedTrainingSessionsRepo =
    trainingSessionsRepository ?? new PrismaTrainingSessionsRepository(prisma);
  const trainingSessionsController = new TrainingSessionsController(
    new StartTrainingSessionUseCase(
      resolvedTrainingSessionsRepo,
      resolvedClock,
    ),
    new GetActiveTrainingSessionUseCase(
      resolvedTrainingSessionsRepo,
      resolvedClock,
    ),
    new UpdateSeriesUseCase(resolvedTrainingSessionsRepo, resolvedClock),
    new FinishTrainingSessionUseCase(
      resolvedTrainingSessionsRepo,
      resolvedClock,
    ),
    new AbandonTrainingSessionUseCase(
      resolvedTrainingSessionsRepo,
      resolvedClock,
    ),
    new ExpireTrainingSessionsUseCase(
      resolvedTrainingSessionsRepo,
      resolvedClock,
    ),
    new ListTrainingSessionsUseCase(
      resolvedTrainingSessionsRepo,
      resolvedClock,
    ),
    new GetTrainingSessionUseCase(resolvedTrainingSessionsRepo, resolvedClock),
  );
  app.use(
    createTrainingSessionsRouter(
      trainingSessionsController,
      requireMeasurementAccess,
      requireTrainerAssignment(resolvedAssignments),
    ),
  );
  app.use(
    createGenerationSettingsRouter(
      new GenerationSettingsService(
        generationSettingsRepository ??
          new PrismaGenerationSettingsRepository(prisma),
      ),
    ),
  );
  app.use(
    createProposalRegenerationsRouter(
      new RegenerateProposalUseCase(
        proposalRegenerationsRepository ??
          new PrismaProposalRegenerationsRepository(prisma),
        resolvedProposalsRepo,
        resolvedAssignments,
        requestRoutineGenerationUseCase,
        resolvedRoutineGenerationGateway,
        resolvedClock,
      ),
    ),
  );

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

    // Un error de infraestructura puede incluir argumentos Prisma con secretos.
    console.error('Unhandled request error', error);
    response.status(500).json({ error: 'internal_server_error' });
  };

  app.use(errorHandler);

  return app;
}

export const app = createApp();

export default app;
