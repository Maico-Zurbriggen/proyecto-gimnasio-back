# Arquitectura del sistema

## Distribución

```text
React SPA ──REST/JSON──> Express + TypeScript ──> PostgreSQL
                                                   ^
                                                   |
                                             Python batch
```

El sistema usa tres repositorios. Este repositorio contiene la API y es dueño del contrato OpenAPI, las invariantes transaccionales, la autorización, Prisma y las migraciones.

## Backend

Se mantiene un monolito modular con un solo despliegue. Los módulos previstos son identidad, catálogo, rutinas, entrenamiento, métricas, seguimiento y administración. Se crean al implementar historias verticales, no como carpetas vacías.

Los routers sólo traducen HTTP. Las reglas viven en servicios o funciones de dominio y Prisma queda detrás de adaptadores de persistencia.

## Fronteras

- OpenAPI es la fuente de verdad para el frontend.
- Prisma no se expone como contrato HTTP.
- PostgreSQL es la única fuente de verdad transaccional.
- El motor Python lee vistas o snapshots acordados y escribe salidas precalculadas versionadas.
- El backend nunca ejecuta entrenamiento ni inferencia Python dentro de una petición.
- Los proveedores externos se aíslan con timeout, límite y fallback determinístico.

## Invariantes

1. Una plantilla se copia al solicitar una rutina; los cambios posteriores no reescriben versiones existentes.
2. Al comenzar una sesión se congela lo prescripto junto a lo realmente ejecutado.
3. Historial e indicadores derivados no son fuentes de verdad editables.
4. El entrenador es la puerta de aprobación para poner una rutina en vigencia.
5. La autorización combina rol y propiedad/asignación del recurso.
6. Ningún fallo inteligente o externo produce un 5xx si existe la vía determinística.
