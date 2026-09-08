# Instrucciones del backend

## Contexto

Este repositorio contiene la API Express + TypeScript, Prisma y las migraciones PostgreSQL. El frontend React y el motor batch Python viven en repositorios independientes.

La documentación canónica vive en `Maico-Zurbriggen/proyecto-gimnasio-documentacion`. Cuando los repositorios están clonados como carpetas hermanas, leer primero `../proyecto-gimnasio-documentacion/AGENTS.md` y usar su `manifest.json` para seleccionar el contexto de la tarea. Si no está disponible localmente, consultar GitHub; no reconstruir reglas por memoria ni copiar documentación aquí.

## Responsabilidad

- Mantener un monolito modular desplegable en Vercel.
- Hacer cumplir invariantes, autorización, transacciones y contratos HTTP.
- Separar módulos por dominio al implementar historias verticales.
- Mantener `app.ts` libre del arranque para probar con Supertest.
- Usar routers y middleware explícitos; no crear un framework interno.
- Mantener Prisma como infraestructura; no exponer modelos ORM.
- Publicar OpenAPI como fuente de verdad del frontend.

## Estructura del código

Mantener un monolito modular organizado por dominio y crear carpetas sólo cuando exista código real que las justifique:

```text
src/
├── config/
├── infrastructure/
│   ├── database/
│   └── http/
├── integrations/
│   └── ai/
├── modules/
│   └── <module>/
│       ├── <module>.routes.ts
│       ├── <module>.controller.ts
│       ├── <module>.service.ts
│       ├── <module>.repository.ts
│       ├── <module>.schemas.ts
│       └── <module>.types.ts
├── shared/
│   ├── errors/
│   ├── middleware/
│   ├── schemas/
│   └── types/
├── app.ts
└── main.ts

prisma/
├── migrations/
├── seeds/
└── schema.prisma

test/
├── api/
├── integration/
└── helpers/
```

- `routes` declara endpoints y encadena middleware; no implementa reglas de negocio.
- `controller` traduce entre HTTP y los casos de uso; no accede directamente a Prisma.
- `service` concentra reglas de negocio, autorización y límites transaccionales.
- `repository` encapsula Prisma y devuelve estructuras de dominio o DTO internos, no modelos ORM hacia HTTP.
- `schemas` valida entradas, parámetros y salidas con Zod; `types` contiene tipos propios del módulo.
- `infrastructure/` contiene adaptadores técnicos; `integrations/ai/` es el único lugar que conoce la API Python.
- `shared/` recibe sólo código transversal usado por varios módulos y no se convierte en un dominio genérico.
- Mantener las pruebas unitarias junto al módulo y usar `test/api` y `test/integration` para pruebas transversales.
- No exigir todos los archivos a módulos simples ni crear todas las carpetas por anticipado.
- Crear inicialmente módulos como `auth`, `users`, `gyms`, `exercise-catalog`, `routine-templates`, `routines`, `training-sessions`, `evolution` y `notifications` a medida que se implementen.

## Dominio y seguridad

- Autorizar en dos pasos: rol y propiedad/asignación del recurso. Probar ambos.
- Usar cookies `httpOnly` para sesión; nunca guardar tokens en `localStorage`.
- Congelar la prescripción al iniciar una sesión y conservarla junto a los valores reales.
- Aplicar baja lógica cuando el historial dependa de una entidad.
- No modificar migraciones ya aplicadas. Crear una nueva y documentar cambios incompatibles.
- Actualizar OpenAPI en el mismo PR que cambie un contrato.
- Nombrar conceptos con los términos literales de `product/glossary.md` del repositorio documental.

## Integración IA

- Encapsular el servicio IA detrás de un cliente generado o validado desde su OpenAPI.
- Frontend nunca conoce la URL de IA; backend es el único consumidor.
- Crear una solicitud idempotente, minimizar el contexto y aceptar el flujo asíncrono con `202`.
- Leer estados y resultados de estructuras de integración; validar catálogo, compatibilidad, rangos y permisos antes de crear directamente una rutina `PROPUESTA`.
- Cada intento vence inicialmente a los 120 segundos y admite un único reintento.
- Tras el segundo fallo declarar generación no disponible; no implementar fallback determinístico.
- Mantener operativas las plantillas y la creación manual cuando falle generación. Los presets son alcance opcional y, si se implementan, siguen sujetos a aprobación del entrenador.
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
