# ADR 0002: separación en tres repositorios

- Estado: aceptada
- Fecha: 2026-08-24

## Contexto

El equipo decidió asignar frontend, backend y análisis/IA a repositorios independientes. La frontera de despliegue y la responsabilidad de cada grupo pesan más que la navegación conjunta del monorepo.

## Decisión

Mantener tres repositorios:

- `proyecto-gimnasio`: SPA React;
- `proyecto-gimnasio-back`: API Express, Prisma y PostgreSQL;
- `proyecto-gimnasio-ia`: procesos batch Python.

El backend publica OpenAPI como contrato HTTP. El frontend genera cliente y tipos desde una versión explícita del contrato. El motor se integra por estructuras persistidas o snapshots acordados y nunca mediante imports entre repositorios.

El corpus funcional D1–D13 se copia en los tres repositorios. Todo cambio normativo debe aplicarse mediante PR relacionados para mantener las copias sincronizadas.

## Consecuencias

- Cada repositorio instala, prueba, versiona y despliega de manera autónoma.
- Se eliminan workspaces y dependencias por ruta local.
- Los cambios transversales requieren coordinación y PR relacionados.
- La documentación compartida puede divergir; cada cambio debe indicar los repositorios afectados.
- El motor sigue siendo batch: dividir repositorios no lo convierte en microservicio online.
