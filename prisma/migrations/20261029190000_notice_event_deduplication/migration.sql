-- RN-112: un mismo hecho no genera más de un aviso para el destinatario.
-- audience_role permite resolver correctamente la navegación de cuentas multirrol.
-- La migración es idempotente para poder ejecutarla primero desde pgAdmin.

BEGIN;

ALTER TABLE "app"."notices"
  ADD COLUMN IF NOT EXISTS "event_key" TEXT,
  ADD COLUMN IF NOT EXISTS "audience_role" "app"."UserRole";

-- Los avisos históricos conservan identidad individual. La deduplicación
-- semántica comienza con los nuevos event_key emitidos por la aplicación.
UPDATE "app"."notices"
SET "event_key" = 'legacy:' || "id"::text
WHERE "event_key" IS NULL;

-- Primero se identifica si el destinatario es el alumno dueño de la entidad.
-- Para el resto se usa el rol operativo disponible con prioridad entrenador,
-- administrador, alumno y superadmin.
UPDATE "app"."notices" AS n
SET "audience_role" = CASE
  WHEN n."reference_type" = 'ADAPTATION_PROPOSAL'
    AND EXISTS (
      SELECT 1
      FROM "app"."adaptation_proposals" AS p
      WHERE p."id" = n."reference_id"
        AND p."student_id" = n."recipient_user_id"
    ) THEN 'ALUMNO'::"app"."UserRole"
  WHEN n."reference_type" = 'ROUTINE'
    AND EXISTS (
      SELECT 1
      FROM "app"."routines" AS r
      WHERE r."id" = n."reference_id"
        AND r."student_id" = n."recipient_user_id"
    ) THEN 'ALUMNO'::"app"."UserRole"
  WHEN n."reference_type" = 'ROUTINE_RENEWAL_CYCLE'
    AND EXISTS (
      SELECT 1
      FROM "app"."routine_renewal_cycles" AS c
      JOIN "app"."routine_versions" AS rv ON rv."id" = c."routine_version_id"
      JOIN "app"."routines" AS r ON r."id" = rv."routine_id"
      WHERE c."id" = n."reference_id"
        AND r."student_id" = n."recipient_user_id"
    ) THEN 'ALUMNO'::"app"."UserRole"
  WHEN EXISTS (
    SELECT 1 FROM "app"."user_roles" AS ur
    WHERE ur."user_id" = n."recipient_user_id" AND ur."role" = 'ENTRENADOR'
  ) THEN 'ENTRENADOR'::"app"."UserRole"
  WHEN EXISTS (
    SELECT 1 FROM "app"."user_roles" AS ur
    WHERE ur."user_id" = n."recipient_user_id" AND ur."role" = 'ADMINISTRADOR'
  ) THEN 'ADMINISTRADOR'::"app"."UserRole"
  WHEN EXISTS (
    SELECT 1 FROM "app"."user_roles" AS ur
    WHERE ur."user_id" = n."recipient_user_id" AND ur."role" = 'ALUMNO'
  ) THEN 'ALUMNO'::"app"."UserRole"
  WHEN EXISTS (
    SELECT 1 FROM "app"."user_roles" AS ur
    WHERE ur."user_id" = n."recipient_user_id" AND ur."role" = 'SUPERADMIN'
  ) THEN 'SUPERADMIN'::"app"."UserRole"
  ELSE NULL
END
WHERE n."audience_role" IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "app"."notices"
    WHERE "event_key" IS NULL OR "audience_role" IS NULL
  ) THEN
    RAISE EXCEPTION 'No se pudo inferir event_key o audience_role para todos los avisos existentes';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "notices_recipient_user_id_event_key_key"
  ON "app"."notices" ("recipient_user_id", "event_key");

-- Las columnas permanecen anulables durante el despliegue expand/contract: la
-- versión anterior del backend puede seguir atendiendo mientras Vercel publica
-- la nueva. Todos los emisores nuevos escriben ambos campos. Una migración de
-- cierre podrá imponer NOT NULL cuando la versión anterior ya no esté activa.

COMMIT;
