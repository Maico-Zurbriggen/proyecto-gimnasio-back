# CLAUDE.md

Leé primero `AGENTS.md` y el documento funcional correspondiente en `docs/`.

Este repositorio contiene únicamente el backend Express + TypeScript, Prisma y PostgreSQL. El frontend y el motor analítico son repositorios externos. OpenAPI es el contrato con el frontend; las estructuras persistidas o snapshots acordados son la frontera con el motor.

No mezcles prescripción con ejecución, no reescribas historial, y autorizá siempre por rol y por propiedad/asignación. Toda modificación de contrato, permiso, migración o regla de dominio requiere documentación y tests en el mismo PR.
