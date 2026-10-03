-- RN-43: an unspecified prescribed load stays NULL, distinct from bodyweight (0).
ALTER TABLE app.template_sets ALTER COLUMN suggested_load DROP NOT NULL;
ALTER TABLE app.prescribed_sets ALTER COLUMN suggested_load DROP NOT NULL;
