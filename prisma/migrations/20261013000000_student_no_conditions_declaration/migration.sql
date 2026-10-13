-- HU11 - criterio 8 (FL-01/A1, RF-111): declarar expresamente que no hay
-- ninguna condición física es distinto de no haber respondido. Se guarda el
-- instante de la declaración; declarar una condición después la anula.
ALTER TABLE app.student_profiles
  ADD COLUMN no_conditions_declared_at TIMESTAMPTZ(6);
