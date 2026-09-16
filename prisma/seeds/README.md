# Seeds de base de datos

Datos iniciales versionados según `ARCH-DATABASE §10`. La estructura pertenece
exclusivamente a Prisma Migrate: estos scripts solo contienen `INSERT ... ON
CONFLICT` y nunca crean, alteran ni borran nada.

## Archivos

| Archivo              | Ambiente          | Contenido                                                      |
| -------------------- | ----------------- | -------------------------------------------------------------- |
| `seed-reference.sql` | Test y Producción | Equipamiento, grupos musculares, articulaciones, catálogo base |
| `seed-test.sql`      | Solo Test         | Todo `app` + `ai_integration`: 39 tablas con datos ficticios   |
| `catalogo-base.csv`  | Solo Test         | Los 14 ejercicios base en CSV para probar                      |
| `alumnos.csv`        | Solo Test         | Los 5 perfiles de alumno en CSV para probar                    |

## Orden de carga

1. CI aplica las migraciones (`npm run db:deploy`).
2. Desde SQL Editor, ejecutar `seed-reference.sql`.
3. Solo en Neon Test, ejecutar `seed-test.sql`.

Ambos scripts son idempotentes y re-ejecutables: las tablas de referencia se
actualizan por código natural y el resto usa UUID fijos con `DO NOTHING`.

## Elenco de `seed-test.sql`

- Gimnasio `Gimnasio Test Norte` (`America/Argentina/Buenos_Aires`).
- `admin.test@`, `entrenador.lucia@`, `entrenador.marco@` (dual
  ENTRENADOR+ALUMNO, RN-22a), `alumno.martin@`, `alumna.sofia@`,
  `alumno.diego@`, `alumna.valen@`, todos en `@gimnasio.test`.
- Casos cubiertos: rutina VIGENTE con dos versiones (martín), ADVERTIDO por
  condición LEVE (sofía), PROPUESTA generada con INCOMPATIBLE por condición y
  por equipamiento (diego), alumna sin asignación ni objetivo (valen),
  aptitud vigente/vencida/ausente, sesión BLOQUEADA/COMPLETADA/EN_CURSO,
  sustitución, omisión con motivo y serie adicional.
- Adaptación: propuesta P1 ACEPTADA_PARCIAL (genera la v2 de R1) y P2
  PENDIENTE (sofía), con diagnósticos por ejercicio coherentes con RN-79a.
- Autenticación: una sesión activa, una revocada, un token de recupero
  pendiente y uno usado.

## Compatibilidad con la primera migración

Los scripts usan los nombres, tipos y restricciones de la migración Prisma
vigente:

- `gyms.affiliation_status = AFFILIATED` y
  `consents.type = DATOS_SALUD`.
- `student_profiles.sex` usa `MASCULINO`/`FEMENINO`; la migración no incluye
  una columna `membership_state`.
- Las cargas de ejercicios con peso corporal se representan con `0.00`, ya
  que las columnas de carga sugerida y prescripta son obligatorias.
- `Sentadilla con barra` conserva el UUID
  `10000000-0000-4000-8000-000000000008` del catálogo anterior para que la
  transición no duplique el ejercicio ni rompa referencias existentes.
- Los usuarios ficticios usan el namespace UUID `21000000-...` para no
  colisionar con los usuarios del antiguo `seed-demo.sql`.
- `session_set_records.prescribed_exercise_id` y `performed_exercise_id`
  referencian el catálogo de ejercicios (iguales salvo sustitución).
- Las rutinas semilla cumplen RN-41/RN-43 pero son mínimas a propósito y no
  pretenden satisfacer los volúmenes de RN-39a.
- El hash de contraseña es ficticio (`...FAKE.HASH.FOR.SEED.DATA.ONLY`) y no
  corresponde a ninguna clave real.

Si una migración futura cambia estos nombres o restricciones, actualizar los
seeds en el mismo PR antes de cargarlos en Neon Test.

`seed-test.sql` ordena las inserciones para respetar las claves foráneas
inmediatas. Las referencias entre una propuesta de adaptación y su versión
resultante son diferibles y se validan al confirmar la transacción, porque
forman una relación circular intencional.
