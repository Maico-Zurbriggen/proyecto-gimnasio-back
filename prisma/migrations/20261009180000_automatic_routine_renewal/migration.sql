CREATE TABLE "app"."routine_renewal_cycles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "routine_version_id" UUID NOT NULL,
  "cycle_starts_on" DATE NOT NULL,
  "due_on" DATE NOT NULL,
  "evaluation" JSONB NOT NULL,
  "request_id" UUID,
  "proposal_id" UUID,
  "state" TEXT NOT NULL DEFAULT 'PENDIENTE',
  "lease_until" TIMESTAMPTZ(6),
  "alerted_at" TIMESTAMPTZ(6),
  "last_error" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "routine_renewal_cycles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "routine_renewal_cycles_state_check" CHECK ("state" IN ('PENDIENTE', 'GENERADA', 'NO_DISPONIBLE', 'OMITIDA')),
  CONSTRAINT "routine_renewal_cycles_period_check" CHECK ("due_on" > "cycle_starts_on"),
  CONSTRAINT "routine_renewal_cycles_routine_version_id_fkey" FOREIGN KEY ("routine_version_id") REFERENCES "app"."routine_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "routine_renewal_cycles_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "ai_integration"."ai_generation_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "routine_renewal_cycles_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "app"."adaptation_proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "routine_renewal_cycles_routine_version_id_due_on_key" ON "app"."routine_renewal_cycles"("routine_version_id", "due_on");
CREATE UNIQUE INDEX "routine_renewal_cycles_request_id_key" ON "app"."routine_renewal_cycles"("request_id");
CREATE UNIQUE INDEX "routine_renewal_cycles_proposal_id_key" ON "app"."routine_renewal_cycles"("proposal_id");
CREATE INDEX "routine_renewal_cycles_state_lease_until_idx" ON "app"."routine_renewal_cycles"("state", "lease_until");
