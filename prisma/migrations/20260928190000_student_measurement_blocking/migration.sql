BEGIN;

-- RF-123 / RF-124: persistent measurement checkpoints and functional blocks.
CREATE TYPE "app"."MeasurementCheckpointResult" AS ENUM ('CUMPLIDO', 'FALTA');
CREATE TYPE "app"."MeasurementBlockState" AS ENUM ('PENDIENTE_MEDICION', 'PENDIENTE_APROBACION', 'RESUELTO');
CREATE TYPE "app"."MeasurementBlockReason" AS ENUM ('TRES_FALTAS_CONSECUTIVAS');

-- Existing heights have no historical confirmation timestamp. Treat the
-- deployment instant as their initial confirmation so rollout does not create
-- false historical misses. Future writes must update this column explicitly.
ALTER TABLE "app"."student_profiles"
    ADD COLUMN "height_updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "app"."student_measurement_checkpoints" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "routine_id" UUID NOT NULL,
    "routine_version_id" UUID NOT NULL,
    "cycle_starts_on" DATE NOT NULL,
    "due_on" DATE NOT NULL,
    "result" "app"."MeasurementCheckpointResult" NOT NULL,
    "weight_measurement_id" UUID,
    "height_confirmed_at" TIMESTAMPTZ(6),
    "evaluated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_measurement_checkpoints_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "student_measurement_checkpoints_cycle_length_check"
        CHECK ("due_on" = "cycle_starts_on" + 60),
    CONSTRAINT "student_measurement_checkpoints_result_evidence_check"
        CHECK (
            ("result" = 'CUMPLIDO' AND "weight_measurement_id" IS NOT NULL AND "height_confirmed_at" IS NOT NULL)
            OR
            ("result" = 'FALTA' AND ("weight_measurement_id" IS NULL OR "height_confirmed_at" IS NULL))
        )
);

CREATE TABLE "app"."student_measurement_blocks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "state" "app"."MeasurementBlockState" NOT NULL DEFAULT 'PENDIENTE_MEDICION',
    "reason" "app"."MeasurementBlockReason" NOT NULL DEFAULT 'TRES_FALTAS_CONSECUTIVAS',
    "consecutive_misses_at_block" INTEGER NOT NULL,
    "triggering_checkpoint_id" UUID NOT NULL,
    "blocked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "regularization_weight_measurement_id" UUID,
    "regularization_height_confirmed_at" TIMESTAMPTZ(6),
    "submitted_at" TIMESTAMPTZ(6),
    "approved_by_trainer_id" UUID,
    "approved_at" TIMESTAMPTZ(6),

    CONSTRAINT "student_measurement_blocks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "student_measurement_blocks_minimum_streak_check"
        CHECK ("consecutive_misses_at_block" >= 3),
    CONSTRAINT "student_measurement_blocks_state_metadata_check"
        CHECK (
            (
                "state" = 'PENDIENTE_MEDICION'
                AND "regularization_weight_measurement_id" IS NULL
                AND "regularization_height_confirmed_at" IS NULL
                AND "submitted_at" IS NULL
                AND "approved_by_trainer_id" IS NULL
                AND "approved_at" IS NULL
            )
            OR
            (
                "state" = 'PENDIENTE_APROBACION'
                AND "regularization_weight_measurement_id" IS NOT NULL
                AND "regularization_height_confirmed_at" IS NOT NULL
                AND "submitted_at" IS NOT NULL
                AND "approved_by_trainer_id" IS NULL
                AND "approved_at" IS NULL
            )
            OR
            (
                "state" = 'RESUELTO'
                AND "regularization_weight_measurement_id" IS NOT NULL
                AND "regularization_height_confirmed_at" IS NOT NULL
                AND "submitted_at" IS NOT NULL
                AND "approved_by_trainer_id" IS NOT NULL
                AND "approved_at" IS NOT NULL
            )
        ),
    CONSTRAINT "student_measurement_blocks_submission_time_check"
        CHECK ("submitted_at" IS NULL OR "submitted_at" >= "blocked_at"),
    CONSTRAINT "student_measurement_blocks_height_time_check"
        CHECK (
            "regularization_height_confirmed_at" IS NULL
            OR "regularization_height_confirmed_at" >= "blocked_at"
        ),
    CONSTRAINT "student_measurement_blocks_approval_time_check"
        CHECK (
            "approved_at" IS NULL
            OR ("submitted_at" IS NOT NULL AND "approved_at" >= "submitted_at")
        )
);

CREATE UNIQUE INDEX "student_measurement_checkpoints_student_id_due_on_key"
    ON "app"."student_measurement_checkpoints"("student_id", "due_on");
CREATE UNIQUE INDEX "student_measurement_checkpoints_weight_measurement_id_key"
    ON "app"."student_measurement_checkpoints"("weight_measurement_id");
CREATE INDEX "student_measurement_checkpoints_student_id_evaluated_at_idx"
    ON "app"."student_measurement_checkpoints"("student_id", "evaluated_at");
