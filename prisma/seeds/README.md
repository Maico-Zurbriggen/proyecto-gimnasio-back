# Seeds de base de datos

Datos iniciales versionados según `ARCH-DATABASE §10`. La estructura pertenece
exclusivamente a Prisma Migrate: estos scripts solo contienen `INSERT ... ON
CONFLICT` y nunca crean, alteran ni borran nada.

## Archivos

| Archivo              | Ambiente          | Contenido                                                      |
| -------------------- | ----------------- | -------------------------------------------------------------- |
| `seed-reference.sql` | Test y Producción | Equipamiento, grupos musculares, articulaciones, catálogo base |
| `seed-test.sql`      | Solo Test         | Gimnasio, usuarios, rutinas, sesiones y auditoría ficticios    |

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

## Supuestos a confirmar con la primera migración

Los nombres de tabla y columna siguen literalmente `ARCH-DATABASE`. Estos
valores no están cerrados en el corpus y se eligieron por convención:

- `gyms.affiliation_status = ACTIVA`, `consents.type = DATOS_SALUD`.
- `student_profiles.sex` en `MASCULINO`/`FEMENINO`,
  `membership_state` en `AL_DIA`/`VENCIDA` (informativo, RN-14).
- `session_set_records.prescribed_exercise_id` y `performed_exercise_id`
  referencian el catálogo de ejercicios (iguales salvo sustitución).
- Las rutinas semilla cumplen RN-41/RN-43 pero son mínimas a propósito y no
  pretenden satisfacer los volúmenes de RN-39a.
- El hash de contraseña es ficticio (`...FAKE.HASH.FOR.SEED.DATA.ONLY`) y no
  corresponde a ninguna clave real.

Si la primera migración nombra algo distinto, actualizar los seeds en el mismo
PR antes de cargarlos en Neon Test.

## Requisito para la primera migración

`seed-test.sql` corre en una transacción con `SET CONSTRAINTS ALL DEFERRED`
porque invitaciones y usuarios se referencian mutuamente (`users.invitation_id`
y `invitations.consumed_by_user_id`). La primera migración debe declarar esas
dos FK como `DEFERRABLE INITIALLY DEFERRED`; sin eso, la carga circular es
imposible con restricciones inmediatas.
