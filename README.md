# Proyecto Gimnasio — Backend

API REST de la plataforma de entrenamiento asistido, implementada con Node.js, Express, TypeScript, Prisma y PostgreSQL.

## Requisitos

- Node.js 24 o superior;
- npm 11.6 o superior;
- Docker Desktop para PostgreSQL local.

## Inicio local

```bash
npm ci
cp .env.example .env
docker compose up -d db
npm run db:generate
npm run dev
```

En PowerShell, usar `Copy-Item .env.example .env`. La API queda disponible en `http://localhost:3000` y el endpoint base de verificación es `GET /health`.

## Base de datos

Cada integrante usa su propio PostgreSQL local. El esquema y las migraciones se comparten mediante Git:

```bash
npm run db:migrate -- --name nombre_descriptivo
npm run db:deploy
npm run db:studio
```

Consultar [docs/local-database.md](docs/local-database.md) antes de modificar el modelo.

## Verificación

```bash
npm run check
```

El backend publica OpenAPI como contrato para el frontend. El corpus funcional compartido está indexado en [docs/README.md](docs/README.md).
