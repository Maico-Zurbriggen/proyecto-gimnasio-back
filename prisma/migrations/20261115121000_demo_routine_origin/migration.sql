ALTER TYPE app."RoutineOrigin" ADD VALUE 'DEMOSTRACION';

-- A prepared routine has its own provenance; it never pretends to be an AI
-- result or reuses the unique source of the original generated routine.
ALTER TABLE app.routines DROP CONSTRAINT routines_source_matches_origin_check;
ALTER TABLE app.routines ADD CONSTRAINT routines_source_matches_origin_check CHECK (
  (demo_run_id IS NULL AND (
    (origin::text = 'PLANTILLA_ENTRENADOR' AND source_template_id IS NOT NULL AND source_generation_result_id IS NULL)
    OR (origin::text = 'GENERADA' AND source_template_id IS NULL AND source_generation_result_id IS NOT NULL)
  ))
  OR (
    origin::text = 'DEMOSTRACION' AND demo_run_id IS NOT NULL
    AND source_template_id IS NULL AND source_generation_result_id IS NULL
  )
);
