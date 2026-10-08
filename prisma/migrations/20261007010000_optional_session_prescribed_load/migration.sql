-- Preserve an unspecified prescribed load when a session freezes its prescription.
-- Existing values and historical sessions remain intact; NULL is distinct from zero.
ALTER TABLE app.session_set_records ALTER COLUMN prescribed_load DROP NOT NULL;
