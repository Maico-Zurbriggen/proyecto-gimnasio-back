-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "ai_integration";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "app";

-- CreateEnum
CREATE TYPE "app"."GymAffiliationStatus" AS ENUM ('AFFILIATED');

-- CreateEnum
CREATE TYPE "app"."InvitationStatus" AS ENUM ('VIGENTE', 'USADA', 'REVOCADA', 'CADUCADA');

-- CreateEnum
CREATE TYPE "app"."UserRole" AS ENUM ('ALUMNO', 'ENTRENADOR', 'ADMINISTRADOR');

-- CreateEnum
CREATE TYPE "app"."UserState" AS ENUM ('ACTIVO', 'SUSPENDIDO');

-- CreateEnum
CREATE TYPE "app"."ConsentType" AS ENUM ('DATOS_SALUD');

-- CreateEnum
CREATE TYPE "app"."ExperienceLevel" AS ENUM ('PRINCIPIANTE', 'INTERMEDIO', 'AVANZADO');

-- CreateEnum
CREATE TYPE "app"."TrainingPurpose" AS ENUM ('FUERZA', 'HIPERTROFIA', 'RESISTENCIA_MUSCULAR', 'ACONDICIONAMIENTO_GENERAL');

-- CreateEnum
CREATE TYPE "app"."ConditionSeverity" AS ENUM ('LEVE', 'MODERADA', 'SEVERA');

-- CreateEnum
CREATE TYPE "app"."BodyMeasurementType" AS ENUM ('PESO_CORPORAL', 'PERIMETRO_CINTURA', 'PERIMETRO_CADERA', 'PERIMETRO_BRAZO', 'PERIMETRO_MUSLO', 'PERIMETRO_PECHO');

-- CreateEnum
CREATE TYPE "app"."MovementPattern" AS ENUM ('EMPUJE_HORIZONTAL', 'EMPUJE_VERTICAL', 'TRACCION_HORIZONTAL', 'TRACCION_VERTICAL', 'DOMINANTE_RODILLA', 'DOMINANTE_CADERA', 'CORE', 'AISLAMIENTO_SUPERIOR', 'AISLAMIENTO_INFERIOR');

-- CreateEnum
CREATE TYPE "app"."ExerciseOrigin" AS ENUM ('CATALOGO_BASE', 'GIMNASIO');

-- CreateEnum
CREATE TYPE "app"."MuscleParticipation" AS ENUM ('PRIMARIA', 'SECUNDARIA');

-- CreateEnum
CREATE TYPE "app"."RoutineOrigin" AS ENUM ('PLANTILLA_ENTRENADOR', 'GENERADA');

-- CreateEnum
CREATE TYPE "app"."RoutineState" AS ENUM ('PROPUESTA', 'BLOQUEADA', 'VIGENTE', 'RECHAZADA', 'DESCARTADA', 'ARCHIVADA');

-- CreateEnum
CREATE TYPE "app"."RoutineReviewResult" AS ENUM ('APROBADA', 'APROBADA_CON_CAMBIOS', 'RECHAZADA');

-- CreateEnum
CREATE TYPE "app"."CompatibilityState" AS ENUM ('COMPATIBLE', 'ADVERTIDO', 'INCOMPATIBLE');

-- CreateEnum
CREATE TYPE "app"."TrainingSessionState" AS ENUM ('EN_CURSO', 'COMPLETADA', 'ABANDONADA', 'BLOQUEADA');

-- CreateEnum
CREATE TYPE "app"."NoticeType" AS ENUM ('RUTINA_PROPUESTA_PENDIENTE', 'RUTINA_EN_VIGENCIA', 'RUTINA_RECHAZADA', 'RUTINA_AJUSTADA', 'PROPUESTA_PENDIENTE', 'RECORD_ALCANZADO', 'SENAL_DETECTADA', 'INCOMPATIBILIDAD_SOBREVENIDA', 'APTITUD_POR_VENCER');

-- CreateEnum
CREATE TYPE "app"."EvolutionSituation" AS ENUM ('DATOS_INSUFICIENTES', 'SOBREEXIGENCIA', 'PROGRESION_ADECUADA', 'ESTIMULO_INSUFICIENTE', 'ESTANCAMIENTO');

-- CreateEnum
CREATE TYPE "app"."AdaptationProposalState" AS ENUM ('PENDIENTE', 'BLOQUEADA', 'ACEPTADA_TOTAL', 'ACEPTADA_PARCIAL', 'RECHAZADA', 'INVALIDADA', 'CADUCADA');

-- CreateEnum
CREATE TYPE "app"."AdjustmentType" AS ENUM ('CARGA', 'VOLUMEN', 'ESQUEMA', 'SUSTITUCION', 'ESTRUCTURA');

-- CreateEnum
CREATE TYPE "app"."ProposedAdjustmentState" AS ENUM ('PENDIENTE', 'ACEPTADO', 'RECHAZADO');

-- CreateEnum
CREATE TYPE "app"."PersonalRecordType" AS ENUM ('CARGA_MAXIMA_ESTIMADA', 'CARGA_MOVILIZADA', 'REPETICIONES');

-- CreateEnum
CREATE TYPE "ai_integration"."AiGenerationRequestState" AS ENUM ('PENDIENTE', 'PROCESANDO', 'COMPLETADA', 'NO_DISPONIBLE', 'CANCELADA');

-- CreateEnum
CREATE TYPE "ai_integration"."AiGenerationAttemptState" AS ENUM ('PENDIENTE', 'PROCESANDO', 'COMPLETADO', 'FALLIDO', 'AGOTADO_POR_TIEMPO', 'SALIDA_INVALIDA');

-- CreateTable
CREATE TABLE "app"."gyms" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "affiliation_status" "app"."GymAffiliationStatus" NOT NULL DEFAULT 'AFFILIATED',
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "gyms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."invitations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "gym_id" UUID NOT NULL,
    "issued_by_user_id" UUID NOT NULL,
    "email_normalized" TEXT NOT NULL,
    "status" "app"."InvitationStatus" NOT NULL DEFAULT 'VIGENTE',
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."invitation_roles" (
    "invitation_id" UUID NOT NULL,
    "role" "app"."UserRole" NOT NULL,

    CONSTRAINT "invitation_roles_pkey" PRIMARY KEY ("invitation_id","role")
);

-- CreateTable
CREATE TABLE "app"."users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "gym_id" UUID NOT NULL,
    "invitation_id" UUID,
    "email_normalized" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "state" "app"."UserState" NOT NULL DEFAULT 'ACTIVO',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."user_roles" (
    "user_id" UUID NOT NULL,
    "role" "app"."UserRole" NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role")
);

