-- Vivaz Adaptive - escenario aislado para presentacion
--
-- Ejecutar con el rol migrador sobre la base elegida para la demo.
-- Requisitos:
--   1. Estructura vigente y seed-reference.sql aplicados.
--   2. pgcrypto disponible (Neon lo incluye).
--
-- Es reiniciable: vuelve a dejar cuatro propuestas PENDIENTES y elimina las
-- versiones que una ejecucion anterior de la demo haya creado al aprobarlas.
-- Las sesiones son SIMULADAS y los diagnosticos usan component_version
-- `seed-demo-*`; no deben presentarse como actividad real ni alimentan jobs.
--
-- La clave compartida se genera durante la ejecucion y aparece como NOTICE.
-- No queda ninguna credencial en este archivo ni en el repositorio.

BEGIN;

SELECT pg_advisory_xact_lock(hashtext('vivaz-presentation-demo-v1'));

DO $$
BEGIN
  IF to_regclass('app.evolution_diagnostics') IS NULL
     OR to_regclass('app.adaptation_proposals') IS NULL
     OR to_regclass('app.training_sessions') IS NULL THEN
    RAISE EXCEPTION 'Falta aplicar la estructura vigente de la base de datos';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM app.exercises
    WHERE id = 'e0000000-0003-4000-8000-000000000003'
      AND state = 'APROBADO'
  ) THEN
    RAISE EXCEPTION 'Falta seed-reference.sql: no existe Press de banca plano';
  END IF;
END $$;

CREATE TEMP TABLE demo_people (
  user_id uuid PRIMARY KEY,
  email text NOT NULL,
  display_name text NOT NULL,
  role app."UserRole" NOT NULL,
  case_key text
) ON COMMIT DROP;

INSERT INTO demo_people VALUES
  ('d1000000-0000-4000-8000-000000000001', 'admin.demo@vivaz.test', 'Administracion Demo', 'ADMINISTRADOR', NULL),
  ('d1000000-0000-4000-8000-000000000002', 'entrenador.demo@vivaz.test', 'Valentina Demo', 'ENTRENADOR', NULL),
  ('d1000000-0000-4000-8000-000000000101', 'estimulo.demo@vivaz.test', 'Demo 1 - Estimulo insuficiente', 'ALUMNO', 'ESTIMULO'),
  ('d1000000-0000-4000-8000-000000000102', 'sobreexigencia.demo@vivaz.test', 'Demo 2 - Sobreexigencia', 'ALUMNO', 'SOBREEXIGENCIA'),
  ('d1000000-0000-4000-8000-000000000103', 'estancamiento.demo@vivaz.test', 'Demo 3 - Primer estancamiento', 'ALUMNO', 'ESTANCAMIENTO_1'),
  ('d1000000-0000-4000-8000-000000000104', 'sustitucion.demo@vivaz.test', 'Demo 4 - Estancamiento consecutivo', 'ALUMNO', 'ESTANCAMIENTO_2'),
  ('d1000000-0000-4000-8000-000000000105', 'progresion.demo@vivaz.test', 'Demo 5 - Progresion adecuada', 'ALUMNO', 'PROGRESION'),
  ('d1000000-0000-4000-8000-000000000106', 'insuficiente.demo@vivaz.test', 'Demo 6 - Datos insuficientes', 'ALUMNO', 'INSUFICIENTE');

-- -------------------------------------------------------------------------
-- Reinicio de los resultados mutables de una demostracion anterior.
-- -------------------------------------------------------------------------
DELETE FROM app.notices
WHERE recipient_user_id IN (SELECT user_id FROM demo_people);

DELETE FROM app.routine_proposal_regenerations
WHERE proposal_id IN (
  'd8000000-0000-4000-8000-000000000101',
  'd8000000-0000-4000-8000-000000000102',
  'd8000000-0000-4000-8000-000000000103',
  'd8000000-0000-4000-8000-000000000104'
);

DELETE FROM app.routine_renewal_cycles
WHERE routine_version_id IN (
  SELECT id FROM app.routine_versions
  WHERE routine_id IN (
    SELECT id FROM app.routines
    WHERE student_id IN (SELECT user_id FROM demo_people WHERE role = 'ALUMNO')
  )
);

DELETE FROM app.routine_reviews
WHERE reviewed_version_id IN (
  SELECT id FROM app.routine_versions
  WHERE adaptation_proposal_id IN (
    'd8000000-0000-4000-8000-000000000101',
    'd8000000-0000-4000-8000-000000000102',
    'd8000000-0000-4000-8000-000000000103',
    'd8000000-0000-4000-8000-000000000104'
  )
);

UPDATE app.adaptation_proposals
SET resulting_version_id = NULL
WHERE id IN (
  'd8000000-0000-4000-8000-000000000101',
  'd8000000-0000-4000-8000-000000000102',
  'd8000000-0000-4000-8000-000000000103',
  'd8000000-0000-4000-8000-000000000104'
);

