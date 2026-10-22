-- Expansion only: historical prescription values are never reconstructed.
ALTER TABLE app.training_sessions
  ADD COLUMN snapshot_complete boolean NOT NULL DEFAULT false,
  ADD COLUMN day_name_snapshot text,
  ADD COLUMN day_position_snapshot integer,
  ADD COLUMN version_number_snapshot integer,
  ADD COLUMN timezone_snapshot text,
  ADD CONSTRAINT training_sessions_complete_snapshot_check CHECK (
    NOT snapshot_complete OR (day_name_snapshot IS NOT NULL AND day_position_snapshot IS NOT NULL AND day_position_snapshot > 0
      AND version_number_snapshot IS NOT NULL AND version_number_snapshot > 0 AND timezone_snapshot IS NOT NULL)
  );

ALTER TABLE app.session_set_records
  ADD COLUMN prescribed_exercise_name text,
  ADD COLUMN prescribed_exercise_position integer,
  ADD COLUMN prescribed_set_position integer,
  ADD COLUMN prescribed_rest_seconds integer,
  ADD COLUMN prescribed_note text,
  ADD COLUMN performed_exercise_name text,
  ADD CONSTRAINT session_set_records_snapshot_positions_check CHECK (
    (prescribed_exercise_position IS NULL OR prescribed_exercise_position > 0)
    AND (prescribed_set_position IS NULL OR prescribed_set_position > 0)
    AND (prescribed_rest_seconds IS NULL OR prescribed_rest_seconds >= 0)
  );

CREATE TABLE app.session_additional_set_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES app.training_sessions(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position > 0),
  performed_exercise_id uuid NOT NULL REFERENCES app.exercises(id) ON DELETE RESTRICT,
  performed_exercise_name text NOT NULL,
  warmup boolean NOT NULL DEFAULT false,
  performed_load numeric(10,2) CHECK (performed_load BETWEEN 0 AND 1000),
  performed_repetitions integer CHECK (performed_repetitions BETWEEN 1 AND 100),
  perceived_effort integer CHECK (perceived_effort BETWEEN 1 AND 10),
  completed boolean NOT NULL DEFAULT false,
  omission_reason text,
  atypical_confirmed boolean NOT NULL DEFAULT false,
  CONSTRAINT session_additional_completed_data_check CHECK (
    NOT completed OR (performed_load IS NOT NULL AND performed_repetitions IS NOT NULL AND omission_reason IS NULL)
  )
);
CREATE UNIQUE INDEX session_additional_set_records_session_id_position_key
  ON app.session_additional_set_records(session_id, position);
CREATE INDEX session_additional_set_records_performed_exercise_id_idx
  ON app.session_additional_set_records(performed_exercise_id);
CREATE INDEX training_sessions_student_id_occurred_on_started_at_id_idx
  ON app.training_sessions(student_id, occurred_on DESC, started_at DESC, id DESC);

-- The parent lock serializes writes across the two physical representations.
CREATE FUNCTION app.check_session_global_set_position() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM app.training_sessions WHERE id = NEW.session_id FOR UPDATE;
  IF TG_TABLE_NAME = 'session_set_records' THEN
    IF (SELECT snapshot_complete FROM app.training_sessions WHERE id = NEW.session_id)
       AND (NEW.additional OR NEW.prescribed_exercise_name IS NULL
            OR NEW.prescribed_exercise_position IS NULL OR NEW.prescribed_set_position IS NULL
            OR NEW.prescribed_rest_seconds IS NULL) THEN
      RAISE EXCEPTION 'complete session requires a complete prescription snapshot' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT 1 FROM app.session_additional_set_records
               WHERE session_id = NEW.session_id AND position = NEW.position) THEN
      RAISE EXCEPTION 'duplicate session set position' USING ERRCODE = '23505';
    END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM app.session_set_records
               WHERE session_id = NEW.session_id AND position = NEW.position) THEN
      RAISE EXCEPTION 'duplicate session set position' USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER session_set_records_global_position BEFORE INSERT OR UPDATE OF session_id, position
  ON app.session_set_records FOR EACH ROW EXECUTE FUNCTION app.check_session_global_set_position();
CREATE TRIGGER session_additional_set_records_global_position BEFORE INSERT OR UPDATE OF session_id, position
  ON app.session_additional_set_records FOR EACH ROW EXECUTE FUNCTION app.check_session_global_set_position();

CREATE OR REPLACE FUNCTION app.protect_frozen_session_prescription() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.session_id, NEW.position, NEW.prescribed_exercise_id,
         NEW.prescribed_min_repetitions, NEW.prescribed_max_repetitions,
         NEW.prescribed_load, NEW.warmup, NEW.additional,
         NEW.prescribed_exercise_name, NEW.prescribed_exercise_position,
         NEW.prescribed_set_position, NEW.prescribed_rest_seconds, NEW.prescribed_note)
     IS DISTINCT FROM
     ROW(OLD.session_id, OLD.position, OLD.prescribed_exercise_id,
         OLD.prescribed_min_repetitions, OLD.prescribed_max_repetitions,
         OLD.prescribed_load, OLD.warmup, OLD.additional,
         OLD.prescribed_exercise_name, OLD.prescribed_exercise_position,
         OLD.prescribed_set_position, OLD.prescribed_rest_seconds, OLD.prescribed_note) THEN
    RAISE EXCEPTION 'session prescription is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION app.protect_session_snapshot() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.student_id, NEW.routine_id, NEW.routine_version_id, NEW.routine_day_id,
         NEW.started_at, NEW.occurred_on, NEW.simulated, NEW.snapshot_complete,
         NEW.day_name_snapshot, NEW.day_position_snapshot, NEW.version_number_snapshot, NEW.timezone_snapshot)
     IS DISTINCT FROM
     ROW(OLD.student_id, OLD.routine_id, OLD.routine_version_id, OLD.routine_day_id,
         OLD.started_at, OLD.occurred_on, OLD.simulated, OLD.snapshot_complete,
         OLD.day_name_snapshot, OLD.day_position_snapshot, OLD.version_number_snapshot, OLD.timezone_snapshot) THEN
    RAISE EXCEPTION 'session snapshot is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER training_sessions_frozen_snapshot BEFORE UPDATE ON app.training_sessions
  FOR EACH ROW EXECUTE FUNCTION app.protect_session_snapshot();

CREATE FUNCTION app.protect_additional_set_identity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.session_id, NEW.position, NEW.warmup) IS DISTINCT FROM ROW(OLD.session_id, OLD.position, OLD.warmup) THEN
    RAISE EXCEPTION 'additional set identity is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER session_additional_set_identity BEFORE UPDATE ON app.session_additional_set_records
  FOR EACH ROW EXECUTE FUNCTION app.protect_additional_set_identity();

-- Match the existing explicit runtime-role grants; do not grant AI access.
DO $$
DECLARE runtime_role text;
BEGIN
  FOREACH runtime_role IN ARRAY ARRAY['backend_test', 'backend_prod'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = runtime_role) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE ON app.session_additional_set_records TO %I', runtime_role);
      EXECUTE format('REVOKE DELETE, TRUNCATE ON app.session_additional_set_records FROM %I', runtime_role);
    END IF;
  END LOOP;
END;
$$;