CREATE INDEX "student_measurement_checkpoints_result_due_on_idx"
    ON "app"."student_measurement_checkpoints"("result", "due_on");

CREATE UNIQUE INDEX "student_measurement_blocks_triggering_checkpoint_id_key"
    ON "app"."student_measurement_blocks"("triggering_checkpoint_id");
CREATE UNIQUE INDEX "student_measurement_blocks_regularization_weight_measurement_id_key"
    ON "app"."student_measurement_blocks"("regularization_weight_measurement_id");
CREATE UNIQUE INDEX "student_measurement_blocks_one_active_per_student_idx"
    ON "app"."student_measurement_blocks"("student_id")
    WHERE "state" <> 'RESUELTO';
CREATE INDEX "student_measurement_blocks_student_id_state_idx"
    ON "app"."student_measurement_blocks"("student_id", "state");
CREATE INDEX "student_measurement_blocks_approved_by_trainer_id_approved_at_idx"
    ON "app"."student_measurement_blocks"("approved_by_trainer_id", "approved_at");

ALTER TABLE "app"."student_measurement_checkpoints"
    ADD CONSTRAINT "student_measurement_checkpoints_student_id_fkey"
        FOREIGN KEY ("student_id") REFERENCES "app"."student_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "student_measurement_checkpoints_routine_id_fkey"
        FOREIGN KEY ("routine_id") REFERENCES "app"."routines"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "student_measurement_checkpoints_routine_version_id_fkey"
        FOREIGN KEY ("routine_version_id") REFERENCES "app"."routine_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "student_measurement_checkpoints_weight_measurement_id_fkey"
        FOREIGN KEY ("weight_measurement_id") REFERENCES "app"."body_measurements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "app"."student_measurement_blocks"
    ADD CONSTRAINT "student_measurement_blocks_student_id_fkey"
        FOREIGN KEY ("student_id") REFERENCES "app"."student_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "student_measurement_blocks_triggering_checkpoint_id_fkey"
        FOREIGN KEY ("triggering_checkpoint_id") REFERENCES "app"."student_measurement_checkpoints"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "student_measurement_blocks_regularization_weight_measurement_id_fkey"
        FOREIGN KEY ("regularization_weight_measurement_id") REFERENCES "app"."body_measurements"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "student_measurement_blocks_approved_by_trainer_id_fkey"
        FOREIGN KEY ("approved_by_trainer_id") REFERENCES "app"."trainer_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "app"."check_measurement_checkpoint_context"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    routine_student_id UUID;
    version_routine_id UUID;
    measurement_student_id UUID;
    measurement_type "app"."BodyMeasurementType";
    measurement_date DATE;
    gym_timezone TEXT;
BEGIN
    SELECT r."student_id", rv."routine_id"
      INTO routine_student_id, version_routine_id
      FROM "app"."routines" r
      JOIN "app"."routine_versions" rv ON rv."id" = NEW."routine_version_id"
     WHERE r."id" = NEW."routine_id";

    IF routine_student_id IS NULL
       OR routine_student_id <> NEW."student_id"
       OR version_routine_id <> NEW."routine_id" THEN
        RAISE EXCEPTION 'measurement checkpoint must use a routine and version of the same student'
            USING ERRCODE = '23514';
    END IF;

    SELECT g."timezone"
      INTO gym_timezone
      FROM "app"."student_profiles" sp
      JOIN "app"."users" u ON u."id" = sp."user_id"
      JOIN "app"."gyms" g ON g."id" = u."gym_id"
     WHERE sp."user_id" = NEW."student_id";

    IF NEW."weight_measurement_id" IS NOT NULL THEN
        SELECT bm."student_id", bm."type", bm."measured_on"
          INTO measurement_student_id, measurement_type, measurement_date
          FROM "app"."body_measurements" bm
         WHERE bm."id" = NEW."weight_measurement_id";

        IF measurement_student_id IS NULL
           OR measurement_student_id <> NEW."student_id"
           OR measurement_type <> 'PESO_CORPORAL'
           OR measurement_date <= NEW."cycle_starts_on"
           OR measurement_date > NEW."due_on" THEN
            RAISE EXCEPTION 'checkpoint weight must be a body-weight measurement from the same student and cycle'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW."height_confirmed_at" IS NOT NULL
       AND (
           (NEW."height_confirmed_at" AT TIME ZONE gym_timezone)::date <= NEW."cycle_starts_on"
           OR (NEW."height_confirmed_at" AT TIME ZONE gym_timezone)::date > NEW."due_on"
       ) THEN
        RAISE EXCEPTION 'checkpoint height confirmation must belong to the evaluated cycle'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "student_measurement_checkpoints_context_check"
BEFORE INSERT ON "app"."student_measurement_checkpoints"
FOR EACH ROW EXECUTE FUNCTION "app"."check_measurement_checkpoint_context"();

CREATE TRIGGER "student_measurement_checkpoints_append_only"
BEFORE UPDATE OR DELETE ON "app"."student_measurement_checkpoints"
FOR EACH ROW EXECUTE FUNCTION "app"."reject_historical_mutation"();

