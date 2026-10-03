-- CreateTable
CREATE TABLE "app"."routine_generation_ownership" (
    "request_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "requested_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "routine_generation_ownership_pkey" PRIMARY KEY ("request_id")
);

-- CreateIndex
CREATE INDEX "routine_generation_ownership_student_id_idx" ON "app"."routine_generation_ownership"("student_id");

-- AddForeignKey
ALTER TABLE "app"."routine_generation_ownership" ADD CONSTRAINT "routine_generation_ownership_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "ai_integration"."ai_generation_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
