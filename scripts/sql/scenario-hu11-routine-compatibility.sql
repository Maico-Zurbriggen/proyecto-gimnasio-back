-- Escenario manual HU11 para gym-test.
-- Alumna: alumna.sofia@gimnasio.test
-- Crea una rutina vigente dedicada y archiva la rutina vigente anterior de
-- esa alumna. No modifica rutinas de otros usuarios.
-- Resultado esperado en su rutina vigente:
--   * Sentadilla con barra: ADVERTIDO por RODILLA/LEVE.
--   * Press militar: INCOMPATIBLE por HOMBRO/MODERADA.
-- Ejecutar con migrator_test. No contiene credenciales ni datos reales.

BEGIN;

DO $$
BEGIN
  IF current_database() <> 'gym-test' THEN
    RAISE EXCEPTION 'Este escenario sólo puede ejecutarse en gym-test';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM app.student_profiles
    WHERE user_id = '21000000-0000-4000-8000-000000000005'::uuid
  ) OR NOT EXISTS (
    SELECT 1 FROM app.routine_templates
    WHERE id = '40000000-0000-4000-8000-000000000002'::uuid
  ) THEN
    RAISE EXCEPTION 'Faltan los datos base de Sofia o la plantilla. Aplicá primero seed-test.sql';
  END IF;
END $$;

UPDATE app.routines
SET state = 'ARCHIVADA'
WHERE student_id = '21000000-0000-4000-8000-000000000005'::uuid
  AND state = 'VIGENTE'
  AND id <> '6b000000-0000-4000-8000-000000000001'::uuid;

INSERT INTO app.routines
  (id, student_id, source_template_id, source_generation_result_id,
   routine_type, target_weekly_frequency, state, origin,
   requested_by_user_id, requested_at)
VALUES
  ('6b000000-0000-4000-8000-000000000001',
   '21000000-0000-4000-8000-000000000005',
   '40000000-0000-4000-8000-000000000002', NULL,
   'FUERZA', 2, 'VIGENTE', 'PLANTILLA_ENTRENADOR',
   '21000000-0000-4000-8000-000000000002', clock_timestamp())
ON CONFLICT (id) DO UPDATE
SET state = 'VIGENTE',
    requested_at = EXCLUDED.requested_at;

INSERT INTO app.routine_versions
  (id, routine_id, version_number, current, created_by_user_id, created_at)
VALUES
  ('6b100000-0000-4000-8000-000000000001',
   '6b000000-0000-4000-8000-000000000001', 1, true,
   '21000000-0000-4000-8000-000000000002', clock_timestamp())
ON CONFLICT (id) DO UPDATE SET current = true;

INSERT INTO app.routine_days
  (id, routine_version_id, position, name, dominant_pattern)
VALUES
  ('6b200000-0000-4000-8000-000000000001',
   '6b100000-0000-4000-8000-000000000001', 1,
   'Día 1 - Piernas', 'DOMINANTE_RODILLA'),
  ('6b200000-0000-4000-8000-000000000002',
   '6b100000-0000-4000-8000-000000000001', 2,
   'Día 2 - Hombros', 'EMPUJE_VERTICAL')
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    dominant_pattern = EXCLUDED.dominant_pattern;

INSERT INTO app.routine_exercises
  (id, routine_day_id, exercise_id, position, note,
   compatibility_state, compatibility_reason)
VALUES
  ('6b300000-0000-4000-8000-000000000001',
   '6b200000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000008', 1,
   'Escenario HU11: advertencia visible.', 'ADVERTIDO',
   'Condición LEVE en RODILLA: requiere advertencia y revisión del entrenador.'),
  ('6b300000-0000-4000-8000-000000000002',
   '6b200000-0000-4000-8000-000000000002',
   'e0000000-0006-4000-8000-000000000006', 1,
   'Escenario HU11: incompatibilidad visible.', 'INCOMPATIBLE',
   'Condición MODERADA en HOMBRO: ejercicio incompatible; requiere sustitución.')
ON CONFLICT (id) DO UPDATE
SET exercise_id = EXCLUDED.exercise_id,
    compatibility_state = EXCLUDED.compatibility_state,
    compatibility_reason = EXCLUDED.compatibility_reason;

INSERT INTO app.prescribed_sets
  (id, routine_exercise_id, position, min_repetitions, max_repetitions,
   suggested_load, rest_seconds, warmup)
VALUES
  ('6b400000-0000-4000-8000-000000000001',
   '6b300000-0000-4000-8000-000000000001', 1, 8, 10, 50, 120, false),
  ('6b400000-0000-4000-8000-000000000002',
   '6b300000-0000-4000-8000-000000000001', 2, 8, 10, 50, 120, false),
  ('6b400000-0000-4000-8000-000000000003',
   '6b300000-0000-4000-8000-000000000002', 1, 8, 10, 12, 120, false),
  ('6b400000-0000-4000-8000-000000000004',
   '6b300000-0000-4000-8000-000000000002', 2, 8, 10, 12, 120, false)