DELETE FROM app.routine_versions
WHERE adaptation_proposal_id IN (
  'd8000000-0000-4000-8000-000000000101',
  'd8000000-0000-4000-8000-000000000102',
  'd8000000-0000-4000-8000-000000000103',
  'd8000000-0000-4000-8000-000000000104'
);

DELETE FROM app.proposed_adjustments
WHERE proposal_id IN (
  'd8000000-0000-4000-8000-000000000101',
  'd8000000-0000-4000-8000-000000000102',
  'd8000000-0000-4000-8000-000000000103',
  'd8000000-0000-4000-8000-000000000104'
);

DELETE FROM app.adaptation_proposals
WHERE student_id IN (SELECT user_id FROM demo_people WHERE role = 'ALUMNO');

DELETE FROM app.personal_records
WHERE student_id IN (SELECT user_id FROM demo_people WHERE role = 'ALUMNO');

DELETE FROM app.training_sessions
WHERE student_id IN (SELECT user_id FROM demo_people WHERE role = 'ALUMNO');

DELETE FROM app.student_measurement_blocks
WHERE student_id IN (SELECT user_id FROM demo_people WHERE role = 'ALUMNO');

DELETE FROM app.student_measurement_checkpoints
WHERE student_id IN (SELECT user_id FROM demo_people WHERE role = 'ALUMNO');

DELETE FROM app.routine_reviews
WHERE routine_id IN (
  SELECT id FROM app.routines
  WHERE student_id IN (SELECT user_id FROM demo_people WHERE role = 'ALUMNO')
);

-- Los diagnósticos son append-only y referencian la versión base. Se conserva
-- esa versión y sólo se reconstruyen sus días, ejercicios y prescripciones.
DELETE FROM app.routine_days
WHERE routine_version_id IN (
  'd4000000-0000-4000-8000-000000000101',
  'd4000000-0000-4000-8000-000000000102',
  'd4000000-0000-4000-8000-000000000103',
  'd4000000-0000-4000-8000-000000000104',
  'd4000000-0000-4000-8000-000000000105',
  'd4000000-0000-4000-8000-000000000106'
);

DELETE FROM app.goals
WHERE student_id IN (SELECT user_id FROM demo_people WHERE role = 'ALUMNO');

DELETE FROM app.body_measurements
WHERE student_id IN (SELECT user_id FROM demo_people WHERE role = 'ALUMNO');

DELETE FROM app.trainer_student_assignments
WHERE student_id IN (SELECT user_id FROM demo_people WHERE role = 'ALUMNO');

-- Invalidar accesos y recuperos anteriores cada vez que se regenera la clave.
DELETE FROM app.auth_sessions
WHERE user_id IN (SELECT user_id FROM demo_people);

DELETE FROM app.password_reset_tokens
WHERE user_id IN (SELECT user_id FROM demo_people);

