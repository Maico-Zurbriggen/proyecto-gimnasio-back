-- Training decisions belong to the AI and trainer. Keep only representation checks.
ALTER TABLE app.routines DROP CONSTRAINT routines_frequency_matches_type_check;
ALTER TABLE app.routines ADD CONSTRAINT routines_calendar_frequency_check CHECK (target_weekly_frequency BETWEEN 1 AND 7);
ALTER TABLE app.prescribed_sets DROP CONSTRAINT prescribed_sets_load_check;
ALTER TABLE app.prescribed_sets ADD CONSTRAINT prescribed_sets_load_check CHECK (suggested_load IS NULL OR suggested_load >= 0);
ALTER TABLE app.template_sets DROP CONSTRAINT template_sets_load_check;
ALTER TABLE app.template_sets ADD CONSTRAINT template_sets_load_check CHECK (suggested_load IS NULL OR suggested_load >= 0);
ALTER TABLE app.session_set_records DROP CONSTRAINT session_set_records_prescribed_load_check;
ALTER TABLE app.session_set_records ADD CONSTRAINT session_set_records_prescribed_load_check CHECK (prescribed_load IS NULL OR prescribed_load >= 0);
ALTER TABLE app.session_set_records DROP CONSTRAINT session_set_records_performed_load_check;
ALTER TABLE app.session_set_records ADD CONSTRAINT session_set_records_performed_load_check CHECK (performed_load IS NULL OR performed_load >= 0);
ALTER TABLE app.session_set_records DROP CONSTRAINT session_set_records_performed_repetitions_check;
ALTER TABLE app.session_set_records ADD CONSTRAINT session_set_records_performed_repetitions_check CHECK (performed_repetitions IS NULL OR performed_repetitions > 0);
