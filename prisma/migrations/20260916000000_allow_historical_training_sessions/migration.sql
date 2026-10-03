-- A historical session keeps the routine version and day it originally used.
-- Only an in-progress session must point to the student's current routine and
-- current version.
CREATE OR REPLACE FUNCTION "app"."check_training_session_context"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM "app"."routines" r
        JOIN "app"."routine_versions" rv ON rv."routine_id" = r."id"
        JOIN "app"."routine_days" rd ON rd."routine_version_id" = rv."id"
        WHERE r."id" = NEW."routine_id"
          AND r."student_id" = NEW."student_id"
          AND rv."id" = NEW."routine_version_id"
          AND rd."id" = NEW."routine_day_id"
    ) THEN
        RAISE EXCEPTION 'session routine, version and day must belong to the student context'
            USING ERRCODE = '23514';
    END IF;

    IF NEW."state" = 'EN_CURSO'
       AND NOT EXISTS (
           SELECT 1
           FROM "app"."routines" r
           JOIN "app"."routine_versions" rv ON rv."routine_id" = r."id"
           WHERE r."id" = NEW."routine_id"
             AND r."student_id" = NEW."student_id"
             AND rv."id" = NEW."routine_version_id"
             AND r."state" = 'VIGENTE'
             AND rv."current"
       ) THEN
        RAISE EXCEPTION 'in-progress session must use the student current routine and version'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

-- Routine versions and adaptation proposals form an intentional circular
-- reference. Validate both ends at transaction commit, when both rows exist.
ALTER TABLE "app"."routine_versions"
    ALTER CONSTRAINT "routine_versions_adaptation_proposal_id_fkey"
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "app"."adaptation_proposals"
    ALTER CONSTRAINT "adaptation_proposals_resulting_version_id_fkey"
    DEFERRABLE INITIALLY DEFERRED;

DROP TRIGGER "routine_versions_adaptation_check"
    ON "app"."routine_versions";

CREATE CONSTRAINT TRIGGER "routine_versions_adaptation_check"
AFTER INSERT OR UPDATE ON "app"."routine_versions"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "app"."check_routine_version_adaptation"();

DROP TRIGGER "adaptation_proposals_context_check"
    ON "app"."adaptation_proposals";

CREATE CONSTRAINT TRIGGER "adaptation_proposals_context_check"
AFTER INSERT OR UPDATE ON "app"."adaptation_proposals"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "app"."check_adaptation_proposal_context"();
