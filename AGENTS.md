# Instrucciones del backend

## Contexto

Este repositorio contiene la API Express + TypeScript, Prisma y las migraciones PostgreSQL. El frontend React y el motor batch Python viven en repositorios independientes. Antes de implementar una historia, consultar el documento funcional correspondiente en `docs/`.

## Responsabilidad

- Mantener un único despliegue organizado como monolito modular.
- Hacer cumplir invariantes, autorización, transacciones y contratos HTTP.
- Separar módulos por dominio: identidad, catálogo, rutinas, entrenamiento, métricas, seguimiento y administración.
- Mantener `app.ts` libre del arranque del servidor para probar la aplicación con Supertest.
- Usar routers y middleware explícitos; no crear un framework interno ni contenedores de inyección de dependencias.
- Mantener Prisma como detalle de infraestructura; no exponer modelos ORM como respuestas HTTP.
- Publicar OpenAPI como fuente de verdad para consumidores externos.

## Dominio y seguridad

- Autorizar en dos pasos: rol y propiedad/asignación del recurso. Probar ambos.
- Usar cookies `httpOnly` para sesión; nunca guardar tokens en `localStorage`.
- Congelar la prescripción al iniciar una sesión y conservarla junto a los valores reales.
- Aplicar baja lógica cuando el historial dependa de una entidad.
- No modificar migraciones ya aplicadas. Crear una nueva y documentar cambios incompatibles.
- Actualizar OpenAPI en el mismo PR que cambie un contrato.
- Nombrar conceptos con los términos literales de `docs/D2-glosario.md`.

## Integraciones

- Encapsular LLM y recomendadores detrás de puertos/adaptadores.
- Aplicar timeout, reintento limitado, límite y fallback determinístico.
- Leer resultados del motor precalculados; no ejecutar Python durante una petición.

## Forma de trabajo

- Crear ramas desde `develop`; todo cambio entra por pull request.
- Usar Conventional Commits en inglés: `type(scope): summary`.
- No agregar dependencias de producción sin justificar su necesidad en el PR.

## Verificación

- Ejecutar `npm run check` antes de cerrar una tarea.
- Priorizar unit tests para reglas puras, tests de API para autorización y tests de integración para persistencia.

## Code Review Rules

- Señalar routers con lógica de dominio o acceso directo a Prisma.
- Señalar endpoints con identificadores de usuario que no prueben acceso ajeno con 403.
- Señalar cambios que reescriban sesiones, series históricas o versiones ya congeladas.
- Exigir test para toda regla de dominio, permiso y corrección de bug.
