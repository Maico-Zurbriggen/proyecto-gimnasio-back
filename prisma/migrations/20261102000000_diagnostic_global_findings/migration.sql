-- Tabla situación → ajuste: hallazgos globales del diagnóstico que no tenían
-- dónde persistirse (semanas de adherencia baja, desbalances musculares y cambio
-- de objetivo). Columna nullable y aditiva: no toca datos existentes; un
-- diagnóstico sin hallazgos globales se lee como "sin hallazgos".
ALTER TABLE app.evolution_diagnostics
  ADD COLUMN global_findings JSONB;
