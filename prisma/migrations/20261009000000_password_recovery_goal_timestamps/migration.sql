BEGIN;

CREATE TABLE app.password_recovery_limits (
  origin_hash TEXT NOT NULL,
  day DATE NOT NULL,
  attempts INTEGER NOT NULL CHECK (attempts BETWEEN 1 AND 3),
  PRIMARY KEY (origin_hash, day)
);

-- Convierte cada fecha hist?rica a medianoche del gimnasio correspondiente.
-- Conserva datos, nombres, claves e ?ndice ?nico parcial de la migraci?n inicial.
CREATE FUNCTION app._migration_goal_timezone(student UUID) RETURNS TEXT
LANGUAGE SQL STABLE AS $$
  SELECT gym.timezone FROM app.users u JOIN app.gyms gym ON gym.id = u.gym_id
  WHERE u.id = student
$$;
ALTER TABLE app.goals DROP CONSTRAINT goals_valid_period_check;
ALTER TABLE app.goals
  ALTER COLUMN starts_on TYPE TIMESTAMPTZ(6)
    USING starts_on::timestamp AT TIME ZONE app._migration_goal_timezone(student_id),
  ALTER COLUMN ends_on TYPE TIMESTAMPTZ(6)
    USING ends_on::timestamp AT TIME ZONE app._migration_goal_timezone(student_id);
ALTER TABLE app.goals ADD CONSTRAINT goals_valid_period_check
  CHECK (ends_on IS NULL OR ends_on > starts_on);
DROP FUNCTION app._migration_goal_timezone(UUID);

COMMIT;