CREATE OR REPLACE FUNCTION "app"."check_measurement_block_context"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    checkpoint_student_id UUID;
    checkpoint_result "app"."MeasurementCheckpointResult";
    measurement_student_id UUID;
    measurement_type "app"."BodyMeasurementType";
    measurement_date DATE;
    gym_timezone TEXT;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF OLD."state" = 'RESUELTO' THEN
            RAISE EXCEPTION 'resolved measurement blocks are immutable'
                USING ERRCODE = '23514';
        END IF;

        IF OLD."student_id" <> NEW."student_id"
           OR OLD."triggering_checkpoint_id" <> NEW."triggering_checkpoint_id"
           OR OLD."blocked_at" <> NEW."blocked_at"
           OR OLD."reason" <> NEW."reason"
           OR OLD."consecutive_misses_at_block" <> NEW."consecutive_misses_at_block" THEN
            RAISE EXCEPTION 'measurement block identity and origin are immutable'
                USING ERRCODE = '23514';
        END IF;

        IF OLD."state" = 'PENDIENTE_MEDICION' AND NEW."state" NOT IN ('PENDIENTE_MEDICION', 'PENDIENTE_APROBACION') THEN
            RAISE EXCEPTION 'measurement block must receive evidence before approval'
                USING ERRCODE = '23514';
        END IF;

        IF OLD."state" = 'PENDIENTE_APROBACION' AND NEW."state" NOT IN ('PENDIENTE_APROBACION', 'RESUELTO') THEN
            RAISE EXCEPTION 'measurement block cannot move backwards'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    SELECT c."student_id", c."result"
      INTO checkpoint_student_id, checkpoint_result
      FROM "app"."student_measurement_checkpoints" c
     WHERE c."id" = NEW."triggering_checkpoint_id";

    IF checkpoint_student_id IS NULL
       OR checkpoint_student_id <> NEW."student_id"
       OR checkpoint_result <> 'FALTA' THEN
        RAISE EXCEPTION 'measurement block must reference a missing checkpoint of the same student'
            USING ERRCODE = '23514';
    END IF;

    SELECT g."timezone"
      INTO gym_timezone
      FROM "app"."student_profiles" sp
      JOIN "app"."users" u ON u."id" = sp."user_id"
      JOIN "app"."gyms" g ON g."id" = u."gym_id"
     WHERE sp."user_id" = NEW."student_id";

    IF NEW."regularization_weight_measurement_id" IS NOT NULL THEN
        SELECT bm."student_id", bm."type", bm."measured_on"
          INTO measurement_student_id, measurement_type, measurement_date
          FROM "app"."body_measurements" bm
         WHERE bm."id" = NEW."regularization_weight_measurement_id";

        IF measurement_student_id IS NULL
           OR measurement_student_id <> NEW."student_id"
           OR measurement_type <> 'PESO_CORPORAL'
           OR measurement_date < (NEW."blocked_at" AT TIME ZONE gym_timezone)::date THEN
            RAISE EXCEPTION 'regularization weight must belong to the blocked student and be measured after blocking'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW."state" = 'RESUELTO' AND NOT EXISTS (
        SELECT 1
          FROM "app"."trainer_student_assignments" a
         WHERE a."student_id" = NEW."student_id"
           AND a."trainer_id" = NEW."approved_by_trainer_id"
           AND a."starts_at" <= NEW."approved_at"
           AND (a."ends_at" IS NULL OR a."ends_at" > NEW."approved_at")
    ) THEN
        RAISE EXCEPTION 'measurement block approver must be assigned to the student at approval time'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "student_measurement_blocks_context_check"
BEFORE INSERT OR UPDATE ON "app"."student_measurement_blocks"
FOR EACH ROW EXECUTE FUNCTION "app"."check_measurement_block_context"();

-- Explicit runtime grants make the migration safe even if default privileges
-- were configured by a different owner. Clean CI databases simply skip them.
DO $$
DECLARE
    runtime_role TEXT;
BEGIN
    FOREACH runtime_role IN ARRAY ARRAY['backend_test', 'backend_prod'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = runtime_role) THEN
            EXECUTE format('GRANT USAGE ON SCHEMA app TO %I', runtime_role);
            EXECUTE format(
                'GRANT SELECT, INSERT ON TABLE app.student_measurement_checkpoints TO %I',
                runtime_role
            );
            EXECUTE format(
                'GRANT SELECT, INSERT, UPDATE ON TABLE app.student_measurement_blocks TO %I',
                runtime_role
            );
            EXECUTE format(
                'REVOKE UPDATE, DELETE, TRUNCATE ON TABLE app.student_measurement_checkpoints FROM %I',
                runtime_role
            );
            EXECUTE format(
                'REVOKE DELETE, TRUNCATE ON TABLE app.student_measurement_blocks FROM %I',
                runtime_role
            );
        END IF;
    END LOOP;
END;
$$;

COMMIT;