ON CONFLICT (id) DO UPDATE
SET min_repetitions = EXCLUDED.min_repetitions,
    max_repetitions = EXCLUDED.max_repetitions,
    suggested_load = EXCLUDED.suggested_load,
    rest_seconds = EXCLUDED.rest_seconds;

INSERT INTO app.routine_reviews
  (id, routine_id, reviewed_version_id, reviewer_trainer_id,
   result, observation, reviewed_at)
VALUES
  ('6b500000-0000-4000-8000-000000000001',
   '6b000000-0000-4000-8000-000000000001',
   '6b100000-0000-4000-8000-000000000001',
   '21000000-0000-4000-8000-000000000002',
   'APROBADA', 'Rutina de prueba HU11.', clock_timestamp())
ON CONFLICT (id) DO NOTHING;

-- Evita más de una declaración vigente por zona en este escenario repetible.
UPDATE app.physical_conditions
SET ends_on = CURRENT_DATE
WHERE student_id = '21000000-0000-4000-8000-000000000005'::uuid
  AND body_zone_code IN ('RODILLA', 'HOMBRO')
  AND ends_on IS NULL
  AND id NOT IN (
    '33000000-0000-4000-8000-000000000002'::uuid,
    '33000000-0000-4000-8000-000000000011'::uuid
  );

INSERT INTO app.physical_conditions
  (id, student_id, body_zone_code, severity, description, starts_on, ends_on)
VALUES
  ('33000000-0000-4000-8000-000000000002',
   '21000000-0000-4000-8000-000000000005',
   'RODILLA', 'LEVE', 'Escenario HU11: advertencia en sentadilla.',
   CURRENT_DATE, NULL),
  ('33000000-0000-4000-8000-000000000011',
   '21000000-0000-4000-8000-000000000005',
   'HOMBRO', 'MODERADA', 'Escenario HU11: incompatibilidad en press militar.',
   CURRENT_DATE, NULL)
ON CONFLICT (id) DO UPDATE
SET severity = EXCLUDED.severity,
    description = EXCLUDED.description,
    starts_on = EXCLUDED.starts_on,
    ends_on = NULL;

UPDATE app.routine_exercises re
SET compatibility_state = CASE
      WHEN re.exercise_id = '10000000-0000-4000-8000-000000000008'::uuid
        THEN 'ADVERTIDO'::app."CompatibilityState"
      WHEN re.exercise_id = 'e0000000-0006-4000-8000-000000000006'::uuid
        THEN 'INCOMPATIBLE'::app."CompatibilityState"
    END,
    compatibility_reason = CASE
      WHEN re.exercise_id = '10000000-0000-4000-8000-000000000008'::uuid
        THEN 'Condición LEVE en RODILLA: requiere advertencia y revisión del entrenador.'
      WHEN re.exercise_id = 'e0000000-0006-4000-8000-000000000006'::uuid
        THEN 'Condición MODERADA en HOMBRO: ejercicio incompatible; requiere sustitución.'
    END
FROM app.routine_days rd
JOIN app.routine_versions rv ON rv.id = rd.routine_version_id AND rv.current
JOIN app.routines r ON r.id = rv.routine_id
WHERE re.routine_day_id = rd.id
  AND r.student_id = '21000000-0000-4000-8000-000000000005'::uuid
  AND r.state = 'VIGENTE'
  AND re.exercise_id IN (
    '10000000-0000-4000-8000-000000000008'::uuid,
    'e0000000-0006-4000-8000-000000000006'::uuid
  );

DO $$
DECLARE
  marked_count integer;
BEGIN
  SELECT count(*) INTO marked_count
  FROM app.routine_exercises re
  JOIN app.routine_days rd ON rd.id = re.routine_day_id
  JOIN app.routine_versions rv ON rv.id = rd.routine_version_id AND rv.current
  JOIN app.routines r ON r.id = rv.routine_id
  WHERE r.student_id = '21000000-0000-4000-8000-000000000005'::uuid
    AND r.state = 'VIGENTE'
    AND re.compatibility_state IN ('ADVERTIDO', 'INCOMPATIBLE');

  IF marked_count < 2 THEN
    RAISE EXCEPTION 'No se pudieron preparar los dos ejercicios del escenario HU11';
  END IF;
END $$;

COMMIT;

-- Verificación posterior:
SELECT
  u.email_normalized AS email,
  e.name AS exercise,
  re.compatibility_state,
  re.compatibility_reason
FROM app.routine_exercises re
JOIN app.routine_days rd ON rd.id = re.routine_day_id
JOIN app.routine_versions rv ON rv.id = rd.routine_version_id AND rv.current
JOIN app.routines r ON r.id = rv.routine_id AND r.state = 'VIGENTE'
JOIN app.users u ON u.id = r.student_id
JOIN app.exercises e ON e.id = re.exercise_id
WHERE r.student_id = '21000000-0000-4000-8000-000000000005'::uuid
  AND re.compatibility_state IN ('ADVERTIDO', 'INCOMPATIBLE')
ORDER BY re.compatibility_state, e.name;