-- -------------------------------------------------------------------------
-- Gimnasio, cuentas y perfiles. La contrasena se genera y solo se imprime.
-- -------------------------------------------------------------------------
INSERT INTO app.gyms (id, name, timezone, active, is_platform, created_at)
VALUES (
  'd0000000-0000-4000-8000-000000000001',
  'Vivaz Demo - Presentacion',
  'America/Argentina/Buenos_Aires',
  true,
  false,
  CURRENT_TIMESTAMP
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  timezone = EXCLUDED.timezone,
  active = true;

DO $$
DECLARE
  -- El prefijo garantiza mayuscula, minuscula y numero; el sufijo aporta
  -- entropia y evita guardar una credencial reutilizable en Git.
  generated_password text := 'VivazDemo-2026-' || encode(gen_random_bytes(6), 'hex');
  generated_hash text := crypt(generated_password, gen_salt('bf', 12));
BEGIN
  INSERT INTO app.users
    (id, gym_id, email_normalized, display_name, password_hash, state, created_at)
  SELECT
    user_id,
    'd0000000-0000-4000-8000-000000000001'::uuid,
    lower(email),
    display_name,
    generated_hash,
    'ACTIVO',
    CURRENT_TIMESTAMP
  FROM demo_people
  ON CONFLICT (id) DO UPDATE SET
    email_normalized = EXCLUDED.email_normalized,
    display_name = EXCLUDED.display_name,
    password_hash = EXCLUDED.password_hash,
    state = 'ACTIVO';

  RAISE NOTICE 'CREDENCIAL DEMO (todas las cuentas): %', generated_password;
END $$;

DELETE FROM app.user_roles
WHERE user_id IN (SELECT user_id FROM demo_people);

INSERT INTO app.user_roles (user_id, role)
SELECT user_id, role FROM demo_people
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO app.trainer_profiles
  (user_id, specialty, experience_years, presentation)
VALUES (
  'd1000000-0000-4000-8000-000000000002',
  'Entrenamiento de fuerza y adaptacion',
  8,
  'Entrenadora responsable de los escenarios de demostracion.'
)
ON CONFLICT (user_id) DO UPDATE SET
  specialty = EXCLUDED.specialty,
  experience_years = EXCLUDED.experience_years,
  presentation = EXCLUDED.presentation;

INSERT INTO app.student_profiles
  (user_id, birth_date, sex, height_cm, height_updated_at,
   experience_level, available_days_per_week, no_conditions_declared_at)
SELECT
  user_id,
  DATE '1995-06-15',
  'FEMENINO',
  168.00,
  CURRENT_TIMESTAMP - INTERVAL '7 days',
  'INTERMEDIO',
  3,
  CURRENT_TIMESTAMP - INTERVAL '30 days'
FROM demo_people
WHERE role = 'ALUMNO'
ON CONFLICT (user_id) DO UPDATE SET
  birth_date = EXCLUDED.birth_date,
  sex = EXCLUDED.sex,
  height_cm = EXCLUDED.height_cm,
  height_updated_at = EXCLUDED.height_updated_at,
  experience_level = EXCLUDED.experience_level,
  available_days_per_week = EXCLUDED.available_days_per_week,
  no_conditions_declared_at = EXCLUDED.no_conditions_declared_at;

DELETE FROM app.consents
WHERE user_id IN (SELECT user_id FROM demo_people WHERE role = 'ALUMNO')
  AND type = 'DATOS_SALUD';

INSERT INTO app.consents
  (id, user_id, type, granted, accepted_text, recorded_at)
SELECT
  gen_random_uuid(), user_id, 'DATOS_SALUD', true,
  'Consentimiento de demostracion para datos simulados.',
  CURRENT_TIMESTAMP - INTERVAL '30 days'
FROM demo_people
WHERE role = 'ALUMNO';

INSERT INTO app.goals (id, student_id, type, starts_on, ends_on)
SELECT
  gen_random_uuid(), user_id, 'HIPERTROFIA',
  CURRENT_TIMESTAMP - INTERVAL '60 days', NULL
FROM demo_people
WHERE role = 'ALUMNO';

INSERT INTO app.body_measurements
  (id, student_id, type, value, measured_on)
SELECT
  gen_random_uuid(), user_id, 'PESO_CORPORAL', 68.00,
  CURRENT_DATE - 7
FROM demo_people
WHERE role = 'ALUMNO';

INSERT INTO app.trainer_student_assignments
  (id, student_id, trainer_id, starts_at, ends_at, started_by_user_id)
SELECT
  gen_random_uuid(), user_id,
  'd1000000-0000-4000-8000-000000000002',
  CURRENT_TIMESTAMP - INTERVAL '90 days', NULL,
  'd1000000-0000-4000-8000-000000000001'
FROM demo_people
WHERE role = 'ALUMNO';

-- Inventario completo para explicar catalogo y dos ejercicios habilitados.
INSERT INTO app.gym_equipment
  (gym_id, equipment_code, present, updated_by_user_id, updated_at)
SELECT
  'd0000000-0000-4000-8000-000000000001', code, true,
  'd1000000-0000-4000-8000-000000000001', CURRENT_TIMESTAMP
FROM app.equipment
ON CONFLICT (gym_id, equipment_code) DO UPDATE SET
  present = true,
  updated_by_user_id = EXCLUDED.updated_by_user_id,
  updated_at = EXCLUDED.updated_at;

CREATE TEMP TABLE demo_exercises (
  purpose text PRIMARY KEY,
  exercise_id uuid NOT NULL
) ON COMMIT DROP;

INSERT INTO demo_exercises VALUES
  ('PRIMARY', 'e0000000-0003-4000-8000-000000000003');

INSERT INTO demo_exercises
SELECT 'ALTERNATIVE', id
FROM app.exercises
WHERE state = 'APROBADO'
  AND movement_pattern = 'EMPUJE_HORIZONTAL'
  AND id <> 'e0000000-0003-4000-8000-000000000003'
ORDER BY CASE WHEN id = '10000000-0000-4000-8000-000000000015' THEN 0 ELSE 1 END,
         name
LIMIT 1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM demo_exercises WHERE purpose = 'ALTERNATIVE') THEN
    RAISE EXCEPTION 'La demo de sustitucion necesita otro EMPUJE_HORIZONTAL aprobado';
  END IF;
END $$;

INSERT INTO app.gym_exercises
  (gym_id, exercise_id, enabled, updated_by_user_id, updated_at)
SELECT
  'd0000000-0000-4000-8000-000000000001', exercise_id, true,
  'd1000000-0000-4000-8000-000000000001', CURRENT_TIMESTAMP
FROM demo_exercises
ON CONFLICT (gym_id, exercise_id) DO UPDATE SET
  enabled = true,
  updated_by_user_id = EXCLUDED.updated_by_user_id,
  updated_at = EXCLUDED.updated_at;

INSERT INTO app.routine_templates
  (id, gym_id, author_trainer_id, name, routine_type, active)
VALUES (
  'd2000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000002',
  'Base demo de evolucion', 'HIPERTROFIA', true
)
ON CONFLICT (id) DO UPDATE SET active = true, name = EXCLUDED.name;

