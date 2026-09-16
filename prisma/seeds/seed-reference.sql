-- =============================================================================
-- seed-reference.sql · Datos de referencia idempotentes (Test y Produccion)
-- =============================================================================
-- Versiona la poblacion inicial de ARCH-DATABASE/§10: equipamiento, grupos
-- musculares, articulaciones, catalogo base de ejercicios y sus relaciones.
--
-- Reglas:
--   * Solo INSERT ... ON CONFLICT. Nunca CREATE/ALTER/DROP/DELETE/TRUNCATE.
--     La estructura pertenece exclusivamente a Prisma Migrate.
--   * Se ejecuta manualmente desde SQL Editor DESPUES de que CI aplique las
--     migraciones (primero `npm run db:deploy`).
--   * Es seguro re-ejecutarlo: las tablas de referencia se actualizan por
--     codigo natural y el catalogo base por UUID fijo.
--   * Esquema: app.* (el servicio IA no accede a estas tablas).
--
-- Fuente de los codigos: D2 §4.1 (22 equipamientos), §4.2 (17 grupos),
-- §4.3 (8 articulaciones). Los nombres y regiones descriptivas son
-- convenciones de carga (D2 solo fija los codigos).
-- =============================================================================
-- Carga atomica: todo o nada.
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Equipamiento (D2 §4.1) · 22 valores
-- ---------------------------------------------------------------------------
INSERT INTO app.equipment (code, name, display_order) VALUES
  ('PESO_CORPORAL', 'Peso corporal', 1),
  ('BARRA', 'Barra olimpica', 2),
  ('DISCOS', 'Discos', 3),
  ('MANCUERNAS', 'Mancuernas', 4),
  ('PESAS_RUSAS', 'Pesas rusas (kettlebell)', 5),
  ('BANCO_PLANO', 'Banco plano', 6),
  ('BANCO_INCLINADO', 'Banco inclinado', 7),
  ('BANCO_DECLINADO', 'Banco declinado', 8),
  ('RACK_SENTADILLA', 'Rack de sentadilla', 9),
  ('JAULA_POTENCIA', 'Jaula de potencia', 10),
  ('PRENSA_PIERNAS', 'Prensa de piernas', 11),
  ('POLEA_ALTA', 'Polea alta', 12),
  ('POLEA_BAJA', 'Polea baja', 13),
  ('MAQUINA_PECHO', 'Maquina de pecho', 14),
  ('MAQUINA_ESPALDA', 'Maquina de espalda', 15),
  ('MAQUINA_HOMBRO', 'Maquina de hombro', 16),
  ('MAQUINA_CUADRICEPS', 'Maquina de cuadriceps', 17),
  ('MAQUINA_ISQUIOTIBIALES', 'Maquina de isquiotibiales', 18),
  ('MAQUINA_GEMELOS', 'Maquina de gemelos', 19),
  ('BARRA_DOMINADAS', 'Barra de dominadas', 20),
  ('PARALELAS', 'Paralelas (fondos)', 21),
  ('BANDAS_ELASTICAS', 'Bandas elasticas', 22)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  display_order = EXCLUDED.display_order;

-- ---------------------------------------------------------------------------
-- 2. Grupos musculares (D2 §4.2) · 17 valores
-- ---------------------------------------------------------------------------
INSERT INTO app.muscle_groups (code, name, region) VALUES
  ('PECTORAL', 'Pectoral', 'TORSO_ANTERIOR'),
  ('DELTOIDES_ANTERIOR', 'Deltoides anterior', 'HOMBRO'),
  ('DELTOIDES_LATERAL', 'Deltoides lateral', 'HOMBRO'),
  ('BICEPS', 'Biceps', 'BRAZO'),
  ('ANTEBRAZO', 'Antebrazo', 'BRAZO'),
  ('ABDOMINALES', 'Abdominales', 'CORE'),
  ('OBLICUOS', 'Oblicuos', 'CORE'),
  ('CUADRICEPS', 'Cuadriceps', 'PIERNA'),
  ('ADUCTORES', 'Aductores', 'PIERNA'),
  ('DORSAL', 'Dorsal ancho', 'TORSO_POSTERIOR'),
  ('TRAPECIO', 'Trapecio', 'TORSO_POSTERIOR'),
  ('DELTOIDES_POSTERIOR', 'Deltoides posterior', 'HOMBRO'),
  ('TRICEPS', 'Triceps', 'BRAZO'),
  ('ERECTORES_LUMBARES', 'Erectores lumbares', 'CORE'),
  ('GLUTEO', 'Gluteo', 'PIERNA'),
  ('ISQUIOTIBIALES', 'Isquiotibiales', 'PIERNA'),
  ('GEMELOS', 'Gemelos', 'PIERNA')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  region = EXCLUDED.region;

