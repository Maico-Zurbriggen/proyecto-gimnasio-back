ALTER TABLE app.routine_proposal_regenerations ADD COLUMN sequence INTEGER;
WITH ordered AS (
  SELECT id, row_number() OVER (PARTITION BY proposal_id ORDER BY created_at, id) AS sequence
  FROM app.routine_proposal_regenerations
)
UPDATE app.routine_proposal_regenerations AS regeneration
SET sequence = ordered.sequence FROM ordered WHERE ordered.id = regeneration.id;
ALTER TABLE app.routine_proposal_regenerations ALTER COLUMN sequence SET NOT NULL,
  ALTER COLUMN sequence SET DEFAULT 1;
CREATE UNIQUE INDEX routine_proposal_regenerations_proposal_id_sequence_key
  ON app.routine_proposal_regenerations(proposal_id, sequence);