CREATE TEMP TABLE demo_cases (
  case_key text PRIMARY KEY,
  student_id uuid NOT NULL,
  routine_id uuid NOT NULL,
  version_id uuid NOT NULL,
  day_id uuid NOT NULL,
  routine_exercise_id uuid NOT NULL,
  work_sets integer NOT NULL,
  min_reps integer NOT NULL,
  max_reps integer NOT NULL,
  suggested_load numeric(10,2) NOT NULL
) ON COMMIT DROP;

INSERT INTO demo_cases VALUES
  ('ESTIMULO', 'd1000000-0000-4000-8000-000000000101', 'd3000000-0000-4000-8000-000000000101', 'd4000000-0000-4000-8000-000000000101', 'd5000000-0000-4000-8000-000000000101', 'd6000000-0000-4000-8000-000000000101', 3, 8, 12, 60.00),
  ('SOBREEXIGENCIA', 'd1000000-0000-4000-8000-000000000102', 'd3000000-0000-4000-8000-000000000102', 'd4000000-0000-4000-8000-000000000102', 'd5000000-0000-4000-8000-000000000102', 'd6000000-0000-4000-8000-000000000102', 4, 8, 10, 50.00),
  ('ESTANCAMIENTO_1', 'd1000000-0000-4000-8000-000000000103', 'd3000000-0000-4000-8000-000000000103', 'd4000000-0000-4000-8000-000000000103', 'd5000000-0000-4000-8000-000000000103', 'd6000000-0000-4000-8000-000000000103', 3, 8, 10, 50.00),
  ('ESTANCAMIENTO_2', 'd1000000-0000-4000-8000-000000000104', 'd3000000-0000-4000-8000-000000000104', 'd4000000-0000-4000-8000-000000000104', 'd5000000-0000-4000-8000-000000000104', 'd6000000-0000-4000-8000-000000000104', 3, 8, 10, 50.00),
  ('PROGRESION', 'd1000000-0000-4000-8000-000000000105', 'd3000000-0000-4000-8000-000000000105', 'd4000000-0000-4000-8000-000000000105', 'd5000000-0000-4000-8000-000000000105', 'd6000000-0000-4000-8000-000000000105', 3, 8, 12, 50.00),
  ('INSUFICIENTE', 'd1000000-0000-4000-8000-000000000106', 'd3000000-0000-4000-8000-000000000106', 'd4000000-0000-4000-8000-000000000106', 'd5000000-0000-4000-8000-000000000106', 'd6000000-0000-4000-8000-000000000106', 3, 8, 12, 50.00);

INSERT INTO app.routines
  (id, student_id, source_template_id, source_generation_result_id,
   routine_type, target_weekly_frequency, state, origin,
   requested_by_user_id, requested_at)
SELECT
  routine_id, student_id,
  'd2000000-0000-4000-8000-000000000001', NULL,
  'HIPERTROFIA', 3, 'VIGENTE', 'PLANTILLA_ENTRENADOR',
  'd1000000-0000-4000-8000-000000000002',
  CURRENT_TIMESTAMP - INTERVAL '50 days'
FROM demo_cases
ON CONFLICT (id) DO UPDATE SET
  state = 'VIGENTE',
  source_template_id = EXCLUDED.source_template_id,
  source_generation_result_id = NULL,
  requested_by_user_id = EXCLUDED.requested_by_user_id,
  requested_at = EXCLUDED.requested_at;

INSERT INTO app.routine_versions
  (id, routine_id, version_number, current, created_by_user_id, created_at)
SELECT
  version_id, routine_id, 1, true,
  'd1000000-0000-4000-8000-000000000002',
  CURRENT_TIMESTAMP - INTERVAL '49 days'
FROM demo_cases
ON CONFLICT (id) DO UPDATE SET
  current = true,
  created_by_user_id = EXCLUDED.created_by_user_id,
  adaptation_proposal_id = NULL,
  created_at = EXCLUDED.created_at;

INSERT INTO app.routine_days
  (id, routine_version_id, position, name, dominant_pattern)
SELECT day_id, version_id, 1, 'Dia A - Empuje', 'EMPUJE_HORIZONTAL'
FROM demo_cases;

INSERT INTO app.routine_exercises
  (id, routine_day_id, exercise_id, position, note,
   compatibility_state, compatibility_reason)
SELECT
  routine_exercise_id, day_id,
  (SELECT exercise_id FROM demo_exercises WHERE purpose = 'PRIMARY'),
  1, 'Ejercicio representativo del escenario ' || case_key,
  'COMPATIBLE', NULL
FROM demo_cases;

INSERT INTO app.prescribed_sets
  (id, routine_exercise_id, position, min_repetitions, max_repetitions,
   suggested_load, rest_seconds, warmup)
SELECT
  gen_random_uuid(), c.routine_exercise_id, positions.position,
  c.min_reps, c.max_reps, c.suggested_load, 90, false
FROM demo_cases c
CROSS JOIN LATERAL generate_series(1, c.work_sets) AS positions(position);

