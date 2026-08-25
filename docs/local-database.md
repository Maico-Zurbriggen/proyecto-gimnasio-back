# PostgreSQL local

## Estrategia

Cada integrante ejecuta PostgreSQL 17 en su propia máquina mediante Docker. Los datos no se comparten; el esquema se sincroniza con Prisma y migraciones versionadas en Git.

## Primera configuración

```bash
npm ci
cp .env.example .env
docker compose up -d db
npm run db:generate
npm run db:status
```

En PowerShell, usar `Copy-Item .env.example .env`.

La URL local es `postgresql://gym:gym@localhost:5432/gym`. Estas credenciales no se reutilizan en staging ni producción.

## Cambiar el esquema

Una sola persona modifica `prisma/schema.prisma` y crea la migración de la historia:

```bash
npm run db:migrate -- --name nombre_descriptivo
```

El mismo PR incluye `schema.prisma`, el SQL generado y los cambios de código. El resto del equipo aplica migraciones integradas con:

```bash
npm run db:deploy
npm run db:generate
```

Nunca editar una migración ya integrada.

## Datos locales

`postgres_data` conserva los datos aunque el contenedor se detenga. `docker compose stop db` detiene PostgreSQL sin borrar el volumen.

Para eliminar una base local descartable:

```bash
docker compose down -v
```

Este comando elimina definitivamente los datos locales del proyecto.

## Staging y producción

Usan instancias administradas y separadas. `DATABASE_URL` se guarda como secreto del proveedor. El despliegue ejecuta `npm run db:deploy`, nunca `prisma migrate dev`.