-- ---------------------------------------------------------------------------
-- 3. Articulaciones (D2 §4.3) · 8 valores
-- ---------------------------------------------------------------------------
INSERT INTO app.joints (code, name, region) VALUES
  ('HOMBRO', 'Hombro', 'MIEMBRO_SUPERIOR'),
  ('CODO', 'Codo', 'MIEMBRO_SUPERIOR'),
  ('MUNECA', 'Muneca', 'MIEMBRO_SUPERIOR'),
  ('COLUMNA_CERVICAL', 'Columna cervical', 'COLUMNA'),
  ('COLUMNA_LUMBAR', 'Columna lumbar', 'COLUMNA'),
  ('CADERA', 'Cadera', 'MIEMBRO_INFERIOR'),
  ('RODILLA', 'Rodilla', 'MIEMBRO_INFERIOR'),
  ('TOBILLO', 'Tobillo', 'MIEMBRO_INFERIOR')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  region = EXCLUDED.region;

-- ---------------------------------------------------------------------------
-- 4. Catalogo base de ejercicios (14 ejercicios, gym_id NULL)
-- ---------------------------------------------------------------------------
-- Cubre los 9 patrones de movimiento (D2 §4.7), los 3 niveles de dificultad
-- (D2 §4.4) y los casos de equipamiento: con barra, con maquinas, con polea,
-- unilateral y peso corporal (sin filas en exercise_equipment, RN-116).
-- UUID fijos para que las relaciones sean estables y re-ejecutables.
INSERT INTO app.exercises (
  id, gym_id, author_user_id, name, instructions, movement_pattern,
  difficulty_level, unilateral, visual_resource_url, origin, state
) VALUES
  ('e0000000-0001-4000-8000-000000000001', NULL, NULL,
   'Sentadilla con barra', 'Barra sobre trapecios, pies al ancho de hombros. Bajar hasta muslos paralelos manteniendo la espalda neutra.',
   'DOMINANTE_RODILLA', 'INTERMEDIO', false, NULL, 'CATALOGO_BASE', 'APROBADO'),
  ('e0000000-0002-4000-8000-000000000002', NULL, NULL,
   'Peso muerto rumano', 'Barra frente a muslos, bisagra de cadera con rodillas semiflexionadas. Bajar hasta tension de isquiotibiales.',
   'DOMINANTE_CADERA', 'INTERMEDIO', false, NULL, 'CATALOGO_BASE', 'APROBADO'),
  ('e0000000-0003-4000-8000-000000000003', NULL, NULL,
   'Press de banca plano', 'Acostado en banco plano, barra al pecho con agarre medio. Empujar hasta extender sin bloquear codos.',
   'EMPUJE_HORIZONTAL', 'PRINCIPIANTE', false, NULL, 'CATALOGO_BASE', 'APROBADO'),
  ('e0000000-0004-4000-8000-000000000004', NULL, NULL,
   'Remo con barra', 'Tronco inclinado a 45 grados, barra desde el suelo al abdomen bajo. Escapulas retraidas al final.',
   'TRACCION_HORIZONTAL', 'PRINCIPIANTE', false, NULL, 'CATALOGO_BASE', 'APROBADO'),
  ('e0000000-0005-4000-8000-000000000005', NULL, NULL,
   'Dominadas', 'Colgado de la barra con agarre prono. Subir hasta pasar la barbilla y bajar controlado.',
   'TRACCION_VERTICAL', 'AVANZADO', false, NULL, 'CATALOGO_BASE', 'APROBADO'),
  ('e0000000-0006-4000-8000-000000000006', NULL, NULL,
   'Press militar con mancuernas', 'Sentado o de pie, mancuernas a la altura de hombros. Empujar sobre la cabeza sin arquear la lumbar.',
   'EMPUJE_VERTICAL', 'INTERMEDIO', false, NULL, 'CATALOGO_BASE', 'APROBADO'),
  ('e0000000-0007-4000-8000-000000000007', NULL, NULL,
   'Plancha abdominal', 'Apoyo en antebrazos y puntas de pies, cuerpo en linea recta. Sostener sin elevar la cadera.',
   'CORE', 'PRINCIPIANTE', false, NULL, 'CATALOGO_BASE', 'APROBADO'),
  ('e0000000-0008-4000-8000-000000000008', NULL, NULL,
   'Curl de biceps con mancuernas', 'De pie, mancuernas a los costados. Flexionar codos sin balancear el tronco.',
   'AISLAMIENTO_SUPERIOR', 'PRINCIPIANTE', false, NULL, 'CATALOGO_BASE', 'APROBADO'),
  ('e0000000-0009-4000-8000-000000000009', NULL, NULL,
   'Extension de cuadriceps en maquina', 'Sentado en la maquina, extender rodillas hasta casi el bloqueo y bajar controlado.',
   'AISLAMIENTO_INFERIOR', 'PRINCIPIANTE', false, NULL, 'CATALOGO_BASE', 'APROBADO'),
  ('e0000000-0010-4000-8000-000000000010', NULL, NULL,
   'Hip thrust', 'Espalda apoyada en banco, barra sobre la cadera. Elevar hasta alinear rodillas, cadera y hombros.',
   'DOMINANTE_CADERA', 'INTERMEDIO', false, NULL, 'CATALOGO_BASE', 'APROBADO'),
  ('e0000000-0011-4000-8000-000000000011', NULL, NULL,
   'Fondos en paralelas', 'Suspendido en paralelas, bajar hasta hombros a la altura de codos y empujar sin encoger hombros.',
   'EMPUJE_VERTICAL', 'INTERMEDIO', false, NULL, 'CATALOGO_BASE', 'APROBADO'),
  ('e0000000-0012-4000-8000-000000000012', NULL, NULL,
   'Jalon al pecho en polea alta', 'Sentado frente a la polea, traccionar la barra al pecho alto con el tronco estable.',
   'TRACCION_VERTICAL', 'PRINCIPIANTE', false, NULL, 'CATALOGO_BASE', 'APROBADO'),
  ('e0000000-0013-4000-8000-000000000013', NULL, NULL,
   'Zancadas caminando con mancuernas', 'Paso largo al frente con mancuerna en cada mano, bajar hasta ambas rodillas a 90 grados y alternar.',
   'DOMINANTE_RODILLA', 'PRINCIPIANTE', true, NULL, 'CATALOGO_BASE', 'APROBADO'),
  ('e0000000-0014-4000-8000-000000000014', NULL, NULL,
   'Puente de gluteo', 'Acostado boca arriba con rodillas flexionadas, elevar la cadera hasta alinear rodillas, cadera y hombros.',
   'DOMINANTE_CADERA', 'PRINCIPIANTE', false, NULL, 'CATALOGO_BASE', 'APROBADO')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  instructions = EXCLUDED.instructions,
  movement_pattern = EXCLUDED.movement_pattern,
  difficulty_level = EXCLUDED.difficulty_level,
  unilateral = EXCLUDED.unilateral,
  origin = EXCLUDED.origin,
  state = EXCLUDED.state;