INSERT INTO app.routine_reviews
  (id, routine_id, reviewed_version_id, reviewer_trainer_id,
   result, observation, reviewed_at)
SELECT
  gen_random_uuid(), routine_id, version_id,
  'd1000000-0000-4000-8000-000000000002',
  'APROBADA', 'Rutina base aprobada para la demostracion.',
  CURRENT_TIMESTAMP - INTERVAL '45 days'
FROM demo_cases;

-- -------------------------------------------------------------------------
-- Historial visible. `simulated = true` impide que los jobs lo tomen por real.
-- -------------------------------------------------------------------------
CREATE TEMP TABLE demo_session_plan (
  case_key text NOT NULL,
  day_offset integer NOT NULL,
  performed_load numeric(10,2) NOT NULL,
  performed_reps integer NOT NULL,
  effort integer NOT NULL
) ON COMMIT DROP;

INSERT INTO demo_session_plan VALUES
  ('ESTIMULO', 35, 60.00, 12, 4), ('ESTIMULO', 28, 60.00, 12, 4),
  ('ESTIMULO', 14, 60.00, 12, 4), ('ESTIMULO', 7, 60.00, 12, 4),
  ('SOBREEXIGENCIA', 35, 50.00, 10, 7), ('SOBREEXIGENCIA', 28, 50.00, 6, 9),
  ('SOBREEXIGENCIA', 14, 50.00, 6, 9), ('SOBREEXIGENCIA', 7, 50.00, 6, 9),
  ('ESTANCAMIENTO_1', 35, 50.00, 8, 7), ('ESTANCAMIENTO_1', 28, 50.00, 8, 7),
  ('ESTANCAMIENTO_1', 14, 50.00, 8, 7), ('ESTANCAMIENTO_1', 7, 50.00, 8, 7),
  ('ESTANCAMIENTO_2', 35, 50.00, 8, 7), ('ESTANCAMIENTO_2', 28, 50.00, 8, 7),
  ('ESTANCAMIENTO_2', 14, 50.00, 8, 7), ('ESTANCAMIENTO_2', 7, 50.00, 8, 7),
  ('PROGRESION', 35, 50.00, 10, 7), ('PROGRESION', 28, 50.00, 10, 7),
  ('PROGRESION', 14, 52.50, 10, 7), ('PROGRESION', 7, 52.50, 10, 7),
  ('INSUFICIENTE', 35, 50.00, 10, 7), ('INSUFICIENTE', 14, 50.00, 10, 7),
  ('INSUFICIENTE', 7, 50.00, 10, 7);

CREATE TEMP TABLE demo_sessions ON COMMIT DROP AS
SELECT
  gen_random_uuid() AS session_id,
  p.case_key,
  p.day_offset,
  p.performed_load,
  p.performed_reps,
  p.effort,
  c.student_id,
  c.routine_id,
  c.version_id,
  c.day_id,
  c.routine_exercise_id,
  c.work_sets,
  c.min_reps,
  c.max_reps,
  c.suggested_load
FROM demo_session_plan p
JOIN demo_cases c USING (case_key);

INSERT INTO app.training_sessions
  (id, student_id, routine_id, routine_version_id, routine_day_id,
   state, started_at, completed_at, occurred_on, last_activity_at,
   simulated, snapshot_complete, day_name_snapshot,
   day_position_snapshot, version_number_snapshot, timezone_snapshot)
SELECT
  session_id, student_id, routine_id, version_id, day_id,
  'COMPLETADA',
  (CURRENT_DATE - day_offset) + TIME '18:00',
  (CURRENT_DATE - day_offset) + TIME '19:00',
  CURRENT_DATE - day_offset,
  (CURRENT_DATE - day_offset) + TIME '19:00',
  true, true, 'Dia A - Empuje', 1, 1,
  'America/Argentina/Buenos_Aires'
FROM demo_sessions;

INSERT INTO app.session_set_records
  (id, session_id, position, prescribed_exercise_id, performed_exercise_id,
   prescribed_min_repetitions, prescribed_max_repetitions, prescribed_load,
   prescribed_exercise_name, prescribed_exercise_position,
   prescribed_set_position, prescribed_rest_seconds, prescribed_note,
   performed_exercise_name, warmup, performed_load, performed_repetitions,
   perceived_effort, completed, additional, omission_reason, atypical_confirmed)
SELECT
  gen_random_uuid(), s.session_id, positions.position,
  e.exercise_id, e.exercise_id,
  s.min_reps, s.max_reps, s.suggested_load,
  ex.name, 1, positions.position, 90,
  'Serie simulada para presentacion', ex.name,
  false, s.performed_load, s.performed_reps, s.effort,
  true, false, NULL, false
FROM demo_sessions s
CROSS JOIN LATERAL generate_series(1, s.work_sets) AS positions(position)
CROSS JOIN demo_exercises e
JOIN app.exercises ex ON ex.id = e.exercise_id
WHERE e.purpose = 'PRIMARY';

