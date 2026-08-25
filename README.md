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

Consultar la guía `operations/local-database.md` del [repositorio documental](https://github.com/Maico-Zurbriggen/proyecto-gimnasio-documentacion) antes de modificar el modelo.

## Verificación

```bash
npm run check
```

El backend publica OpenAPI como contrato para el frontend. El corpus funcional, la arquitectura y las reglas de dominio se mantienen exclusivamente en [proyecto-gimnasio-documentacion](https://github.com/Maico-Zurbriggen/proyecto-gimnasio-documentacion). Para trabajo asistido por IA, comenzar por su `AGENTS.md` y `manifest.json`.
