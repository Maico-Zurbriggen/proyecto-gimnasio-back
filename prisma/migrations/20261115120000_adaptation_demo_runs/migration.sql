ALTER TABLE app.evolution_diagnostics ADD COLUMN simulated boolean NOT NULL DEFAULT false;

CREATE TABLE app.adaptation_demo_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES app.student_profiles(user_id) ON DELETE RESTRICT,
  trainer_id uuid NOT NULL REFERENCES app.trainer_profiles(user_id) ON DELETE RESTRICT,
  scenario text NOT NULL CHECK (scenario IN (
    'ESTIMULO_INSUFICIENTE', 'SOBREEXIGENCIA', 'ESTANCAMIENTO_PRIMERO',
    'ESTANCAMIENTO_SEGUNDO', 'PROGRESION_ADECUADA', 'DATOS_INSUFICIENTES'
  )),
  original_routine_id uuid NOT NULL REFERENCES app.routines(id) ON DELETE RESTRICT,
  original_version_id uuid NOT NULL REFERENCES app.routine_versions(id) ON DELETE RESTRICT,
  prepared_on date NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  restored_at timestamptz,
  CONSTRAINT adaptation_demo_restored_after_creation CHECK (restored_at IS NULL OR restored_at >= created_at)
);
CREATE UNIQUE INDEX adaptation_demo_runs_active_student_key
  ON app.adaptation_demo_runs(student_id) WHERE restored_at IS NULL;
CREATE INDEX adaptation_demo_runs_trainer_id_restored_at_idx ON app.adaptation_demo_runs(trainer_id, restored_at);

ALTER TABLE app.routines ADD COLUMN demo_run_id uuid;
ALTER TABLE app.routines ADD CONSTRAINT routines_demo_run_id_fkey
  FOREIGN KEY (demo_run_id) REFERENCES app.adaptation_demo_runs(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX routines_demo_run_id_key ON app.routines(demo_run_id);
