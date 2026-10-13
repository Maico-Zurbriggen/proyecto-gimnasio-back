-- Existing records remain approved; availability starts empty for every gym.
-- Source identity replaces base names; multi-primary muscle membership is allowed.
DROP INDEX IF EXISTS app.exercise_muscles_one_primary_key;
DROP INDEX IF EXISTS app.exercises_base_name_key;

-- CreateEnum
CREATE TYPE "app"."ExerciseState" AS ENUM ('PROPUESTO', 'APROBADO', 'RECHAZADO', 'DESACTIVADO');

-- CreateEnum
CREATE TYPE "app"."ExerciseMediaPose" AS ENUM ('INICIO', 'FINAL', 'PRINCIPAL');

-- AlterEnum
ALTER TYPE "app"."CompatibilityState" ADD VALUE 'EJERCICIO_DESACTIVADO';

-- AlterTable
ALTER TABLE "app"."exercises" ADD COLUMN     "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "review_observation" TEXT,
ADD COLUMN     "reviewed_at" TIMESTAMPTZ(6),
ADD COLUMN     "reviewed_by_user_id" UUID,
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "source" TEXT,
ADD COLUMN     "source_id" TEXT,
ADD COLUMN     "source_revision" TEXT,
ADD COLUMN     "state" "app"."ExerciseState" NOT NULL DEFAULT 'APROBADO',
ADD COLUMN     "tips" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE app.exercises ALTER COLUMN updated_at DROP DEFAULT;
ALTER TABLE app.exercises ALTER COLUMN tips SET NOT NULL;
ALTER TABLE app.exercises ADD CONSTRAINT exercises_source_identity_check CHECK ((source IS NULL) = (source_id IS NULL));
ALTER TABLE app.exercises ADD CONSTRAINT exercises_revision_positive_check CHECK (revision > 0);

-- CreateTable
CREATE TABLE "app"."gym_exercises" (
    "gym_id" UUID NOT NULL,
    "exercise_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updated_by_user_id" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "gym_exercises_pkey" PRIMARY KEY ("gym_id","exercise_id")
);

-- CreateTable
CREATE TABLE "app"."exercise_media" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "exercise_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "pose" "app"."ExerciseMediaPose" NOT NULL,
    "url" TEXT NOT NULL,

    CONSTRAINT "exercise_media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gym_exercises_gym_id_enabled_idx" ON "app"."gym_exercises"("gym_id", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "exercise_media_exercise_id_position_key" ON "app"."exercise_media"("exercise_id", "position");
ALTER TABLE app.exercise_media ADD CONSTRAINT exercise_media_position_check CHECK (position > 0);

-- CreateIndex
CREATE INDEX "exercises_state_name_idx" ON "app"."exercises"("state", "name");

-- CreateIndex
CREATE UNIQUE INDEX "exercises_source_source_id_key" ON "app"."exercises"("source", "source_id");

-- AddForeignKey
ALTER TABLE "app"."exercises" ADD CONSTRAINT "exercises_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."gym_exercises" ADD CONSTRAINT "gym_exercises_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "app"."gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."gym_exercises" ADD CONSTRAINT "gym_exercises_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "app"."exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER gym_exercises_actor_scope_check
BEFORE INSERT OR UPDATE OF gym_id, updated_by_user_id ON app.gym_exercises
FOR EACH ROW EXECUTE FUNCTION app.check_gym_scoped_actor();

CREATE FUNCTION app.check_gym_exercise_scope() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE exercise_gym UUID; exercise_state TEXT;
BEGIN
  SELECT gym_id, state::text INTO exercise_gym, exercise_state FROM app.exercises WHERE id = NEW.exercise_id FOR SHARE;
  IF exercise_gym IS NOT NULL AND exercise_gym <> NEW.gym_id THEN
    RAISE EXCEPTION 'exercise belongs to another gym' USING ERRCODE = '23514';
  END IF;
  IF NEW.enabled AND exercise_state <> 'APROBADO' THEN
    RAISE EXCEPTION 'only approved exercises can be enabled' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER gym_exercises_exercise_scope_check BEFORE INSERT OR UPDATE ON app.gym_exercises
FOR EACH ROW EXECUTE FUNCTION app.check_gym_exercise_scope();

-- AddForeignKey
ALTER TABLE "app"."gym_exercises" ADD CONSTRAINT "gym_exercises_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."exercise_media" ADD CONSTRAINT "exercise_media_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "app"."exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
