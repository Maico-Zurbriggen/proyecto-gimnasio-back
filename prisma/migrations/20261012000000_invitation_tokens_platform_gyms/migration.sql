-- HU06 · HU13: token hasheado de invitación, aprovisionamiento de gimnasios por
-- el SuperAdmin y perfiles que nacen con el alta y se completan en FL-01.
--
-- `ALTER TYPE ... ADD VALUE` no puede usarse dentro del mismo bloque
-- transaccional en el que se agrega, por eso va primero y fuera del BEGIN.
ALTER TYPE app."UserRole" ADD VALUE IF NOT EXISTS 'SUPERADMIN';

BEGIN;

-- HU06 - T1: el enlace lleva un token aleatorio y la base guarda sólo su hash.
-- Las invitaciones previas no tienen token utilizable: su enlace era el id, que
-- se expone en listados, así que quedan sin hash y dejan de servir para el alta.
ALTER TABLE app.invitations
  ADD COLUMN token_hash TEXT,
  ADD COLUMN used_at TIMESTAMPTZ(6),
  ADD COLUMN issued_by_provisioning BOOLEAN NOT NULL DEFAULT false,
  ALTER COLUMN issued_by_user_id DROP NOT NULL;

CREATE UNIQUE INDEX invitations_token_hash_key ON app.invitations (token_hash);

-- HU13: la invitación de arranque no la emite un usuario del gimnasio sino el
-- aprovisionamiento (RN-02b, RI-20). Toda otra invitación tiene emisor.
ALTER TABLE app.invitations ADD CONSTRAINT invitations_issuer_check
  CHECK (issued_by_user_id IS NOT NULL OR issued_by_provisioning);

-- HU13: fecha de alta del gimnasio y gimnasio técnico del proveedor, donde vive
-- la cuenta del SuperAdmin. Este último nunca aparece en el listado.
ALTER TABLE app.gyms
  ADD COLUMN created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  ADD COLUMN is_platform BOOLEAN NOT NULL DEFAULT false;

-- HU13 · punto abierto 4: el nombre de un gimnasio afiliado es único sin
-- distinguir mayúsculas ni espacios de los extremos. El índice es también lo
-- que impide que dos altas simultáneas con los mismos datos creen dos gimnasios.
CREATE UNIQUE INDEX gyms_name_unique_idx ON app.gyms (lower(btrim(name)))
  WHERE NOT is_platform;

-- HU06 - criterio 4: el alumno invitado por un entrenador queda asignado a él
-- en el alta, y la asignación necesita el perfil. El perfil nace vacío y lo
-- completa la puesta en contexto (FL-01); hasta entonces el contexto es
-- insuficiente y no se genera rutina (RN-97b).
ALTER TABLE app.student_profiles
  ALTER COLUMN birth_date DROP NOT NULL,
  ALTER COLUMN sex DROP NOT NULL,
  ALTER COLUMN height_cm DROP NOT NULL,
  ALTER COLUMN experience_level DROP NOT NULL,
  ALTER COLUMN available_days_per_week DROP NOT NULL;

-- HU06 - criterio 19 (RNF-17): intentos por origen y ventana de un minuto.
CREATE TABLE app.invitation_attempt_limits (
  origin_hash TEXT NOT NULL,
  scope TEXT NOT NULL,
  window_start TIMESTAMPTZ(6) NOT NULL,
  attempts INTEGER NOT NULL CHECK (attempts >= 1),
  PRIMARY KEY (origin_hash, scope, window_start)
);

COMMIT;