-- ---------------------------------------------------------------------------
-- 5. Equipamiento requerido por ejercicio
-- ---------------------------------------------------------------------------
-- La plancha (0007) y el puente (0014) no declaran filas:
-- requieren solo PESO_CORPORAL (RN-116).
INSERT INTO app.exercise_equipment (exercise_id, equipment_code) VALUES
  ('e0000000-0001-4000-8000-000000000001', 'BARRA'),
  ('e0000000-0001-4000-8000-000000000001', 'DISCOS'),
  ('e0000000-0001-4000-8000-000000000001', 'RACK_SENTADILLA'),
  ('e0000000-0002-4000-8000-000000000002', 'BARRA'),
  ('e0000000-0002-4000-8000-000000000002', 'DISCOS'),
  ('e0000000-0003-4000-8000-000000000003', 'BARRA'),
  ('e0000000-0003-4000-8000-000000000003', 'DISCOS'),
  ('e0000000-0003-4000-8000-000000000003', 'BANCO_PLANO'),
  ('e0000000-0004-4000-8000-000000000004', 'BARRA'),
  ('e0000000-0004-4000-8000-000000000004', 'DISCOS'),
  ('e0000000-0005-4000-8000-000000000005', 'BARRA_DOMINADAS'),
  ('e0000000-0006-4000-8000-000000000006', 'MANCUERNAS'),
  ('e0000000-0006-4000-8000-000000000006', 'BANCO_PLANO'),
  ('e0000000-0008-4000-8000-000000000008', 'MANCUERNAS'),
  ('e0000000-0009-4000-8000-000000000009', 'MAQUINA_CUADRICEPS'),
  ('e0000000-0010-4000-8000-000000000010', 'BARRA'),
  ('e0000000-0010-4000-8000-000000000010', 'DISCOS'),
  ('e0000000-0010-4000-8000-000000000010', 'BANCO_PLANO'),
  ('e0000000-0011-4000-8000-000000000011', 'PARALELAS'),
  ('e0000000-0012-4000-8000-000000000012', 'POLEA_ALTA'),
  ('e0000000-0013-4000-8000-000000000013', 'MANCUERNAS')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. Participacion muscular (maximo una PRIMARIA por ejercicio, RI-21)
