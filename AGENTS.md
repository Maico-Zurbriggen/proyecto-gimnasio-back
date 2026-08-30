# Instrucciones del backend

## Contexto

Este repositorio contiene la API Express + TypeScript, Prisma y las migraciones PostgreSQL. El frontend React y el motor batch Python viven en repositorios independientes. Antes de implementar una historia, consultar el documento funcional correspondiente en `docs/`.
Este repositorio contiene la API Express + TypeScript, Prisma y las migraciones PostgreSQL. El frontend React y el motor batch Python viven en repositorios independientes.

La documentación canónica vive en `Maico-Zurbriggen/proyecto-gimnasio-documentacion`. Cuando los repositorios están clonados como carpetas hermanas, leer primero `../proyecto-gimnasio-documentacion/AGENTS.md` y usar su `manifest.json` para seleccionar el contexto de la tarea. Si

## Responsabilidad

- Mantener un monolito modular desplegable en Vercel.
- Hacer cumplir invariantes, autorización, transacciones y contratos HTTP.
- Separar módulos por dominio al implementar historias verticales.
- Mantener `app.ts` libre del arranque para probar con Supertest.
- Usar routers y middleware explícitos; no crear un framework interno.
- Mantener Prisma como infraestructura; no exponer modelos ORM.
- Publicar OpenAPI como fuente de verdad del frontend.

## Dominio y seguridad

- Autorizar en dos pasos: rol y propiedad/asignación del recurso. Probar ambos.
- Usar cookies `httpOnly` para sesión; nunca guardar tokens en `localStorage`.
- Congelar la prescripción al iniciar una sesión y conservarla junto a los valores reales.
- Aplicar baja lógica cuando el historial dependa de una entidad.
- No modificar migraciones ya aplicadas. Crear una nueva y documentar cambios incompatibles.
- Actualizar OpenAPI en el mismo PR que cambie un contrato.
- Nombrar conceptos con los términos literales de `docs/D2-glosario.md`.
- Nombrar conceptos con los términos literales de `product/glossary.md` del repositorio documental.

## Integración IA

- Encapsular el servicio IA detrás de un cliente generado o validado desde su OpenAPI.
- Frontend nunca conoce la URL de IA; backend es el único consumidor.
- Crear una solicitud idempotente, minimizar el contexto y aceptar el flujo asíncrono con `202`.
- Leer estados y resultados de estructuras de integración; validar catálogo, compatibilidad, rangos y permisos antes de crear un candidato.
- Cada intento vence inicialmente a los 120 segundos y admite un único reintento.
- Tras el segundo fallo declarar generación no disponible; no implementar fallback determinístico.
- Mantener disponibles los presets publicados del gimnasio, siempre sujetos a aprobación del entrenador.
- Usar credenciales distintas para test y producción. No enviar URLs de base, datos identificatorios innecesarios ni secretos al Polo.
- Los tests pueden simular transporte HTTP; no agregar un modo fake ejecutable.

## Forma de trabajo

- Crear ramas desde `develop`; todo cambio entra por pull request.
- Usar Conventional Commits en inglés: `type(scope): summary`.
- No agregar dependencias de producción sin justificar su necesidad en el PR.
- Relacionar el PR de código con el PR documental cuando cambie un contrato, una regla, una migración conceptual o un flujo.

## Verificación

- Ejecutar `npm run check`.
- Priorizar unitarias para reglas, API tests para permisos y persistencia para integración.
- Probar idempotencia, timeout, reintento, rol IA restringido y aislamiento test/producción.

## Code Review Rules

- Señalar routers con lógica de dominio o Prisma directo.
- Señalar identificadores de alumno sin prueba 403 de acceso ajeno.
- Señalar migraciones destructivas sobre la base compartida.
- Señalar llamadas al LLM desde backend o trabajos Python dentro de una petición.
- Exigir test para regla, permiso y corrección de bug.
