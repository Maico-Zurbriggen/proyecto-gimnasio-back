-- Reinicia el escenario HU11 de Sofía en gym-test sin tocar otros alumnos.
-- Ejecutar con migrator_test. No contiene credenciales.
--
-- Deja una rutina nueva y compatible, archiva la vigente anterior y cierra
-- condiciones activas. Después de ejecutarlo, declarar desde la aplicación
-- una condición HOMBRO/MODERADA para probar de punta a punta:
-- marca INCOMPATIBLE -> propuesta -> aviso a Lucía -> cierre -> reevaluación.

BEGIN;

DO $$
DECLARE
  sofia constant uuid := '21000000-0000-4000-8000-000000000005';
  lucia constant uuid := '21000000-0000-4000-8000-000000000002';
  template_id constant uuid := '40000000-0000-4000-8000-000000000002';
  squat_id constant uuid := '10000000-0000-4000-8000-000000000008';
  press_id constant uuid := 'e0000000-0006-4000-8000-000000000006';
  routine_id uuid := gen_random_uuid();
  version_id uuid := gen_random_uuid();
  leg_day_id uuid := gen_random_uuid();
  shoulder_day_id uuid := gen_random_uuid();
  squat_item_id uuid := gen_random_uuid();
  press_item_id uuid := gen_random_uuid();
BEGIN
  IF current_database() <> 'gym-test' THEN
    RAISE EXCEPTION 'Este script sólo puede ejecutarse en gym-test';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM app.student_profiles WHERE user_id = sofia) THEN
    RAISE EXCEPTION 'No existe el perfil de Sofía; aplicá primero el seed de test';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM app.trainer_student_assignments
    WHERE student_id = sofia AND trainer_id = lucia
      AND starts_at <= clock_timestamp()
      AND (ends_at IS NULL OR ends_at > clock_timestamp())
  ) THEN
    RAISE EXCEPTION 'Sofía no tiene una asignación vigente con Lucía';
  END IF;

  -- Conserva el historial pero retira la rutina usada en la prueba anterior.
  UPDATE app.routines
  SET state = 'ARCHIVADA'
  WHERE student_id = sofia AND state = 'VIGENTE';

  -- Cierra el contexto anterior. Las declaraciones creadas hoy por una prueba
  -- incompleta se eliminan para no dejar una fecha de cierre futura.
  DELETE FROM app.physical_conditions
  WHERE student_id = sofia AND ends_on IS NULL AND starts_on >= CURRENT_DATE;

  UPDATE app.physical_conditions
  SET ends_on = CURRENT_DATE
  WHERE student_id = sofia AND ends_on IS NULL;

  UPDATE app.adaptation_proposals
  SET state = 'INVALIDADA',
      resolved_at = clock_timestamp(),
      resolution_reason = 'Reinicio controlado del escenario HU11.'
  WHERE student_id = sofia AND state IN ('PENDIENTE', 'BLOQUEADA');

  UPDATE app.notices n
  SET expired = true
  WHERE n.expired = false
    AND n.reference_type = 'ADAPTATION_PROPOSAL'
    AND EXISTS (
      SELECT 1 FROM app.adaptation_proposals p
      WHERE p.id = n.reference_id AND p.student_id = sofia
    );

  INSERT INTO app.routines
    (id, student_id, source_template_id, source_generation_result_id,
     routine_type, target_weekly_frequency, state, origin,
     requested_by_user_id, requested_at)
  VALUES
    (routine_id, sofia, template_id, NULL, 'FUERZA', 2, 'VIGENTE',
     'PLANTILLA_ENTRENADOR', lucia, clock_timestamp());

  INSERT INTO app.routine_versions
    (id, routine_id, version_number, current, created_by_user_id, created_at)
  VALUES (version_id, routine_id, 1, true, lucia, clock_timestamp());

  INSERT INTO app.routine_days
    (id, routine_version_id, position, name, dominant_pattern)
  VALUES
    (leg_day_id, version_id, 1, 'Día 1 - Piernas', 'DOMINANTE_RODILLA'),
    (shoulder_day_id, version_id, 2, 'Día 2 - Hombros', 'EMPUJE_VERTICAL');

  INSERT INTO app.routine_exercises
    (id, routine_day_id, exercise_id, position, note,
     compatibility_state, compatibility_reason)
  VALUES
    (squat_item_id, leg_day_id, squat_id, 1,
     'Escenario HU11 reiniciado.', 'COMPATIBLE', NULL),
    (press_item_id, shoulder_day_id, press_id, 1,
     'Escenario HU11 reiniciado.', 'COMPATIBLE', NULL);

  INSERT INTO app.prescribed_sets
    (id, routine_exercise_id, position, min_repetitions, max_repetitions,
     suggested_load, rest_seconds, warmup)
  VALUES
    (gen_random_uuid(), squat_item_id, 1, 8, 10, 50, 120, false),
    (gen_random_uuid(), squat_item_id, 2, 8, 10, 50, 120, false),
    (gen_random_uuid(), press_item_id, 1, 8, 10, 12, 120, false),
    (gen_random_uuid(), press_item_id, 2, 8, 10, 12, 120, false);

  INSERT INTO app.routine_reviews
    (id, routine_id, reviewed_version_id, reviewer_trainer_id,
     result, observation, reviewed_at)
  VALUES
    (gen_random_uuid(), routine_id, version_id, lucia, 'APROBADA',
     'Rutina base para repetir el flujo HU11.', clock_timestamp());
END $$;

COMMIT;

SELECT
  r.id AS new_routine_id,
  r.state,
  e.name AS exercise,
  re.compatibility_state,
  re.compatibility_reason
FROM app.routines r
JOIN app.routine_versions rv ON rv.routine_id = r.id AND rv.current
JOIN app.routine_days rd ON rd.routine_version_id = rv.id
JOIN app.routine_exercises re ON re.routine_day_id = rd.id
JOIN app.exercises e ON e.id = re.exercise_id
WHERE r.student_id = '21000000-0000-4000-8000-000000000005'::uuid
  AND r.state = 'VIGENTE'
ORDER BY rd.position, re.position;
