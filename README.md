# Proyecto Gimnasio — Backend

API REST Express + TypeScript, Prisma y PostgreSQL. Se despliega en Vercel, persiste en Neon y orquesta solicitudes hacia el servicio Python del Polo mediante su API expuesta por ngrok.

## Requisitos

- Node.js 24 o superior;
- npm 11.6 o superior;
- acceso autorizado a Neon Test;
- credencial test del servicio IA cuando se prueba integración real.

## Inicio local

```bash
npm ci
cp .env.example .env
npm run db:generate
npm run db:status
npm run dev
```

En PowerShell, usar `Copy-Item .env.example .env`. La API queda en `http://localhost:3000`; `GET /health` es la verificación base.

## Base de datos

El backend local usa Neon Test compartida. No ejecutar `prisma migrate reset`, `prisma db push`, seeds destructivos ni `migrate dev` sobre esa base. Las migraciones se aplican desde CI mediante `npm run db:deploy`.

Antes de cambiar el esquema, consultar [operations/local-database.md](https://github.com/Maico-Zurbriggen/proyecto-gimnasio-documentacion/blob/main/operations/local-database.md).

Consultar [docs/local-database.md](docs/local-database.md) antes de modificar el modelo.
Consultar la guía `operations/local-database.md` del [repositorio documental](https://github.com/Maico-Zurbriggen/proyecto-gimnasio-documentacion) antes de modificar el modelo.

## Verificación

```bash
npm run check
```

El backend publica OpenAPI como contrato para el frontend. El corpus funcional compartido está indexado en [docs/README.md](docs/README.md).
El backend publica OpenAPI como contrato para el frontend. El corpus funcional, la arquitectura y las reglas de dominio se mantienen exclusivamente en [proyecto-gimnasio-documentacion](https://github.com/Maico-Zurbriggen/proyecto-gimnasio-documentacion). Para trabajo asistido por IA, comenzar por su `AGENTS.md` y `manifest.json`.
