# ADR 0001: monorepo y motor analítico batch

- Estado: reemplazada por ADR 0002
- Fecha: 2026-08-18

## Contexto

Nueve integrantes trabajarán durante aproximadamente catorce semanas. El producto combina una SPA, una API transaccional y análisis/ML, pero el presupuesto no justifica microservicios ni múltiples despliegues backend.

## Decisión

Mantener frontend, backend, contratos y motor Python en un único repositorio. Desplegar el backend como monolito modular. Ejecutar el motor como proceso programado o manual que escribe resultados en PostgreSQL, fuera del camino de las peticiones.

## Consecuencias

- La IA puede inspeccionar contratos y consumidores juntos.
- Los cambios transversales se revisan en un solo PR.
- El motor puede usar el ecosistema Python sin imponerlo al backend.
- No hay inferencia online ni segundo servicio obligatorio.
- CI debe validar TypeScript y Python y se deben respetar límites explícitos entre carpetas.