-- CreateTable
CREATE TABLE "app"."consents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" "app"."ConsentType" NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "accepted_text" TEXT NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."auth_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "last_activity_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."password_reset_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."equipment" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL,

    CONSTRAINT "equipment_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "app"."muscle_groups" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL,

    CONSTRAINT "muscle_groups_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "app"."joints" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL,

    CONSTRAINT "joints_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "app"."student_profiles" (
    "user_id" UUID NOT NULL,
    "birth_date" DATE NOT NULL,
    "sex" TEXT NOT NULL,
    "height_cm" DECIMAL(5,2) NOT NULL,
    "experience_level" "app"."ExperienceLevel" NOT NULL,
    "available_days_per_week" INTEGER NOT NULL,

    CONSTRAINT "student_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "app"."trainer_profiles" (
    "user_id" UUID NOT NULL,
    "specialty" TEXT NOT NULL,
    "experience_years" INTEGER NOT NULL,
    "presentation" TEXT NOT NULL,

    CONSTRAINT "trainer_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "app"."goals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "type" "app"."TrainingPurpose" NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE,

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."physical_conditions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "body_zone_code" TEXT NOT NULL,
    "severity" "app"."ConditionSeverity" NOT NULL,
    "description" TEXT,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE,

    CONSTRAINT "physical_conditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."fitness_clearances" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "recorded_by_user_id" UUID NOT NULL,
    "issued_on" DATE NOT NULL,
    "expires_on" DATE NOT NULL,
    "observation" TEXT,

    CONSTRAINT "fitness_clearances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."body_measurements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "type" "app"."BodyMeasurementType" NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "measured_on" DATE NOT NULL,

    CONSTRAINT "body_measurements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."trainer_student_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "trainer_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6),
    "started_by_user_id" UUID NOT NULL,
    "ended_by_user_id" UUID,

    CONSTRAINT "trainer_student_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."gym_equipment" (
    "gym_id" UUID NOT NULL,
    "equipment_code" TEXT NOT NULL,
    "present" BOOLEAN NOT NULL DEFAULT true,
    "updated_by_user_id" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "gym_equipment_pkey" PRIMARY KEY ("gym_id","equipment_code")
);

-- CreateTable
CREATE TABLE "app"."exercises" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "gym_id" UUID,
    "author_user_id" UUID,
    "name" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "movement_pattern" "app"."MovementPattern" NOT NULL,
    "difficulty_level" "app"."ExperienceLevel" NOT NULL,
    "unilateral" BOOLEAN NOT NULL DEFAULT false,
    "visual_resource_url" TEXT NOT NULL,
    "origin" "app"."ExerciseOrigin" NOT NULL,

    CONSTRAINT "exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."exercise_equipment" (
    "exercise_id" UUID NOT NULL,
    "equipment_code" TEXT NOT NULL,

    CONSTRAINT "exercise_equipment_pkey" PRIMARY KEY ("exercise_id","equipment_code")
);

-- CreateTable
CREATE TABLE "app"."exercise_muscles" (
    "exercise_id" UUID NOT NULL,
    "muscle_code" TEXT NOT NULL,
    "participation" "app"."MuscleParticipation" NOT NULL,

    CONSTRAINT "exercise_muscles_pkey" PRIMARY KEY ("exercise_id","muscle_code")
);

-- CreateTable
CREATE TABLE "app"."exercise_joints" (
    "exercise_id" UUID NOT NULL,
    "joint_code" TEXT NOT NULL,

    CONSTRAINT "exercise_joints_pkey" PRIMARY KEY ("exercise_id","joint_code")
);

-- CreateTable
CREATE TABLE "app"."routine_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "gym_id" UUID NOT NULL,
    "author_trainer_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "routine_type" "app"."TrainingPurpose" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "routine_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."template_days" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "template_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "template_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."template_exercises" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "template_day_id" UUID NOT NULL,
    "exercise_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "note" TEXT,

    CONSTRAINT "template_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."template_sets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "template_exercise_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "min_repetitions" INTEGER NOT NULL,
    "max_repetitions" INTEGER NOT NULL,
    "suggested_load" DECIMAL(10,2) NOT NULL,
    "rest_seconds" INTEGER NOT NULL,
    "warmup" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "template_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."routines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "source_template_id" UUID,
    "source_generation_result_id" UUID,
    "routine_type" "app"."TrainingPurpose" NOT NULL,
    "target_weekly_frequency" INTEGER NOT NULL,
    "state" "app"."RoutineState" NOT NULL,
    "origin" "app"."RoutineOrigin" NOT NULL,
    "requested_by_user_id" UUID,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "routines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."routine_reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "routine_id" UUID NOT NULL,
    "reviewed_version_id" UUID NOT NULL,
    "reviewer_trainer_id" UUID NOT NULL,
    "result" "app"."RoutineReviewResult" NOT NULL,
    "observation" TEXT,
    "reviewed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "routine_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."routine_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "routine_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "current" BOOLEAN NOT NULL DEFAULT false,
    "created_by_user_id" UUID NOT NULL,
    "adaptation_proposal_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "routine_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."routine_days" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "routine_version_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "dominant_pattern" "app"."MovementPattern" NOT NULL,

    CONSTRAINT "routine_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."routine_exercises" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "routine_day_id" UUID NOT NULL,
    "exercise_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "note" TEXT,
    "compatibility_state" "app"."CompatibilityState" NOT NULL DEFAULT 'COMPATIBLE',
    "compatibility_reason" TEXT,

    CONSTRAINT "routine_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."prescribed_sets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "routine_exercise_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "min_repetitions" INTEGER NOT NULL,
    "max_repetitions" INTEGER NOT NULL,
    "suggested_load" DECIMAL(10,2) NOT NULL,
    "rest_seconds" INTEGER NOT NULL,
    "warmup" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "prescribed_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."training_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "routine_id" UUID NOT NULL,
    "routine_version_id" UUID NOT NULL,
    "routine_day_id" UUID NOT NULL,
    "state" "app"."TrainingSessionState" NOT NULL DEFAULT 'EN_CURSO',
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "occurred_on" DATE NOT NULL,
    "simulated" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "training_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."session_set_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "prescribed_exercise_id" UUID NOT NULL,
    "performed_exercise_id" UUID,
    "prescribed_min_repetitions" INTEGER NOT NULL,
    "prescribed_max_repetitions" INTEGER NOT NULL,
    "prescribed_load" DECIMAL(10,2) NOT NULL,
    "warmup" BOOLEAN NOT NULL DEFAULT false,
    "performed_load" DECIMAL(10,2),
    "performed_repetitions" INTEGER,
    "perceived_effort" INTEGER,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "additional" BOOLEAN NOT NULL DEFAULT false,
    "omission_reason" TEXT,
    "atypical_confirmed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "session_set_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."notices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "recipient_user_id" UUID NOT NULL,
    "type" "app"."NoticeType" NOT NULL,
    "reference_type" TEXT NOT NULL,
    "reference_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMPTZ(6),
    "expired" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_user_id" UUID NOT NULL,
    "operation" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "previous_value" JSONB,
    "new_value" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."evolution_diagnostics" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "routine_version_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "global_situation" "app"."EvolutionSituation" NOT NULL,
    "adherence" DECIMAL(5,2),
    "component_version" TEXT NOT NULL,
    "criteria_not_evaluated" JSONB NOT NULL,
    "calculated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evolution_diagnostics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."exercise_diagnostics" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "diagnostic_id" UUID NOT NULL,
    "exercise_id" UUID NOT NULL,
    "situation" "app"."EvolutionSituation" NOT NULL,
    "metrics" JSONB NOT NULL,

    CONSTRAINT "exercise_diagnostics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."adaptation_proposals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "diagnostic_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "state" "app"."AdaptationProposalState" NOT NULL DEFAULT 'PENDIENTE',
    "resolved_by_trainer_id" UUID,
    "resulting_version_id" UUID,
    "resolution_reason" TEXT,
    "component_version" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "adaptation_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."proposed_adjustments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "proposal_id" UUID NOT NULL,
    "routine_exercise_id" UUID,
    "type" "app"."AdjustmentType" NOT NULL,
    "previous_value" JSONB NOT NULL,
    "proposed_value" JSONB NOT NULL,
    "criterion" TEXT NOT NULL,
    "supporting_data" JSONB NOT NULL,
    "state" "app"."ProposedAdjustmentState" NOT NULL DEFAULT 'PENDIENTE',

    CONSTRAINT "proposed_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."personal_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "exercise_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "type" "app"."PersonalRecordType" NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "achieved_on" DATE NOT NULL,
    "current" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "personal_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_integration"."ai_generation_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "idempotency_key" TEXT NOT NULL,
    "state" "ai_integration"."AiGenerationRequestState" NOT NULL DEFAULT 'PENDIENTE',
    "minimized_context" JSONB NOT NULL,
    "preferences" JSONB NOT NULL,
    "context_hash" TEXT NOT NULL,
    "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lease_owner" TEXT,
    "lease_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "retention_until" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_generation_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_integration"."ai_generation_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "state" "ai_integration"."AiGenerationAttemptState" NOT NULL DEFAULT 'PENDIENTE',
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "error_code" TEXT,
    "model_version" TEXT,
    "configuration_version" TEXT,
    "contract_version" TEXT NOT NULL,
    "input_hash" TEXT NOT NULL,

    CONSTRAINT "ai_generation_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_integration"."ai_generation_results" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "attempt_id" UUID NOT NULL,
    "structured_output" JSONB NOT NULL,
    "output_hash" TEXT NOT NULL,
    "structurally_valid" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retention_until" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_generation_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_integration"."ai_result_validations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "result_id" UUID NOT NULL,
    "validator_version" TEXT NOT NULL,
    "valid" BOOLEAN NOT NULL,
    "violations" JSONB NOT NULL,
    "validated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_result_validations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invitations_gym_id_status_idx" ON "app"."invitations"("gym_id", "status");

