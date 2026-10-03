# Proyecto Gimnasio — Backend

API REST Express + TypeScript, Prisma y PostgreSQL. En desarrollo usa una base local en Docker; los despliegues reciben su base y servicio IA mediante variables de entorno. El servicio IA es el único que accede al LLM mediante la API autenticada del Polo.

## Requisitos

- Node.js 24 o superior;
- npm 11.6 o superior;
- Docker Desktop para PostgreSQL local;
- credencial del Polo en `AI/.env.local` para probar generación real.

## Inicio local

```bash
npm ci
cp .env.example .env
npm run db:generate
docker compose -f compose.local.yaml up -d --wait
npm run db:deploy
npm run dev
```

En PowerShell, usar `Copy-Item .env.example .env`. La API queda en `http://localhost:3000`. El volumen `gym_local_postgres_data` conserva la base entre reinicios y el puerto queda limitado a `127.0.0.1:55432`.

Si Windows reserva ese puerto, configurar `LOCAL_DATABASE_PORT` con uno libre y actualizar `DATABASE_URL` del backend y de IA al mismo puerto. El procedimiento está en [la operación local de la base](https://github.com/Maico-Zurbriggen/proyecto-gimnasio-documentacion/blob/develop/operations/local-database.md). Para generar, mantener también activo `AI/dev_server.py`; `npm run dev` inicia únicamente el backend.

Para poblar los datos ficticios locales después de aplicar las migraciones:

```powershell
Get-Content -Raw prisma/local-ai-role.sql | docker compose -f compose.local.yaml exec -T postgres psql -U gym_migrator -d gym_local -v ON_ERROR_STOP=1
Get-Content -Raw prisma/seeds/seed-reference.sql | docker compose -f compose.local.yaml exec -T postgres psql -U gym_migrator -d gym_local -v ON_ERROR_STOP=1
Get-Content -Raw prisma/seeds/seed-test.sql | docker compose -f compose.local.yaml exec -T postgres psql -U gym_migrator -d gym_local -v ON_ERROR_STOP=1
```

`seed-test.sql` contiene identidades ficticias y sólo se ejecuta en esta base local.
El servicio IA usa `postgresql://gym_ai_local@127.0.0.1:55432/gym_local`, sin el
parámetro `schema` de Prisma y con permisos limitados a sus tablas de integración.
Para habilitar el login del alumno de prueba, definir una clave sólo durante el
comando (no queda guardada en el repositorio):

```powershell
$env:LOCAL_TEST_PASSWORD = 'GymLocal2026!'
npm run db:seed:local-login
Remove-Item Env:LOCAL_TEST_PASSWORD
```

El login es `alumno.martin@gimnasio.test`. El comando valida que la URL sea la
base local `gym_local` antes de cambiar la contraseña.

- `GET /health` verifica que el proceso HTTP esté disponible.
- `GET /ready` comprueba PostgreSQL configurado para el ambiente local.

`DATABASE_URL` apunta a PostgreSQL local. `CORS_ORIGINS` acepta orígenes separados por comas y debe incluir `http://localhost:5173` para desarrollo local.

Usar `npm run db:status` para comprobar el estado de las migraciones y `GET /ready` para verificar la conexión de la API con PostgreSQL.

### Generación de rutinas

El contenido de cada rutina generada devuelve `generationPrompt` con el texto de su solicitud. Los pedidos explícitos de cantidades por músculo y por día se persisten como `muscle_counts_per_day` y se validan contra los músculos primarios del catálogo. Si faltan ejercicios compatibles, la API devuelve `422 generation_preferences_unsatisfiable` con el motivo. Los resultados que ignoran esas cantidades no reemplazan la propuesta anterior.

Para ampliar el catálogo ficticio local: `npm run db:seed:local-generation-catalog`. El archivo `scripts/local-exercise-catalog.cjs` contiene 132 ejercicios y variantes para los 17 grupos musculares, con instrucciones propias en español, participación primaria y secundaria, articulaciones, nivel y equipamiento. El importador evita duplicados por nombre normalizado, conserva los ejercicios e historiales existentes y comprueba dentro de la transacción al menos cinco ejercicios primarios por grupo. Es idempotente y sólo permite PostgreSQL local en el puerto configurado y la base `gym_local`; no cambia el perfil del alumno ni el inventario. Los metadatos de estos fixtures requieren curación por un entrenador antes de usarse como catálogo real.

La generación selecciona hasta 32 ejercicios compatibles de forma reproducible: prioriza las cantidades y músculos indicados, reserva la cobertura mínima de patrones y completa con variedad muscular. Persiste el subconjunto completo que recibe IA, para evitar que un catálogo grande supere el contexto del modelo.

El alumno crea para sí una solicitud con `POST /students/:studentId/routine-generations`. Backend persiste con idempotencia el contexto minimizado y el catálogo compatible, registra el ownership y envía sólo el UUID al servicio IA para despacharlo a la cola. Consulta el estado con `GET /students/:studentId/routine-generations/:requestId`. Cuando el estado es `COMPLETADA`, el frontend ejecuta `POST /students/:studentId/routine-generations/:requestId/finalize`: backend vuelve a validar catálogo, compatibilidad y rangos, registra la validación y crea idempotentemente una rutina `PROPUESTA`. Esto no la aprueba ni la pone en vigencia: el entrenador asignado conserva la revisión obligatoria. La consulta de estado no modifica datos y una propuesta previa nunca se descarta de forma implícita.

El desarrollo local usa el mismo login por cookie que los despliegues. Los headers `x-user-*` se aceptan exclusivamente dentro de las pruebas automatizadas y no sustituyen una sesión al ejecutar `npm run dev`.

Para probar otro prompt con una propuesta pendiente, activar `LOCAL_GENERATION_TESTING=true` con `NODE_ENV=development` y la base `gym_local` en el puerto local `55432`. `POST /students/:studentId/routine-generations` admite entonces `regenerar: true`. El reemplazo se realiza al finalizar una salida válida: sólo la propuesta capturada al solicitar se descarta, con auditoría, dentro de la misma transacción que crea la nueva. La propuesta anterior se conserva si falla la generación. Esta capacidad no se habilita con una conexión remota ni en producción.

## Estructura del código

El backend es un monolito modular con arquitectura hexagonal por dominio:

```text
src/
├── config/
├── infrastructure/                  # Configuración técnica compartida
│   ├── database/
│   └── http/
├── integrations/ai/                 # Adaptador hacia la API Python
├── modules/
│   └── <module>/
│       ├── domain/                  # Entidades y reglas puras
│       ├── application/
│       │   ├── ports/               # Interfaces de salida
│       │   ├── use-cases/           # Orquestación de aplicación
│       │   └── dto/
│       └── infrastructure/
│           ├── http/                # Express y Zod
│           └── persistence/         # Adaptadores Prisma
├── shared/
├── app.ts
└── main.ts

prisma/                              # Schema, migraciones y seeds
test/                                # Pruebas API, integración y helpers
```

Las dependencias apuntan hacia el dominio: éste no conoce Express, Prisma, Zod ni la API Python. Los casos de uso dependen de puertos; los adaptadores HTTP, Prisma y de IA implementan los límites externos. La estructura se crea progresivamente y no se agregan abstracciones o archivos vacíos sin una necesidad concreta. Las reglas completas están en `AGENTS.md`.

## Despliegue en Vercel

Vercel detecta `src/app.ts` como la entrada Express. `src/main.ts` se usa solamente para levantar el servidor local. Las Functions se ejecutan en São Paulo (`gru1`) para mantenerlas cerca de Neon `sa-east-1`.

- Preview asociado a `test`: `DATABASE_URL` de `backend_test` y URL del frontend Test en `CORS_ORIGINS`.
- Production asociado a `main`: `DATABASE_URL` de `backend_production` y URL del frontend productivo en `CORS_ORIGINS`.
- `AI_SERVICE_URL` apunta al deployment equivalente del repo IA y `AI_SERVICE_API_KEY` coincide con el secreto configurado allí.
- `CRON_SECRET` es un secreto aleatorio de al menos 16 caracteres. Vercel lo envía como `Authorization: Bearer ...` al job diario `/internal/jobs/measurement-blocks`; usar valores distintos en Test y Producción.
- No configurar roles `migrator` ni credenciales administrativas en Vercel.

Tras cambiar una variable de entorno, volver a desplegar para aplicarla.

## Base de datos

El backend local usa Neon Test compartida. No ejecutar `prisma migrate reset`, `prisma db push`, seeds destructivos ni `migrate dev` sobre esa base. Las migraciones se aplican desde CI mediante `npm run db:deploy`.

### Datos iniciales de Test

Después de aplicar la migración, ejecutar mediante el SQL Editor de Neon y en este orden:

1. `prisma/seeds/seed-reference.sql`: equipamiento, músculos y articulaciones.
2. `prisma/seeds/seed-catalog.sql`: catálogo base de ejercicios y sus relaciones.
3. `prisma/seeds/seed-test.sql`: usuarios ficticios multirrol, rutinas, sesiones y casos funcionales de Test.

Los tres scripts son repetibles y exclusivos de Test. `seed-test.sql` utiliza correos `@gimnasio.test` y hashes bcrypt válidos; la contraseña compartida por el equipo no se versiona en texto plano. Al reejecutarlo sólo se actualiza `password_hash` para los usuarios de prueba existentes.

### Crear una migración

Sólo el autor de una migración levanta PostgreSQL efímero:

```powershell
docker compose -f compose.migrations.yaml up -d --wait
$previousDatabaseUrl = $env:DATABASE_URL
$env:DATABASE_URL = "postgresql://gym_migrator@localhost:55432/gym_migrations?schema=public"
npm run db:migrate -- --name nombre_descriptivo
npm run db:status
npm run check
```

Revisar el SQL generado y comprobar que todo el historial se aplica sobre una base vacía:

```powershell
docker compose -f compose.migrations.yaml down
docker compose -f compose.migrations.yaml up -d --wait
npm run db:deploy
npm run db:status
docker compose -f compose.migrations.yaml down
```

Restaurar la conexión que tenía la terminal:

```powershell
if ($null -eq $previousDatabaseUrl) {
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
} else {
  $env:DATABASE_URL = $previousDatabaseUrl
}
```

El PR incluye `schema.prisma`, la migración generada y sus pruebas. Nunca se modifica una migración ya integrada. Los datos del contenedor no persisten después de detenerlo.

Antes de cambiar el esquema, consultar [operations/local-database.md](https://github.com/Maico-Zurbriggen/proyecto-gimnasio-documentacion/blob/main/operations/local-database.md).

### Promoción

- `test`: GitHub Actions aplica las migraciones en Neon Test con el secret de su environment.
- `main`: GitHub Actions espera la aprobación del environment `Production` y luego aplica las migraciones en Neon Producción.
- Vercel conserva únicamente la credencial runtime con pooler; nunca recibe el rol migrador.

## Verificación

```bash
npm run check
```

El backend publica OpenAPI como contrato para el frontend. El corpus funcional, la arquitectura y las reglas de dominio se mantienen exclusivamente en [proyecto-gimnasio-documentacion](https://github.com/Maico-Zurbriggen/proyecto-gimnasio-documentacion). Para trabajo asistido por IA, comenzar por su `AGENTS.md` y `manifest.json`.
