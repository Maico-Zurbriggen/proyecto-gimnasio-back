ALTER TABLE app.gyms ADD COLUMN generation_settings JSONB,
  ADD COLUMN generation_settings_revision INTEGER NOT NULL DEFAULT 0;
CREATE TABLE app.routine_proposal_regenerations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES app.adaptation_proposals(id),
  trainer_id UUID NOT NULL REFERENCES app.users(id),
  idempotency_key TEXT NOT NULL UNIQUE,
  feedback TEXT NOT NULL,
  request_id UUID UNIQUE REFERENCES ai_integration.ai_generation_requests(id),
  candidate_request_id UUID NOT NULL REFERENCES ai_integration.ai_generation_requests(id),
  state TEXT NOT NULL DEFAULT 'PENDIENTE', error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), finished_at TIMESTAMPTZ
);
CREATE INDEX routine_proposal_regenerations_proposal_id_created_at_idx
  ON app.routine_proposal_regenerations(proposal_id, created_at);
CREATE UNIQUE INDEX routine_proposal_regenerations_one_pending
  ON app.routine_proposal_regenerations(proposal_id) WHERE state = 'PENDIENTE';