-- ---------------------------------------------------------------------------
INSERT INTO app.exercise_muscles (exercise_id, muscle_code, participation) VALUES
  ('e0000000-0001-4000-8000-000000000001', 'CUADRICEPS', 'PRIMARIA'),
  ('e0000000-0001-4000-8000-000000000001', 'GLUTEO', 'SECUNDARIA'),
  ('e0000000-0001-4000-8000-000000000001', 'ERECTORES_LUMBARES', 'SECUNDARIA'),
  ('e0000000-0002-4000-8000-000000000002', 'ISQUIOTIBIALES', 'PRIMARIA'),
  ('e0000000-0002-4000-8000-000000000002', 'GLUTEO', 'SECUNDARIA'),
  ('e0000000-0002-4000-8000-000000000002', 'ERECTORES_LUMBARES', 'SECUNDARIA'),
  ('e0000000-0003-4000-8000-000000000003', 'PECTORAL', 'PRIMARIA'),
  ('e0000000-0003-4000-8000-000000000003', 'TRICEPS', 'SECUNDARIA'),
  ('e0000000-0003-4000-8000-000000000003', 'DELTOIDES_ANTERIOR', 'SECUNDARIA'),
  ('e0000000-0004-4000-8000-000000000004', 'DORSAL', 'PRIMARIA'),
  ('e0000000-0004-4000-8000-000000000004', 'BICEPS', 'SECUNDARIA'),
  ('e0000000-0004-4000-8000-000000000004', 'TRAPECIO', 'SECUNDARIA'),
  ('e0000000-0005-4000-8000-000000000005', 'DORSAL', 'PRIMARIA'),
  ('e0000000-0005-4000-8000-000000000005', 'BICEPS', 'SECUNDARIA'),
  ('e0000000-0006-4000-8000-000000000006', 'DELTOIDES_LATERAL', 'PRIMARIA'),
  ('e0000000-0006-4000-8000-000000000006', 'TRICEPS', 'SECUNDARIA'),
  ('e0000000-0006-4000-8000-000000000006', 'TRAPECIO', 'SECUNDARIA'),
  ('e0000000-0007-4000-8000-000000000007', 'ABDOMINALES', 'PRIMARIA'),
  ('e0000000-0007-4000-8000-000000000007', 'OBLICUOS', 'SECUNDARIA'),
  ('e0000000-0008-4000-8000-000000000008', 'BICEPS', 'PRIMARIA'),
  ('e0000000-0008-4000-8000-000000000008', 'ANTEBRAZO', 'SECUNDARIA'),
  ('e0000000-0009-4000-8000-000000000009', 'CUADRICEPS', 'PRIMARIA'),
  ('e0000000-0010-4000-8000-000000000010', 'GLUTEO', 'PRIMARIA'),
  ('e0000000-0010-4000-8000-000000000010', 'ISQUIOTIBIALES', 'SECUNDARIA'),
  ('e0000000-0011-4000-8000-000000000011', 'TRICEPS', 'PRIMARIA'),
  ('e0000000-0011-4000-8000-000000000011', 'PECTORAL', 'SECUNDARIA'),
  ('e0000000-0011-4000-8000-000000000011', 'DELTOIDES_ANTERIOR', 'SECUNDARIA'),
  ('e0000000-0012-4000-8000-000000000012', 'DORSAL', 'PRIMARIA'),
  ('e0000000-0012-4000-8000-000000000012', 'BICEPS', 'SECUNDARIA'),
  ('e0000000-0013-4000-8000-000000000013', 'CUADRICEPS', 'PRIMARIA'),
  ('e0000000-0013-4000-8000-000000000013', 'GLUTEO', 'SECUNDARIA'),
  ('e0000000-0014-4000-8000-000000000014', 'GLUTEO', 'PRIMARIA'),
  ('e0000000-0014-4000-8000-000000000014', 'ISQUIOTIBIALES', 'SECUNDARIA')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 7. Articulaciones exigidas por ejercicio (base de RN-44a)
