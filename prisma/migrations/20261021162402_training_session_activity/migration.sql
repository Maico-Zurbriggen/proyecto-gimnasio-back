-- AlterTable
ALTER TABLE "app"."training_sessions" ADD COLUMN     "last_activity_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "training_sessions_state_last_activity_at_idx" ON "app"."training_sessions"("state", "last_activity_at");

-- RenameForeignKey
ALTER TABLE "app"."student_measurement_blocks" RENAME CONSTRAINT "student_measurement_blocks_regularization_weight_measurement_id" TO "student_measurement_blocks_regularization_weight_measureme_fkey";

-- RenameIndex
ALTER INDEX "app"."student_measurement_blocks_approved_by_trainer_id_approved_at_i" RENAME TO "student_measurement_blocks_approved_by_trainer_id_approved__idx";

-- RenameIndex
ALTER INDEX "app"."student_measurement_blocks_regularization_weight_measurement_id" RENAME TO "student_measurement_blocks_regularization_weight_measuremen_key";