-- CreateIndex
CREATE INDEX "invitations_email_normalized_idx" ON "app"."invitations"("email_normalized");

-- CreateIndex
CREATE UNIQUE INDEX "users_invitation_id_key" ON "app"."users"("invitation_id");

-- CreateIndex
CREATE INDEX "users_gym_id_state_idx" ON "app"."users"("gym_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "users_gym_id_email_normalized_key" ON "app"."users"("gym_id", "email_normalized");

-- CreateIndex
CREATE INDEX "consents_user_id_type_recorded_at_idx" ON "app"."consents"("user_id", "type", "recorded_at");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_token_hash_key" ON "app"."auth_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_expires_at_idx" ON "app"."auth_sessions"("user_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "app"."password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_expires_at_idx" ON "app"."password_reset_tokens"("user_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_name_key" ON "app"."equipment"("name");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_display_order_key" ON "app"."equipment"("display_order");

-- CreateIndex
CREATE UNIQUE INDEX "muscle_groups_name_key" ON "app"."muscle_groups"("name");

-- CreateIndex
CREATE UNIQUE INDEX "muscle_groups_display_order_key" ON "app"."muscle_groups"("display_order");

-- CreateIndex
CREATE UNIQUE INDEX "joints_name_key" ON "app"."joints"("name");

-- CreateIndex
CREATE UNIQUE INDEX "joints_display_order_key" ON "app"."joints"("display_order");

-- CreateIndex
CREATE INDEX "goals_student_id_starts_on_idx" ON "app"."goals"("student_id", "starts_on");

-- CreateIndex
CREATE INDEX "physical_conditions_student_id_starts_on_idx" ON "app"."physical_conditions"("student_id", "starts_on");

-- CreateIndex
CREATE INDEX "fitness_clearances_student_id_expires_on_idx" ON "app"."fitness_clearances"("student_id", "expires_on");

-- CreateIndex
CREATE UNIQUE INDEX "body_measurements_student_id_type_measured_on_key" ON "app"."body_measurements"("student_id", "type", "measured_on");

-- CreateIndex
CREATE INDEX "trainer_student_assignments_student_id_starts_at_idx" ON "app"."trainer_student_assignments"("student_id", "starts_at");

-- CreateIndex
CREATE INDEX "trainer_student_assignments_trainer_id_starts_at_idx" ON "app"."trainer_student_assignments"("trainer_id", "starts_at");

-- CreateIndex
CREATE INDEX "exercises_gym_id_idx" ON "app"."exercises"("gym_id");

-- CreateIndex
CREATE INDEX "exercises_movement_pattern_difficulty_level_idx" ON "app"."exercises"("movement_pattern", "difficulty_level");

-- CreateIndex
CREATE INDEX "routine_templates_gym_id_active_idx" ON "app"."routine_templates"("gym_id", "active");

-- CreateIndex
CREATE INDEX "routine_templates_author_trainer_id_idx" ON "app"."routine_templates"("author_trainer_id");

-- CreateIndex
CREATE UNIQUE INDEX "template_days_template_id_position_key" ON "app"."template_days"("template_id", "position");

-- CreateIndex
CREATE INDEX "template_exercises_exercise_id_idx" ON "app"."template_exercises"("exercise_id");

-- CreateIndex
CREATE UNIQUE INDEX "template_exercises_template_day_id_position_key" ON "app"."template_exercises"("template_day_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "template_sets_template_exercise_id_position_key" ON "app"."template_sets"("template_exercise_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "routines_source_generation_result_id_key" ON "app"."routines"("source_generation_result_id");

-- CreateIndex
CREATE INDEX "routines_student_id_state_idx" ON "app"."routines"("student_id", "state");

-- CreateIndex
CREATE INDEX "routines_source_template_id_idx" ON "app"."routines"("source_template_id");

-- CreateIndex
CREATE INDEX "routine_reviews_routine_id_reviewed_at_idx" ON "app"."routine_reviews"("routine_id", "reviewed_at");

-- CreateIndex
CREATE INDEX "routine_reviews_reviewer_trainer_id_reviewed_at_idx" ON "app"."routine_reviews"("reviewer_trainer_id", "reviewed_at");

-- CreateIndex
CREATE UNIQUE INDEX "routine_versions_adaptation_proposal_id_key" ON "app"."routine_versions"("adaptation_proposal_id");

-- CreateIndex
CREATE UNIQUE INDEX "routine_versions_routine_id_version_number_key" ON "app"."routine_versions"("routine_id", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "routine_days_routine_version_id_position_key" ON "app"."routine_days"("routine_version_id", "position");

-- CreateIndex
CREATE INDEX "routine_exercises_exercise_id_idx" ON "app"."routine_exercises"("exercise_id");

-- CreateIndex
CREATE UNIQUE INDEX "routine_exercises_routine_day_id_position_key" ON "app"."routine_exercises"("routine_day_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "prescribed_sets_routine_exercise_id_position_key" ON "app"."prescribed_sets"("routine_exercise_id", "position");

-- CreateIndex
CREATE INDEX "training_sessions_student_id_occurred_on_idx" ON "app"."training_sessions"("student_id", "occurred_on");

-- CreateIndex
CREATE INDEX "training_sessions_routine_id_idx" ON "app"."training_sessions"("routine_id");

-- CreateIndex
CREATE INDEX "training_sessions_routine_version_id_idx" ON "app"."training_sessions"("routine_version_id");

-- CreateIndex
CREATE INDEX "session_set_records_prescribed_exercise_id_idx" ON "app"."session_set_records"("prescribed_exercise_id");

-- CreateIndex
CREATE INDEX "session_set_records_performed_exercise_id_idx" ON "app"."session_set_records"("performed_exercise_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_set_records_session_id_position_key" ON "app"."session_set_records"("session_id", "position");

-- CreateIndex
CREATE INDEX "notices_recipient_user_id_expired_created_at_idx" ON "app"."notices"("recipient_user_id", "expired", "created_at");

-- CreateIndex
CREATE INDEX "notices_reference_type_reference_id_idx" ON "app"."notices"("reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_created_at_idx" ON "app"."audit_logs"("entity_type", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "app"."audit_logs"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "evolution_diagnostics_student_id_period_end_idx" ON "app"."evolution_diagnostics"("student_id", "period_end");

-- CreateIndex
CREATE INDEX "evolution_diagnostics_routine_version_id_calculated_at_idx" ON "app"."evolution_diagnostics"("routine_version_id", "calculated_at");

-- CreateIndex
CREATE INDEX "exercise_diagnostics_exercise_id_idx" ON "app"."exercise_diagnostics"("exercise_id");

-- CreateIndex
CREATE UNIQUE INDEX "exercise_diagnostics_diagnostic_id_exercise_id_key" ON "app"."exercise_diagnostics"("diagnostic_id", "exercise_id");

-- CreateIndex
CREATE UNIQUE INDEX "adaptation_proposals_diagnostic_id_key" ON "app"."adaptation_proposals"("diagnostic_id");

-- CreateIndex
CREATE UNIQUE INDEX "adaptation_proposals_resulting_version_id_key" ON "app"."adaptation_proposals"("resulting_version_id");

-- CreateIndex
CREATE INDEX "adaptation_proposals_student_id_state_created_at_idx" ON "app"."adaptation_proposals"("student_id", "state", "created_at");

-- CreateIndex
CREATE INDEX "adaptation_proposals_resolved_by_trainer_id_idx" ON "app"."adaptation_proposals"("resolved_by_trainer_id");

-- CreateIndex
CREATE INDEX "proposed_adjustments_proposal_id_state_idx" ON "app"."proposed_adjustments"("proposal_id", "state");

-- CreateIndex
CREATE INDEX "proposed_adjustments_routine_exercise_id_idx" ON "app"."proposed_adjustments"("routine_exercise_id");

-- CreateIndex
CREATE INDEX "personal_records_student_id_exercise_id_type_achieved_on_idx" ON "app"."personal_records"("student_id", "exercise_id", "type", "achieved_on");

-- CreateIndex
CREATE INDEX "personal_records_session_id_idx" ON "app"."personal_records"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_generation_requests_idempotency_key_key" ON "ai_integration"."ai_generation_requests"("idempotency_key");

-- CreateIndex
CREATE INDEX "ai_generation_requests_state_available_at_idx" ON "ai_integration"."ai_generation_requests"("state", "available_at");

-- CreateIndex
CREATE INDEX "ai_generation_requests_retention_until_idx" ON "ai_integration"."ai_generation_requests"("retention_until");

-- CreateIndex
CREATE INDEX "ai_generation_attempts_state_started_at_idx" ON "ai_integration"."ai_generation_attempts"("state", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_generation_attempts_request_id_attempt_number_key" ON "ai_integration"."ai_generation_attempts"("request_id", "attempt_number");

-- CreateIndex
CREATE UNIQUE INDEX "ai_generation_results_attempt_id_key" ON "ai_integration"."ai_generation_results"("attempt_id");

-- CreateIndex
CREATE INDEX "ai_generation_results_retention_until_idx" ON "ai_integration"."ai_generation_results"("retention_until");

-- CreateIndex
CREATE INDEX "ai_result_validations_result_id_validated_at_idx" ON "ai_integration"."ai_result_validations"("result_id", "validated_at");

-- AddForeignKey
ALTER TABLE "app"."invitations" ADD CONSTRAINT "invitations_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "app"."gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."invitations" ADD CONSTRAINT "invitations_issued_by_user_id_fkey" FOREIGN KEY ("issued_by_user_id") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."invitation_roles" ADD CONSTRAINT "invitation_roles_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "app"."invitations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."users" ADD CONSTRAINT "users_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "app"."gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."users" ADD CONSTRAINT "users_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "app"."invitations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."consents" ADD CONSTRAINT "consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."student_profiles" ADD CONSTRAINT "student_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."trainer_profiles" ADD CONSTRAINT "trainer_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."goals" ADD CONSTRAINT "goals_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "app"."student_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."physical_conditions" ADD CONSTRAINT "physical_conditions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "app"."student_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."fitness_clearances" ADD CONSTRAINT "fitness_clearances_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "app"."student_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."fitness_clearances" ADD CONSTRAINT "fitness_clearances_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."body_measurements" ADD CONSTRAINT "body_measurements_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "app"."student_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."trainer_student_assignments" ADD CONSTRAINT "trainer_student_assignments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "app"."student_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."trainer_student_assignments" ADD CONSTRAINT "trainer_student_assignments_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "app"."trainer_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."trainer_student_assignments" ADD CONSTRAINT "trainer_student_assignments_started_by_user_id_fkey" FOREIGN KEY ("started_by_user_id") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."trainer_student_assignments" ADD CONSTRAINT "trainer_student_assignments_ended_by_user_id_fkey" FOREIGN KEY ("ended_by_user_id") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."gym_equipment" ADD CONSTRAINT "gym_equipment_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "app"."gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."gym_equipment" ADD CONSTRAINT "gym_equipment_equipment_code_fkey" FOREIGN KEY ("equipment_code") REFERENCES "app"."equipment"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."gym_equipment" ADD CONSTRAINT "gym_equipment_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."exercises" ADD CONSTRAINT "exercises_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "app"."gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."exercises" ADD CONSTRAINT "exercises_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."exercise_equipment" ADD CONSTRAINT "exercise_equipment_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "app"."exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."exercise_equipment" ADD CONSTRAINT "exercise_equipment_equipment_code_fkey" FOREIGN KEY ("equipment_code") REFERENCES "app"."equipment"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."exercise_muscles" ADD CONSTRAINT "exercise_muscles_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "app"."exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."exercise_muscles" ADD CONSTRAINT "exercise_muscles_muscle_code_fkey" FOREIGN KEY ("muscle_code") REFERENCES "app"."muscle_groups"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."exercise_joints" ADD CONSTRAINT "exercise_joints_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "app"."exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."exercise_joints" ADD CONSTRAINT "exercise_joints_joint_code_fkey" FOREIGN KEY ("joint_code") REFERENCES "app"."joints"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."routine_templates" ADD CONSTRAINT "routine_templates_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "app"."gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."routine_templates" ADD CONSTRAINT "routine_templates_author_trainer_id_fkey" FOREIGN KEY ("author_trainer_id") REFERENCES "app"."trainer_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."template_days" ADD CONSTRAINT "template_days_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "app"."routine_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."template_exercises" ADD CONSTRAINT "template_exercises_template_day_id_fkey" FOREIGN KEY ("template_day_id") REFERENCES "app"."template_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."template_exercises" ADD CONSTRAINT "template_exercises_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "app"."exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."template_sets" ADD CONSTRAINT "template_sets_template_exercise_id_fkey" FOREIGN KEY ("template_exercise_id") REFERENCES "app"."template_exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."routines" ADD CONSTRAINT "routines_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "app"."student_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."routines" ADD CONSTRAINT "routines_source_template_id_fkey" FOREIGN KEY ("source_template_id") REFERENCES "app"."routine_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."routines" ADD CONSTRAINT "routines_source_generation_result_id_fkey" FOREIGN KEY ("source_generation_result_id") REFERENCES "ai_integration"."ai_generation_results"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."routines" ADD CONSTRAINT "routines_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."routine_reviews" ADD CONSTRAINT "routine_reviews_routine_id_fkey" FOREIGN KEY ("routine_id") REFERENCES "app"."routines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."routine_reviews" ADD CONSTRAINT "routine_reviews_reviewed_version_id_fkey" FOREIGN KEY ("reviewed_version_id") REFERENCES "app"."routine_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."routine_reviews" ADD CONSTRAINT "routine_reviews_reviewer_trainer_id_fkey" FOREIGN KEY ("reviewer_trainer_id") REFERENCES "app"."trainer_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."routine_versions" ADD CONSTRAINT "routine_versions_routine_id_fkey" FOREIGN KEY ("routine_id") REFERENCES "app"."routines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."routine_versions" ADD CONSTRAINT "routine_versions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."routine_versions" ADD CONSTRAINT "routine_versions_adaptation_proposal_id_fkey" FOREIGN KEY ("adaptation_proposal_id") REFERENCES "app"."adaptation_proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."routine_days" ADD CONSTRAINT "routine_days_routine_version_id_fkey" FOREIGN KEY ("routine_version_id") REFERENCES "app"."routine_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."routine_exercises" ADD CONSTRAINT "routine_exercises_routine_day_id_fkey" FOREIGN KEY ("routine_day_id") REFERENCES "app"."routine_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."routine_exercises" ADD CONSTRAINT "routine_exercises_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "app"."exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."prescribed_sets" ADD CONSTRAINT "prescribed_sets_routine_exercise_id_fkey" FOREIGN KEY ("routine_exercise_id") REFERENCES "app"."routine_exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."training_sessions" ADD CONSTRAINT "training_sessions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "app"."student_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."training_sessions" ADD CONSTRAINT "training_sessions_routine_id_fkey" FOREIGN KEY ("routine_id") REFERENCES "app"."routines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."training_sessions" ADD CONSTRAINT "training_sessions_routine_version_id_fkey" FOREIGN KEY ("routine_version_id") REFERENCES "app"."routine_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."training_sessions" ADD CONSTRAINT "training_sessions_routine_day_id_fkey" FOREIGN KEY ("routine_day_id") REFERENCES "app"."routine_days"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."session_set_records" ADD CONSTRAINT "session_set_records_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "app"."training_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."session_set_records" ADD CONSTRAINT "session_set_records_prescribed_exercise_id_fkey" FOREIGN KEY ("prescribed_exercise_id") REFERENCES "app"."exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."session_set_records" ADD CONSTRAINT "session_set_records_performed_exercise_id_fkey" FOREIGN KEY ("performed_exercise_id") REFERENCES "app"."exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."notices" ADD CONSTRAINT "notices_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."evolution_diagnostics" ADD CONSTRAINT "evolution_diagnostics_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "app"."student_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."evolution_diagnostics" ADD CONSTRAINT "evolution_diagnostics_routine_version_id_fkey" FOREIGN KEY ("routine_version_id") REFERENCES "app"."routine_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."exercise_diagnostics" ADD CONSTRAINT "exercise_diagnostics_diagnostic_id_fkey" FOREIGN KEY ("diagnostic_id") REFERENCES "app"."evolution_diagnostics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."exercise_diagnostics" ADD CONSTRAINT "exercise_diagnostics_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "app"."exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."adaptation_proposals" ADD CONSTRAINT "adaptation_proposals_diagnostic_id_fkey" FOREIGN KEY ("diagnostic_id") REFERENCES "app"."evolution_diagnostics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."adaptation_proposals" ADD CONSTRAINT "adaptation_proposals_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "app"."student_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."adaptation_proposals" ADD CONSTRAINT "adaptation_proposals_resolved_by_trainer_id_fkey" FOREIGN KEY ("resolved_by_trainer_id") REFERENCES "app"."trainer_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."adaptation_proposals" ADD CONSTRAINT "adaptation_proposals_resulting_version_id_fkey" FOREIGN KEY ("resulting_version_id") REFERENCES "app"."routine_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."proposed_adjustments" ADD CONSTRAINT "proposed_adjustments_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "app"."adaptation_proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."proposed_adjustments" ADD CONSTRAINT "proposed_adjustments_routine_exercise_id_fkey" FOREIGN KEY ("routine_exercise_id") REFERENCES "app"."routine_exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."personal_records" ADD CONSTRAINT "personal_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "app"."student_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."personal_records" ADD CONSTRAINT "personal_records_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "app"."exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."personal_records" ADD CONSTRAINT "personal_records_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "app"."training_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_integration"."ai_generation_attempts" ADD CONSTRAINT "ai_generation_attempts_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "ai_integration"."ai_generation_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_integration"."ai_generation_results" ADD CONSTRAINT "ai_generation_results_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "ai_integration"."ai_generation_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_integration"."ai_result_validations" ADD CONSTRAINT "ai_result_validations_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "ai_integration"."ai_generation_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Domain checks that Prisma cannot express.
ALTER TABLE "app"."invitations"
    ADD CONSTRAINT "invitations_valid_period_check" CHECK ("expires_at" > "issued_at");

ALTER TABLE "app"."auth_sessions"
    ADD CONSTRAINT "auth_sessions_valid_period_check" CHECK ("expires_at" > "last_activity_at"),
    ADD CONSTRAINT "auth_sessions_valid_revocation_check" CHECK ("revoked_at" IS NULL OR "revoked_at" >= "last_activity_at");

ALTER TABLE "app"."equipment"
    ADD CONSTRAINT "equipment_positive_display_order_check" CHECK ("display_order" > 0);

ALTER TABLE "app"."muscle_groups"
    ADD CONSTRAINT "muscle_groups_positive_display_order_check" CHECK ("display_order" > 0);

ALTER TABLE "app"."joints"
    ADD CONSTRAINT "joints_positive_display_order_check" CHECK ("display_order" > 0);

ALTER TABLE "app"."student_profiles"
    ADD CONSTRAINT "student_profiles_positive_height_check" CHECK ("height_cm" > 0),
    ADD CONSTRAINT "student_profiles_available_days_check" CHECK ("available_days_per_week" BETWEEN 1 AND 7);

ALTER TABLE "app"."trainer_profiles"
    ADD CONSTRAINT "trainer_profiles_experience_years_check" CHECK ("experience_years" >= 0);

ALTER TABLE "app"."goals"
    ADD CONSTRAINT "goals_valid_period_check" CHECK ("ends_on" IS NULL OR "ends_on" > "starts_on");

ALTER TABLE "app"."physical_conditions"
    ADD CONSTRAINT "physical_conditions_valid_period_check" CHECK ("ends_on" IS NULL OR "ends_on" > "starts_on");

ALTER TABLE "app"."fitness_clearances"
    ADD CONSTRAINT "fitness_clearances_valid_period_check" CHECK ("expires_on" >= "issued_on");

ALTER TABLE "app"."body_measurements"
    ADD CONSTRAINT "body_measurements_positive_value_check" CHECK ("value" > 0);

ALTER TABLE "app"."trainer_student_assignments"
    ADD CONSTRAINT "trainer_student_assignments_distinct_people_check" CHECK ("trainer_id" <> "student_id"),
    ADD CONSTRAINT "trainer_student_assignments_valid_period_check" CHECK ("ends_at" IS NULL OR "ends_at" > "starts_at"),
    ADD CONSTRAINT "trainer_student_assignments_end_metadata_check" CHECK (("ends_at" IS NULL) = ("ended_by_user_id" IS NULL));

ALTER TABLE "app"."exercises"
    ADD CONSTRAINT "exercises_origin_scope_check" CHECK (
        ("origin" = 'CATALOGO_BASE' AND "gym_id" IS NULL AND "author_user_id" IS NULL)
        OR
        ("origin" = 'GIMNASIO' AND "gym_id" IS NOT NULL AND "author_user_id" IS NOT NULL)
    );

ALTER TABLE "app"."template_days"
    ADD CONSTRAINT "template_days_positive_position_check" CHECK ("position" > 0);

ALTER TABLE "app"."template_exercises"
    ADD CONSTRAINT "template_exercises_positive_position_check" CHECK ("position" > 0);

ALTER TABLE "app"."template_sets"
    ADD CONSTRAINT "template_sets_positive_position_check" CHECK ("position" > 0),
    ADD CONSTRAINT "template_sets_repetitions_check" CHECK ("min_repetitions" >= 1 AND "max_repetitions" >= "min_repetitions"),
    ADD CONSTRAINT "template_sets_load_check" CHECK ("suggested_load" BETWEEN 0 AND 1000),
    ADD CONSTRAINT "template_sets_rest_check" CHECK ("rest_seconds" >= 0);

ALTER TABLE "app"."routines"
    ADD CONSTRAINT "routines_source_matches_origin_check" CHECK (
        ("origin" = 'PLANTILLA_ENTRENADOR' AND "source_template_id" IS NOT NULL AND "source_generation_result_id" IS NULL)
        OR
        ("origin" = 'GENERADA' AND "source_template_id" IS NULL AND "source_generation_result_id" IS NOT NULL)
    ),
    ADD CONSTRAINT "routines_frequency_matches_type_check" CHECK (
        ("routine_type" = 'FUERZA' AND "target_weekly_frequency" BETWEEN 3 AND 5)
        OR ("routine_type" = 'HIPERTROFIA' AND "target_weekly_frequency" BETWEEN 3 AND 6)
        OR ("routine_type" = 'RESISTENCIA_MUSCULAR' AND "target_weekly_frequency" BETWEEN 2 AND 4)
        OR ("routine_type" = 'ACONDICIONAMIENTO_GENERAL' AND "target_weekly_frequency" BETWEEN 2 AND 4)
    );

ALTER TABLE "app"."routine_versions"
    ADD CONSTRAINT "routine_versions_positive_number_check" CHECK ("version_number" > 0);

ALTER TABLE "app"."routine_days"
    ADD CONSTRAINT "routine_days_positive_position_check" CHECK ("position" > 0);

ALTER TABLE "app"."routine_exercises"
    ADD CONSTRAINT "routine_exercises_positive_position_check" CHECK ("position" > 0);

ALTER TABLE "app"."prescribed_sets"
    ADD CONSTRAINT "prescribed_sets_positive_position_check" CHECK ("position" > 0),
    ADD CONSTRAINT "prescribed_sets_repetitions_check" CHECK ("min_repetitions" >= 1 AND "max_repetitions" >= "min_repetitions"),
    ADD CONSTRAINT "prescribed_sets_load_check" CHECK ("suggested_load" BETWEEN 0 AND 1000),
    ADD CONSTRAINT "prescribed_sets_rest_check" CHECK ("rest_seconds" >= 0);

ALTER TABLE "app"."training_sessions"
    ADD CONSTRAINT "training_sessions_completion_time_check" CHECK ("completed_at" IS NULL OR "completed_at" >= "started_at");

ALTER TABLE "app"."session_set_records"
    ADD CONSTRAINT "session_set_records_positive_position_check" CHECK ("position" > 0),
    ADD CONSTRAINT "session_set_records_prescribed_repetitions_check" CHECK ("prescribed_min_repetitions" >= 1 AND "prescribed_max_repetitions" >= "prescribed_min_repetitions"),
    ADD CONSTRAINT "session_set_records_prescribed_load_check" CHECK ("prescribed_load" BETWEEN 0 AND 1000),
    ADD CONSTRAINT "session_set_records_performed_load_check" CHECK ("performed_load" IS NULL OR "performed_load" BETWEEN 0 AND 1000),
    ADD CONSTRAINT "session_set_records_performed_repetitions_check" CHECK ("performed_repetitions" IS NULL OR "performed_repetitions" BETWEEN 1 AND 100),
    ADD CONSTRAINT "session_set_records_perceived_effort_check" CHECK ("perceived_effort" IS NULL OR "perceived_effort" BETWEEN 1 AND 10),
    ADD CONSTRAINT "session_set_records_completed_data_check" CHECK (
        NOT "completed"
        OR ("performed_exercise_id" IS NOT NULL AND "performed_load" IS NOT NULL AND "performed_repetitions" IS NOT NULL)
    );

ALTER TABLE "app"."notices"
    ADD CONSTRAINT "notices_read_time_check" CHECK ("read_at" IS NULL OR "read_at" >= "created_at");

ALTER TABLE "app"."evolution_diagnostics"
    ADD CONSTRAINT "evolution_diagnostics_valid_period_check" CHECK ("period_end" >= "period_start"),
    ADD CONSTRAINT "evolution_diagnostics_adherence_check" CHECK ("adherence" IS NULL OR "adherence" BETWEEN 0 AND 100),
    ADD CONSTRAINT "evolution_diagnostics_criteria_json_check" CHECK (jsonb_typeof("criteria_not_evaluated") = 'array');

ALTER TABLE "app"."adaptation_proposals"
    ADD CONSTRAINT "adaptation_proposals_resolution_time_check" CHECK ("resolved_at" IS NULL OR "resolved_at" >= "created_at"),
    ADD CONSTRAINT "adaptation_proposals_resolution_metadata_check" CHECK (
        ("state" IN ('PENDIENTE', 'BLOQUEADA')
            AND "resolved_by_trainer_id" IS NULL
            AND "resulting_version_id" IS NULL
            AND "resolved_at" IS NULL)
        OR
        ("state" IN ('ACEPTADA_TOTAL', 'ACEPTADA_PARCIAL')
            AND "resolved_by_trainer_id" IS NOT NULL
            AND "resulting_version_id" IS NOT NULL
            AND "resolved_at" IS NOT NULL)
        OR
        ("state" = 'RECHAZADA'
            AND "resolved_by_trainer_id" IS NOT NULL
            AND "resulting_version_id" IS NULL
            AND "resolved_at" IS NOT NULL
            AND NULLIF(BTRIM("resolution_reason"), '') IS NOT NULL)
        OR
        ("state" IN ('INVALIDADA', 'CADUCADA')
            AND "resulting_version_id" IS NULL
            AND "resolved_at" IS NOT NULL)
    );

ALTER TABLE "app"."personal_records"
    ADD CONSTRAINT "personal_records_nonnegative_value_check" CHECK ("value" >= 0);

ALTER TABLE "ai_integration"."ai_generation_requests"
    ADD CONSTRAINT "ai_generation_requests_context_json_check" CHECK (jsonb_typeof("minimized_context") = 'object'),
    ADD CONSTRAINT "ai_generation_requests_preferences_json_check" CHECK (jsonb_typeof("preferences") = 'object'),
    ADD CONSTRAINT "ai_generation_requests_lease_pair_check" CHECK (("lease_owner" IS NULL) = ("lease_until" IS NULL)),
    ADD CONSTRAINT "ai_generation_requests_finished_time_check" CHECK ("finished_at" IS NULL OR "finished_at" >= "created_at"),
    ADD CONSTRAINT "ai_generation_requests_retention_check" CHECK ("retention_until" > "created_at");

ALTER TABLE "ai_integration"."ai_generation_attempts"
    ADD CONSTRAINT "ai_generation_attempts_number_check" CHECK ("attempt_number" BETWEEN 1 AND 2),
    ADD CONSTRAINT "ai_generation_attempts_time_check" CHECK ("finished_at" IS NULL OR ("started_at" IS NOT NULL AND "finished_at" >= "started_at"));

ALTER TABLE "ai_integration"."ai_generation_results"
    ADD CONSTRAINT "ai_generation_results_output_json_check" CHECK (jsonb_typeof("structured_output") = 'object'),
    ADD CONSTRAINT "ai_generation_results_retention_check" CHECK ("retention_until" > "created_at");

ALTER TABLE "ai_integration"."ai_result_validations"
    ADD CONSTRAINT "ai_result_validations_violations_json_check" CHECK (jsonb_typeof("violations") = 'array');

-- Partial and case-insensitive uniqueness required by domain invariants.
CREATE UNIQUE INDEX "goals_one_current_per_student_key"
    ON "app"."goals" ("student_id") WHERE "ends_on" IS NULL;

CREATE UNIQUE INDEX "trainer_student_assignments_one_current_per_student_key"
    ON "app"."trainer_student_assignments" ("student_id") WHERE "ends_at" IS NULL;

CREATE UNIQUE INDEX "exercises_base_name_key"
    ON "app"."exercises" (LOWER("name")) WHERE "gym_id" IS NULL;

CREATE UNIQUE INDEX "exercises_gym_name_key"
    ON "app"."exercises" ("gym_id", LOWER("name")) WHERE "gym_id" IS NOT NULL;

CREATE UNIQUE INDEX "exercise_muscles_one_primary_key"
    ON "app"."exercise_muscles" ("exercise_id") WHERE "participation" = 'PRIMARIA';

CREATE UNIQUE INDEX "routines_one_proposed_per_student_key"
    ON "app"."routines" ("student_id") WHERE "state" = 'PROPUESTA';

CREATE UNIQUE INDEX "routines_one_current_per_student_key"
    ON "app"."routines" ("student_id") WHERE "state" = 'VIGENTE';

CREATE UNIQUE INDEX "routine_versions_one_current_key"
    ON "app"."routine_versions" ("routine_id") WHERE "current";

CREATE UNIQUE INDEX "training_sessions_one_in_progress_per_student_key"
    ON "app"."training_sessions" ("student_id") WHERE "state" = 'EN_CURSO';

CREATE UNIQUE INDEX "personal_records_one_current_key"
    ON "app"."personal_records" ("student_id", "exercise_id", "type") WHERE "current";

-- Cross-table tenant and lineage checks.
CREATE OR REPLACE FUNCTION "app"."check_physical_condition_body_zone"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM "app"."muscle_groups" WHERE "code" = NEW."body_zone_code")
       AND NOT EXISTS (SELECT 1 FROM "app"."joints" WHERE "code" = NEW."body_zone_code") THEN
        RAISE EXCEPTION 'body_zone_code must reference a muscle group or joint'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "physical_conditions_body_zone_check"
BEFORE INSERT OR UPDATE OF "body_zone_code" ON "app"."physical_conditions"
FOR EACH ROW EXECUTE FUNCTION "app"."check_physical_condition_body_zone"();

CREATE OR REPLACE FUNCTION "app"."check_gym_scoped_actor"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    actor_gym UUID;
BEGIN
    SELECT "gym_id" INTO actor_gym FROM "app"."users" WHERE "id" = NEW."updated_by_user_id";
    IF actor_gym IS DISTINCT FROM NEW."gym_id" THEN
        RAISE EXCEPTION 'equipment updater must belong to the same gym'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "gym_equipment_actor_scope_check"
BEFORE INSERT OR UPDATE OF "gym_id", "updated_by_user_id" ON "app"."gym_equipment"
FOR EACH ROW EXECUTE FUNCTION "app"."check_gym_scoped_actor"();

CREATE OR REPLACE FUNCTION "app"."check_exercise_scope"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    author_gym UUID;
BEGIN
    IF NEW."origin" = 'GIMNASIO' THEN
        SELECT "gym_id" INTO author_gym FROM "app"."users" WHERE "id" = NEW."author_user_id";
        IF author_gym IS DISTINCT FROM NEW."gym_id" THEN
            RAISE EXCEPTION 'exercise author must belong to the exercise gym'
                USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "exercises_actor_scope_check"
BEFORE INSERT OR UPDATE OF "gym_id", "author_user_id", "origin" ON "app"."exercises"
FOR EACH ROW EXECUTE FUNCTION "app"."check_exercise_scope"();

CREATE OR REPLACE FUNCTION "app"."check_routine_template_scope"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    author_gym UUID;
BEGIN
    SELECT u."gym_id" INTO author_gym
    FROM "app"."trainer_profiles" tp
    JOIN "app"."users" u ON u."id" = tp."user_id"
    WHERE tp."user_id" = NEW."author_trainer_id";

    IF author_gym IS DISTINCT FROM NEW."gym_id" THEN
        RAISE EXCEPTION 'template author must belong to the template gym'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "routine_templates_actor_scope_check"
BEFORE INSERT OR UPDATE OF "gym_id", "author_trainer_id" ON "app"."routine_templates"
FOR EACH ROW EXECUTE FUNCTION "app"."check_routine_template_scope"();

CREATE OR REPLACE FUNCTION "app"."check_routine_scope_and_source"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    student_gym UUID;
    requester_gym UUID;
    template_gym UUID;
BEGIN
    SELECT "gym_id" INTO student_gym FROM "app"."users" WHERE "id" = NEW."student_id";

    IF NEW."requested_by_user_id" IS NOT NULL THEN
        SELECT "gym_id" INTO requester_gym FROM "app"."users" WHERE "id" = NEW."requested_by_user_id";
        IF requester_gym IS DISTINCT FROM student_gym THEN
            RAISE EXCEPTION 'routine requester must belong to the student gym'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW."source_template_id" IS NOT NULL THEN
        SELECT "gym_id" INTO template_gym FROM "app"."routine_templates" WHERE "id" = NEW."source_template_id";
        IF template_gym IS DISTINCT FROM student_gym THEN
            RAISE EXCEPTION 'routine source template must belong to the student gym'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW."source_generation_result_id" IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
           FROM "ai_integration"."ai_generation_results" r
           WHERE r."id" = NEW."source_generation_result_id"
             AND r."structurally_valid"
             AND EXISTS (
                 SELECT 1 FROM "ai_integration"."ai_result_validations" v
                 WHERE v."result_id" = r."id" AND v."valid"
             )
       ) THEN
        RAISE EXCEPTION 'generated routine requires a structurally valid, approved AI result'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "routines_scope_and_source_check"
BEFORE INSERT OR UPDATE OF "student_id", "source_template_id", "source_generation_result_id", "requested_by_user_id" ON "app"."routines"
FOR EACH ROW EXECUTE FUNCTION "app"."check_routine_scope_and_source"();

CREATE OR REPLACE FUNCTION "app"."check_routine_review_context"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    routine_student UUID;
BEGIN
    SELECT "student_id" INTO routine_student FROM "app"."routines" WHERE "id" = NEW."routine_id";

    IF NOT EXISTS (
        SELECT 1 FROM "app"."routine_versions"
        WHERE "id" = NEW."reviewed_version_id" AND "routine_id" = NEW."routine_id"
    ) THEN
        RAISE EXCEPTION 'reviewed version must belong to the reviewed routine'
            USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM "app"."trainer_student_assignments"
        WHERE "student_id" = routine_student
          AND "trainer_id" = NEW."reviewer_trainer_id"
          AND "starts_at" <= NEW."reviewed_at"
          AND ("ends_at" IS NULL OR "ends_at" > NEW."reviewed_at")
    ) THEN
        RAISE EXCEPTION 'routine reviewer must be assigned to the student at review time'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "routine_reviews_context_check"
BEFORE INSERT OR UPDATE OF "routine_id", "reviewed_version_id", "reviewer_trainer_id", "reviewed_at" ON "app"."routine_reviews"
FOR EACH ROW EXECUTE FUNCTION "app"."check_routine_review_context"();

CREATE OR REPLACE FUNCTION "app"."check_training_session_context"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM "app"."routines" r
        JOIN "app"."routine_versions" rv ON rv."routine_id" = r."id"
        JOIN "app"."routine_days" rd ON rd."routine_version_id" = rv."id"
        WHERE r."id" = NEW."routine_id"
          AND r."student_id" = NEW."student_id"
          AND rv."id" = NEW."routine_version_id"
          AND rd."id" = NEW."routine_day_id"
          AND r."state" = 'VIGENTE'
          AND rv."current"
    ) THEN
        RAISE EXCEPTION 'session must use a current day and version of the student current routine'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "training_sessions_context_check"
BEFORE INSERT OR UPDATE OF "student_id", "routine_id", "routine_version_id", "routine_day_id" ON "app"."training_sessions"
FOR EACH ROW EXECUTE FUNCTION "app"."check_training_session_context"();

CREATE OR REPLACE FUNCTION "app"."check_adaptation_proposal_context"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    diagnostic_student UUID;
    version_proposal UUID;
BEGIN
    SELECT "student_id" INTO diagnostic_student
    FROM "app"."evolution_diagnostics" WHERE "id" = NEW."diagnostic_id";

    IF diagnostic_student IS DISTINCT FROM NEW."student_id" THEN
        RAISE EXCEPTION 'adaptation proposal and diagnostic must belong to the same student'
            USING ERRCODE = '23514';
    END IF;

    IF NEW."resulting_version_id" IS NOT NULL THEN
        SELECT "adaptation_proposal_id" INTO version_proposal
        FROM "app"."routine_versions" WHERE "id" = NEW."resulting_version_id";
        IF version_proposal IS DISTINCT FROM NEW."id" THEN
            RAISE EXCEPTION 'resulting version must reference its adaptation proposal'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "adaptation_proposals_context_check"
BEFORE INSERT OR UPDATE OF "diagnostic_id", "student_id", "resulting_version_id" ON "app"."adaptation_proposals"
FOR EACH ROW EXECUTE FUNCTION "app"."check_adaptation_proposal_context"();

CREATE OR REPLACE FUNCTION "app"."check_routine_version_adaptation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW."adaptation_proposal_id" IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
           FROM "app"."adaptation_proposals" ap
           JOIN "app"."evolution_diagnostics" ed ON ed."id" = ap."diagnostic_id"
           JOIN "app"."routine_versions" evaluated ON evaluated."id" = ed."routine_version_id"
           WHERE ap."id" = NEW."adaptation_proposal_id"
             AND evaluated."routine_id" = NEW."routine_id"
       ) THEN
        RAISE EXCEPTION 'adapted version must belong to the routine evaluated by the proposal'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "routine_versions_adaptation_check"
BEFORE INSERT OR UPDATE OF "routine_id", "adaptation_proposal_id" ON "app"."routine_versions"
FOR EACH ROW EXECUTE FUNCTION "app"."check_routine_version_adaptation"();

CREATE OR REPLACE FUNCTION "app"."check_proposed_adjustment_context"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW."routine_exercise_id" IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
           FROM "app"."adaptation_proposals" ap
           JOIN "app"."evolution_diagnostics" ed ON ed."id" = ap."diagnostic_id"
           JOIN "app"."routine_days" rd ON rd."routine_version_id" = ed."routine_version_id"
           JOIN "app"."routine_exercises" re ON re."routine_day_id" = rd."id"
           WHERE ap."id" = NEW."proposal_id" AND re."id" = NEW."routine_exercise_id"
       ) THEN
        RAISE EXCEPTION 'adjustment target must belong to the evaluated routine version'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "proposed_adjustments_context_check"
BEFORE INSERT OR UPDATE OF "proposal_id", "routine_exercise_id" ON "app"."proposed_adjustments"
FOR EACH ROW EXECUTE FUNCTION "app"."check_proposed_adjustment_context"();

CREATE OR REPLACE FUNCTION "app"."check_personal_record_context"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "app"."training_sessions"
        WHERE "id" = NEW."session_id" AND "student_id" = NEW."student_id"
    ) THEN
        RAISE EXCEPTION 'personal record session must belong to the student'
            USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM "app"."session_set_records"
        WHERE "session_id" = NEW."session_id"
          AND COALESCE("performed_exercise_id", "prescribed_exercise_id") = NEW."exercise_id"
          AND "completed"
          AND NOT "warmup"
    ) THEN
        RAISE EXCEPTION 'personal record exercise must have a completed work set in the session'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "personal_records_context_check"
BEFORE INSERT OR UPDATE OF "student_id", "exercise_id", "session_id" ON "app"."personal_records"
FOR EACH ROW EXECUTE FUNCTION "app"."check_personal_record_context"();

-- Historical outputs are append-only, and frozen prescriptions cannot be rewritten.
CREATE OR REPLACE FUNCTION "app"."reject_historical_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION '% is append-only', TG_TABLE_NAME
        USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "audit_logs_append_only"
BEFORE UPDATE OR DELETE ON "app"."audit_logs"
FOR EACH ROW EXECUTE FUNCTION "app"."reject_historical_mutation"();

CREATE TRIGGER "evolution_diagnostics_append_only"
BEFORE UPDATE OR DELETE ON "app"."evolution_diagnostics"
FOR EACH ROW EXECUTE FUNCTION "app"."reject_historical_mutation"();

CREATE TRIGGER "exercise_diagnostics_append_only"
BEFORE UPDATE OR DELETE ON "app"."exercise_diagnostics"
FOR EACH ROW EXECUTE FUNCTION "app"."reject_historical_mutation"();

CREATE OR REPLACE FUNCTION "app"."protect_frozen_session_prescription"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW."session_id" IS DISTINCT FROM OLD."session_id"
       OR NEW."position" IS DISTINCT FROM OLD."position"
       OR NEW."prescribed_exercise_id" IS DISTINCT FROM OLD."prescribed_exercise_id"
       OR NEW."prescribed_min_repetitions" IS DISTINCT FROM OLD."prescribed_min_repetitions"
       OR NEW."prescribed_max_repetitions" IS DISTINCT FROM OLD."prescribed_max_repetitions"
       OR NEW."prescribed_load" IS DISTINCT FROM OLD."prescribed_load"
       OR NEW."warmup" IS DISTINCT FROM OLD."warmup"
       OR NEW."additional" IS DISTINCT FROM OLD."additional" THEN
        RAISE EXCEPTION 'session prescription is immutable'
            USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "session_set_records_frozen_prescription"
BEFORE UPDATE ON "app"."session_set_records"
FOR EACH ROW EXECUTE FUNCTION "app"."protect_frozen_session_prescription"();