-- ---------------------------------------------------------------------------
INSERT INTO app.exercise_joints (exercise_id, joint_code) VALUES
  ('e0000000-0001-4000-8000-000000000001', 'RODILLA'),
  ('e0000000-0001-4000-8000-000000000001', 'CADERA'),
  ('e0000000-0001-4000-8000-000000000001', 'TOBILLO'),
  ('e0000000-0001-4000-8000-000000000001', 'COLUMNA_LUMBAR'),
  ('e0000000-0002-4000-8000-000000000002', 'CADERA'),
  ('e0000000-0002-4000-8000-000000000002', 'COLUMNA_LUMBAR'),
  ('e0000000-0002-4000-8000-000000000002', 'RODILLA'),
  ('e0000000-0003-4000-8000-000000000003', 'HOMBRO'),
  ('e0000000-0003-4000-8000-000000000003', 'CODO'),
  ('e0000000-0003-4000-8000-000000000003', 'MUNECA'),
  ('e0000000-0004-4000-8000-000000000004', 'HOMBRO'),
  ('e0000000-0004-4000-8000-000000000004', 'CODO'),
  ('e0000000-0004-4000-8000-000000000004', 'COLUMNA_LUMBAR'),
  ('e0000000-0005-4000-8000-000000000005', 'HOMBRO'),
  ('e0000000-0005-4000-8000-000000000005', 'CODO'),
  ('e0000000-0006-4000-8000-000000000006', 'HOMBRO'),
  ('e0000000-0006-4000-8000-000000000006', 'CODO'),
  ('e0000000-0007-4000-8000-000000000007', 'HOMBRO'),
  ('e0000000-0007-4000-8000-000000000007', 'COLUMNA_LUMBAR'),
  ('e0000000-0008-4000-8000-000000000008', 'CODO'),
  ('e0000000-0008-4000-8000-000000000008', 'MUNECA'),
  ('e0000000-0009-4000-8000-000000000009', 'RODILLA'),
  ('e0000000-0010-4000-8000-000000000010', 'CADERA'),
  ('e0000000-0010-4000-8000-000000000010', 'RODILLA'),
  ('e0000000-0011-4000-8000-000000000011', 'HOMBRO'),
  ('e0000000-0011-4000-8000-000000000011', 'CODO'),
  ('e0000000-0012-4000-8000-000000000012', 'HOMBRO'),
  ('e0000000-0012-4000-8000-000000000012', 'CODO'),
  ('e0000000-0013-4000-8000-000000000013', 'RODILLA'),
  ('e0000000-0013-4000-8000-000000000013', 'CADERA'),
  ('e0000000-0013-4000-8000-000000000013', 'TOBILLO'),
  ('e0000000-0014-4000-8000-000000000014', 'CADERA'),
  ('e0000000-0014-4000-8000-000000000014', 'RODILLA')
ON CONFLICT DO NOTHING;

COMMIT;
