Plan de Implementación: Bloqueo de Usuario a la 3ª Falta Consecutiva (T5)
Implementación de la tarea T5 correspondiente a la historia de usuario del sistema para la gestión de inactividad y propuestas de ajuste, aplicando arquitectura hexagonal estricta y modificando exclusivamente el backend proyecto-gimnasio-back.

Historia de Usuario y Contexto
Como sistema
Quiero generar la propuesta de ajuste apenas se cumplen los 3 meses, haya datos nuevos o no
Para que el circuito nunca quede esperando a que el alumno actúe

Tarea asignada:

T5: Bloqueo de usuario a la 3ª falta consecutiva.
Reglas de negocio provistas por el usuario:

El sistema permite que el usuario siga funcionando cuando lleva varios meses inactivo.
Mes 3 sin cargar los datos solicitados: 1ª falta
→
→ el usuario continúa ACTIVO.
Mes 6 sin cargar los datos solicitados: 2ª falta
→
→ el usuario continúa ACTIVO.
Mes 9 (o
≥
3
≥3 faltas consecutivas): 3ª falta
→
→ el usuario se bloquea (su estado pasa a SUSPENDIDO).
Decisiones de Diseño y Arquitectura Hexagonal
Se creará el módulo users (src/modules/users/), uno de los módulos canónicos establecidos en AGENTS.md.

1. Capa de Dominio (src/modules/users/domain/)
   user.entity.ts:
   Entidad de dominio User desacoplada de Prisma.
   Atributos: id, gymId, emailNormalized, displayName, state ('ACTIVO' | 'SUSPENDIDO'), etc.
   Método de negocio: suspend(reason: string): void.
   inactivity-strikes.service.ts:
   Función pura de cálculo:
   calculateConsecutiveFaltas(monthsInactive: number): number (calcula Math.floor(monthsInactive / 3)).
   calculateMonthsBetween(fromDate: Date, toDate: Date): number (diferencia en meses considerando años y meses calendario en UTC).
   evaluateInactivityStatus(consecutiveFaltas: number | { lastDataDate: Date, currentDate: Date }):
   Faltas < 3: { shouldBlock: false, state: 'ACTIVO', consecutiveFaltas, monthsInactive }.
   Faltas
   ≥
   ≥ 3: { shouldBlock: true, state: 'SUSPENDIDO', consecutiveFaltas, monthsInactive, reason: 'Bloqueo por 3ª falta consecutiva al alcanzar 9 meses sin carga de datos' }.
   user-errors.ts:
   UserNotFoundError, UserAlreadySuspendedError.
   Invariante: No importa Express, Prisma ni Zod.
2. Capa de Aplicación (src/modules/users/application/)
   Puertos (ports/):
   UsersRepository:
   findById(id: string): Promise<User | null>
   save(user: User): Promise<void>
   Reutilización del puerto Clock (de modules/routines/application/ports/clock.ts o port compartido).
   Casos de Uso (use-cases/):
   BlockUserOnInactivityUseCase:
   Recibe { userId: string, consecutiveFaltas?: number, monthsInactive?: number, lastDataDate?: Date }.
   Recupera el usuario desde UsersRepository.
   Aplica la regla de dominio: si consecutiveFaltas >= 3 (o monthsInactive >= 9), cambia el estado a SUSPENDIDO y persiste el cambio.
   Devuelve el DTO con el resultado de la evaluación y el estado actualizado.
   DTOs (dto/):
   InactivityEvaluationResultDto:
   userId: string
   state: 'ACTIVO' | 'SUSPENDIDO'
   blocked: boolean
   consecutiveFaltas: number
   monthsInactive: number
   reason?: string
3. Capa de Infraestructura (src/modules/users/infrastructure/)
   Persistencia (persistence/):
   PrismaUsersRepository: implementa UsersRepository utilizando prisma.user.findUnique y prisma.user.update, mapeando a la entidad User.
   HTTP (http/):
   users.schemas.ts: validación con Zod del userId y parámetros opcionales (consecutiveFaltas, monthsInactive, lastDataDate).
   users.controller.ts: recibe la petición, invoca el caso de uso y responde 200 OK (o mapea a 404 Not Found).
   users.routes.ts: define la ruta POST /users/:userId/inactivity-check protegida por autenticación y rol administrativo/sistema.
4. Integración en src/app.ts
   Permitir inyección de usersRepository en createApp({ ... }) para pruebas aisladas sin base de datos real.
   Montar usersRouter.
   Proposed Changes
   Backend (proyecto-gimnasio-back)
   [NEW]
   user.entity.ts
   Entidad User con manejo del estado (ACTIVO / SUSPENDIDO).
   [NEW]
   inactivity-strikes.service.ts
   Servicio de dominio para cálculo de faltas por inactividad (3 meses = 1 falta, 6 meses = 2 faltas, 9 meses = 3 faltas
   →
   → bloqueo).
   [NEW]
   user-errors.ts
   Errores de dominio UserNotFoundError y UserAlreadySuspendedError.
   [NEW]
   users.repository.ts
   Puerto UsersRepository.
   [NEW]
   inactivity-evaluation.dto.ts
   DTO de resultado de evaluación de faltas e inactividad.
   [NEW]
   block-user-on-inactivity.use-case.ts
   Caso de uso que orquesta la verificación y suspensión del usuario ante la 3ª falta consecutiva.
   [NEW]
   prisma-users.repository.ts
   Implementación de persistencia con Prisma para User.
   [NEW]
   users.schemas.ts
   Validación Zod para el endpoint de inactividad.
   [NEW]
   users.controller.ts
   Controlador HTTP para evaluación de faltas.
   [NEW]
   users.routes.ts
   Enrutador Express para POST /users/:userId/inactivity-check.
   [MODIFY]
   app.ts
   Registrar dependencias y montar usersRouter.
   [NEW] Tests
   src/modules/users/domain/services/inactivity-strikes.service.test.ts: Pruebas unitarias de las reglas de negocio (0 faltas < 3 meses, 1 falta a los 3 meses, 2 faltas a los 6 meses, 3 faltas a los 9 meses
   →
   → bloqueo).
   src/modules/users/application/use-cases/block-user-on-inactivity.use-case.test.ts: Pruebas unitarias del caso de uso con mocks.
   test/api/user-blocking.api.test.ts: Pruebas de integración HTTP con Supertest (bloqueo con 3 faltas, no bloqueo con 1 o 2 faltas, 404 si el usuario no existe, validación 400).
   Verification Plan
   Automated Tests
   Unit Tests:
   npx vitest run src/modules/users
   Integration Tests:
   npx vitest run test/api/user-blocking.api.test.ts
   Full Project Quality Check:
   npm run check (format:check, lint, typecheck, test, build).
