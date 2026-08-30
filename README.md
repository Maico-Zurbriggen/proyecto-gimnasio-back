# Proyecto Gimnasio — Backend

API REST Express + TypeScript, Prisma y PostgreSQL. Se despliega en Vercel, persiste en Neon y orquesta solicitudes hacia el servicio Python del Polo mediante su API expuesta por ngrok.

## Requisitos

- Node.js 24 o superior;
- npm 11.6 o superior;
- acceso autorizado a Neon Test;
- credencial test del servicio IA cuando se prueba integración real;
- Docker Desktop, únicamente para quienes creen migraciones.

## Inicio local

```bash
npm ci
cp .env.example .env
npm run db:generate
npm run dev
```

En PowerShell, usar `Copy-Item .env.example .env`. La API queda en `http://localhost:3000`.

- `GET /health` verifica que el proceso HTTP esté disponible.
- `GET /ready` ejecuta una consulta mínima contra PostgreSQL y devuelve `503` si Neon no está disponible.

`DATABASE_URL` debe ser la conexión pooled de `backend_test`; el hostname de Neon contiene `-pooler`. `CORS_ORIGINS` acepta orígenes separados por comas y debe incluir `http://localhost:5173` para desarrollo local.

Hasta que exista la primera migración, `npm run db:status` informa correctamente que la base todavía no está administrada por Prisma Migrate. Para verificar la conexión inicial usar `GET /ready`.

## Despliegue en Vercel

Vercel detecta `src/app.ts` como la entrada Express. `src/main.ts` se usa solamente para levantar el servidor local. Las Functions se ejecutan en São Paulo (`gru1`) para mantenerlas cerca de Neon `sa-east-1`.

- Preview asociado a `test`: `DATABASE_URL` de `backend_test` y URL del frontend Test en `CORS_ORIGINS`.
- Production asociado a `main`: `DATABASE_URL` de `backend_production` y URL del frontend productivo en `CORS_ORIGINS`.
- No configurar roles `migrator` ni credenciales administrativas en Vercel.

Tras cambiar una variable de entorno, volver a desplegar para aplicarla.

## Base de datos

El backend local usa Neon Test compartida. No ejecutar `prisma migrate reset`, `prisma db push`, seeds destructivos ni `migrate dev` sobre esa base. Las migraciones se aplican desde CI mediante `npm run db:deploy`.

### Crear una migración

Sólo el autor de una migración levanta PostgreSQL efímero:

```powershell
docker compose -f compose.migrations.yaml up -d --wait
$previousDatabaseUrl = $env:DATABASE_URL
$env:DATABASE_URL = "postgresql://gym_migrator@localhost:55432/gym_migrations?schema=public"
npm run db:migrate -- --name nombre_descriptivo
npm run db:status
npm run check
```

Revisar el SQL generado y comprobar que todo el historial se aplica sobre una base vacía:

```powershell
docker compose -f compose.migrations.yaml down
docker compose -f compose.migrations.yaml up -d --wait
npm run db:deploy
npm run db:status
docker compose -f compose.migrations.yaml down
```

Restaurar la conexión que tenía la terminal:

```powershell
if ($null -eq $previousDatabaseUrl) {
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
} else {
  $env:DATABASE_URL = $previousDatabaseUrl
}
```

El PR incluye `schema.prisma`, la migración generada y sus pruebas. Nunca se modifica una migración ya integrada. Los datos del contenedor no persisten después de detenerlo.

Antes de cambiar el esquema, consultar [operations/local-database.md](https://github.com/Maico-Zurbriggen/proyecto-gimnasio-documentacion/blob/main/operations/local-database.md).

### Promoción

- `test`: GitHub Actions aplica las migraciones en Neon Test con el secret de su environment.
- `main`: GitHub Actions espera la aprobación del environment `Production` y luego aplica las migraciones en Neon Producción.
- Vercel conserva únicamente la credencial runtime con pooler; nunca recibe el rol migrador.

## Verificación

```bash
npm run check
```

El backend publica OpenAPI como contrato para el frontend. El corpus funcional, la arquitectura y las reglas de dominio se mantienen exclusivamente en [proyecto-gimnasio-documentacion](https://github.com/Maico-Zurbriggen/proyecto-gimnasio-documentacion). Para trabajo asistido por IA, comenzar por su `AGENTS.md` y `manifest.json`.