-- -------------------------------------------------------------------------
-- Diagnosticos y propuestas simuladas, legibles y listas para revisar.
-- -------------------------------------------------------------------------
INSERT INTO app.evolution_diagnostics
  (id, student_id, routine_version_id, period_start, period_end,
   global_situation, adherence, component_version,
   criteria_not_evaluated, global_findings, calculated_at)
VALUES
  ('d7000000-0000-4000-8000-000000000101', 'd1000000-0000-4000-8000-000000000101', 'd4000000-0000-4000-8000-000000000101', CURRENT_DATE - 42, CURRENT_DATE, 'ESTIMULO_INSUFICIENTE', 66.67, 'seed-demo-evolution@1', '[]', '{"lowAdherenceWeeks":0,"imbalances":[],"goalChange":null}', CURRENT_TIMESTAMP - INTERVAL '5 minutes'),
  ('d7000000-0000-4000-8000-000000000102', 'd1000000-0000-4000-8000-000000000102', 'd4000000-0000-4000-8000-000000000102', CURRENT_DATE - 42, CURRENT_DATE, 'SOBREEXIGENCIA', 66.67, 'seed-demo-evolution@1', '[]', '{"lowAdherenceWeeks":0,"imbalances":[],"goalChange":null}', CURRENT_TIMESTAMP - INTERVAL '4 minutes'),
  ('d7000000-0000-4000-8000-000000000103', 'd1000000-0000-4000-8000-000000000103', 'd4000000-0000-4000-8000-000000000103', CURRENT_DATE - 42, CURRENT_DATE, 'ESTANCAMIENTO', 66.67, 'seed-demo-evolution@1', '[]', '{"lowAdherenceWeeks":0,"imbalances":[],"goalChange":null}', CURRENT_TIMESTAMP - INTERVAL '3 minutes'),
  ('d7000000-0000-4000-8000-000000000114', 'd1000000-0000-4000-8000-000000000104', 'd4000000-0000-4000-8000-000000000104', CURRENT_DATE - 56, CURRENT_DATE - 14, 'ESTANCAMIENTO', 66.67, 'seed-demo-evolution@1', '[]', '{"lowAdherenceWeeks":0,"imbalances":[],"goalChange":null}', CURRENT_TIMESTAMP - INTERVAL '15 days'),
  ('d7000000-0000-4000-8000-000000000104', 'd1000000-0000-4000-8000-000000000104', 'd4000000-0000-4000-8000-000000000104', CURRENT_DATE - 42, CURRENT_DATE, 'ESTANCAMIENTO', 66.67, 'seed-demo-evolution@1', '[]', '{"lowAdherenceWeeks":0,"imbalances":[],"goalChange":null}', CURRENT_TIMESTAMP - INTERVAL '2 minutes'),
  ('d7000000-0000-4000-8000-000000000105', 'd1000000-0000-4000-8000-000000000105', 'd4000000-0000-4000-8000-000000000105', CURRENT_DATE - 42, CURRENT_DATE, 'PROGRESION_ADECUADA', 66.67, 'seed-demo-evolution@1', '[]', '{"lowAdherenceWeeks":0,"imbalances":[],"goalChange":null}', CURRENT_TIMESTAMP - INTERVAL '1 minute'),
  ('d7000000-0000-4000-8000-000000000106', 'd1000000-0000-4000-8000-000000000106', 'd4000000-0000-4000-8000-000000000106', CURRENT_DATE - 42, CURRENT_DATE, 'DATOS_INSUFICIENTES', 50.00, 'seed-demo-evolution@1', '["variacion_carga_maxima_no_calculable"]', '{"lowAdherenceWeeks":0,"imbalances":[],"goalChange":null}', CURRENT_TIMESTAMP)
ON CONFLICT (id) DO NOTHING;

INSERT INTO app.exercise_diagnostics
  (id, diagnostic_id, exercise_id, situation, metrics)
VALUES
  ('da000000-0000-4000-8000-000000000101', 'd7000000-0000-4000-8000-000000000101', (SELECT exercise_id FROM demo_exercises WHERE purpose = 'PRIMARY'), 'ESTIMULO_INSUFICIENTE', '{"sesionesConsideradas":4,"variacionCargaMaxima":0,"cumplimientoRepeticionesPorSesion":[100,100,100,100],"esfuerzoMedioPorSesion":[4,4,4,4],"criteriosNoEvaluados":[]}'),
  ('da000000-0000-4000-8000-000000000102', 'd7000000-0000-4000-8000-000000000102', (SELECT exercise_id FROM demo_exercises WHERE purpose = 'PRIMARY'), 'SOBREEXIGENCIA', '{"sesionesConsideradas":4,"variacionCargaMaxima":0,"cumplimientoRepeticionesPorSesion":[100,60,60,60],"esfuerzoMedioPorSesion":[7,9,9,9],"criteriosNoEvaluados":[]}'),
  ('da000000-0000-4000-8000-000000000103', 'd7000000-0000-4000-8000-000000000103', (SELECT exercise_id FROM demo_exercises WHERE purpose = 'PRIMARY'), 'ESTANCAMIENTO', '{"sesionesConsideradas":4,"variacionCargaMaxima":0,"cumplimientoRepeticionesPorSesion":[80,80,80,80],"esfuerzoMedioPorSesion":[7,7,7,7],"criteriosNoEvaluados":[]}'),
  ('da000000-0000-4000-8000-000000000114', 'd7000000-0000-4000-8000-000000000114', (SELECT exercise_id FROM demo_exercises WHERE purpose = 'PRIMARY'), 'ESTANCAMIENTO', '{"sesionesConsideradas":4,"variacionCargaMaxima":0,"cumplimientoRepeticionesPorSesion":[80,80,80,80],"esfuerzoMedioPorSesion":[7,7,7,7],"criteriosNoEvaluados":[]}'),
  ('da000000-0000-4000-8000-000000000104', 'd7000000-0000-4000-8000-000000000104', (SELECT exercise_id FROM demo_exercises WHERE purpose = 'PRIMARY'), 'ESTANCAMIENTO', '{"sesionesConsideradas":4,"variacionCargaMaxima":0,"cumplimientoRepeticionesPorSesion":[80,80,80,80],"esfuerzoMedioPorSesion":[7,7,7,7],"criteriosNoEvaluados":[]}'),
  ('da000000-0000-4000-8000-000000000105', 'd7000000-0000-4000-8000-000000000105', (SELECT exercise_id FROM demo_exercises WHERE purpose = 'PRIMARY'), 'PROGRESION_ADECUADA', '{"sesionesConsideradas":4,"variacionCargaMaxima":5,"cumplimientoRepeticionesPorSesion":[83.33,83.33,83.33,83.33],"esfuerzoMedioPorSesion":[7,7,7,7],"criteriosNoEvaluados":[]}'),
  ('da000000-0000-4000-8000-000000000106', 'd7000000-0000-4000-8000-000000000106', (SELECT exercise_id FROM demo_exercises WHERE purpose = 'PRIMARY'), 'DATOS_INSUFICIENTES', '{"sesionesConsideradas":3,"variacionCargaMaxima":null,"cumplimientoRepeticionesPorSesion":[83.33,83.33,83.33],"esfuerzoMedioPorSesion":[7,7,7],"criteriosNoEvaluados":["variacion_carga_maxima_no_calculable"]}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO app.adaptation_proposals
  (id, diagnostic_id, student_id, state, component_version, created_at)
VALUES
  ('d8000000-0000-4000-8000-000000000101', 'd7000000-0000-4000-8000-000000000101', 'd1000000-0000-4000-8000-000000000101', 'PENDIENTE', 'seed-demo-adjustments@1', CURRENT_TIMESTAMP - INTERVAL '5 minutes'),
  ('d8000000-0000-4000-8000-000000000102', 'd7000000-0000-4000-8000-000000000102', 'd1000000-0000-4000-8000-000000000102', 'PENDIENTE', 'seed-demo-adjustments@1', CURRENT_TIMESTAMP - INTERVAL '4 minutes'),
  ('d8000000-0000-4000-8000-000000000103', 'd7000000-0000-4000-8000-000000000103', 'd1000000-0000-4000-8000-000000000103', 'PENDIENTE', 'seed-demo-adjustments@1', CURRENT_TIMESTAMP - INTERVAL '3 minutes'),
  ('d8000000-0000-4000-8000-000000000104', 'd7000000-0000-4000-8000-000000000104', 'd1000000-0000-4000-8000-000000000104', 'PENDIENTE', 'seed-demo-adjustments@1', CURRENT_TIMESTAMP - INTERVAL '2 minutes');

INSERT INTO app.proposed_adjustments
  (id, proposal_id, routine_exercise_id, type, previous_value,
   proposed_value, criterion, supporting_data, state)
VALUES
  ('d9000000-0000-4000-8000-000000000101', 'd8000000-0000-4000-8000-000000000101', 'd6000000-0000-4000-8000-000000000101', 'CARGA', '{"carga_sugerida":60}', '{"carga_sugerida":62.5}', 'ESTIMULO_INSUFICIENTE', '{"situation":"ESTIMULO_INSUFICIENTE","consecutiveStagnations":0,"metrics":{"sesionesConsideradas":4,"variacionCargaMaxima":0,"cumplimientoRepeticionesPorSesion":[100,100,100,100],"esfuerzoMedioPorSesion":[4,4,4,4]},"tableVersion":"demo@1"}', 'PENDIENTE'),
  ('d9000000-0000-4000-8000-000000000102', 'd8000000-0000-4000-8000-000000000102', 'd6000000-0000-4000-8000-000000000102', 'CARGA', '{"carga_sugerida":50}', '{"carga_sugerida":45}', 'SOBREEXIGENCIA', '{"situation":"SOBREEXIGENCIA","consecutiveStagnations":0,"metrics":{"sesionesConsideradas":4,"variacionCargaMaxima":0,"cumplimientoRepeticionesPorSesion":[100,60,60,60],"esfuerzoMedioPorSesion":[7,9,9,9]},"tableVersion":"demo@1"}', 'PENDIENTE'),
  ('d9000000-0000-4000-8000-000000000112', 'd8000000-0000-4000-8000-000000000102', 'd6000000-0000-4000-8000-000000000102', 'VOLUMEN', '{"series_trabajo":4}', '{"series_trabajo":3}', 'SOBREEXIGENCIA', '{"situation":"SOBREEXIGENCIA","consecutiveStagnations":0,"metrics":{"sesionesConsideradas":4,"cumplimientoRepeticionesPorSesion":[100,60,60,60],"esfuerzoMedioPorSesion":[7,9,9,9]},"tableVersion":"demo@1"}', 'PENDIENTE'),
  ('d9000000-0000-4000-8000-000000000103', 'd8000000-0000-4000-8000-000000000103', 'd6000000-0000-4000-8000-000000000103', 'ESQUEMA', '{"min_repetitions":8,"max_repetitions":10}', '{"min_repetitions":10,"max_repetitions":12}', 'ESTANCAMIENTO_PRIMERO', '{"situation":"ESTANCAMIENTO","consecutiveStagnations":1,"metrics":{"sesionesConsideradas":4,"variacionCargaMaxima":0,"cumplimientoRepeticionesPorSesion":[80,80,80,80],"esfuerzoMedioPorSesion":[7,7,7,7]},"tableVersion":"demo@1"}', 'PENDIENTE'),
  ('d9000000-0000-4000-8000-000000000113', 'd8000000-0000-4000-8000-000000000103', 'd6000000-0000-4000-8000-000000000103', 'VOLUMEN', '{"series_trabajo":3}', '{"series_trabajo":4}', 'ESTANCAMIENTO_PRIMERO', '{"situation":"ESTANCAMIENTO","consecutiveStagnations":1,"metrics":{"sesionesConsideradas":4,"cumplimientoRepeticionesPorSesion":[80,80,80,80],"esfuerzoMedioPorSesion":[7,7,7,7]},"tableVersion":"demo@1"}', 'PENDIENTE'),
  ('d9000000-0000-4000-8000-000000000104', 'd8000000-0000-4000-8000-000000000104', 'd6000000-0000-4000-8000-000000000104', 'SUSTITUCION', jsonb_build_object('exercise_id',(SELECT exercise_id FROM demo_exercises WHERE purpose='PRIMARY'),'exercise_name',(SELECT name FROM app.exercises WHERE id=(SELECT exercise_id FROM demo_exercises WHERE purpose='PRIMARY'))), jsonb_build_object('exercise_id',(SELECT exercise_id FROM demo_exercises WHERE purpose='ALTERNATIVE'),'exercise_name',(SELECT name FROM app.exercises WHERE id=(SELECT exercise_id FROM demo_exercises WHERE purpose='ALTERNATIVE'))), 'ESTANCAMIENTO_SEGUNDO_CONSECUTIVO', '{"situation":"ESTANCAMIENTO","consecutiveStagnations":2,"metrics":{"sesionesConsideradas":4,"variacionCargaMaxima":0,"cumplimientoRepeticionesPorSesion":[80,80,80,80],"esfuerzoMedioPorSesion":[7,7,7,7]},"tableVersion":"demo@1"}', 'PENDIENTE');

INSERT INTO app.notices
  (id, recipient_user_id, event_key, audience_role, type,
   reference_type, reference_id, text, created_at, expired)
SELECT
  gen_random_uuid(), 'd1000000-0000-4000-8000-000000000002',
  'seed-demo:proposal:' || id::text,
  'ENTRENADOR', 'PROPUESTA_PENDIENTE', 'ADAPTATION_PROPOSAL', id,
  'Escenario DEMO pendiente: ' ||
    (SELECT display_name FROM demo_people WHERE user_id = p.student_id),
  p.created_at, false
FROM app.adaptation_proposals p
WHERE p.id IN (
  'd8000000-0000-4000-8000-000000000101',
  'd8000000-0000-4000-8000-000000000102',
  'd8000000-0000-4000-8000-000000000103',
  'd8000000-0000-4000-8000-000000000104'
);

COMMIT;

-- Verificacion final. Debe devolver 6 alumnos, 4 propuestas pendientes y
-- todos los diagnosticos con origen SIMULATED en la interfaz.
SELECT
  u.email_normalized AS email,
  u.display_name,
  d.global_situation,
  COALESCE(p.state::text, 'SIN_PROPUESTA') AS proposal_state,
  d.component_version
FROM app.users u
JOIN app.evolution_diagnostics d ON d.student_id = u.id
LEFT JOIN app.adaptation_proposals p ON p.diagnostic_id = d.id
WHERE u.gym_id = 'd0000000-0000-4000-8000-000000000001'
  AND d.period_end = CURRENT_DATE
ORDER BY u.display_name;
