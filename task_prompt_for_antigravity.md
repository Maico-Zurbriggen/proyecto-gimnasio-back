# Prompt para Antigravity

A continuación tienes las instrucciones exactas y el prompt en markdown para enviarle a Antigravity.

---

```text
Lee atentamente las instrucciones generales antes de comenzar con la implementación.

### Reglas e Instrucciones Obligatorias
1. **Lectura Previa**: Antes de escribir o modificar código, DEBES leer obligatoriamente los archivos `AGENT.md` y `README.md` del repositorio para entender las pautas, convención de código, buenas prácticas y arquitectura del proyecto.
2. **Alcance Limitado a Backend**: Limítate **únicamente** a trabajar en la carpeta y archivos correspondientes al **Backend**. Queda estrictamente prohibido crear o modificar archivos en el frontend o en cualquier otra carpeta ajena al backend.
3. **Respeto a la Arquitectura**: Mantén y respeta la arquitectura existente (patrones de capas, nombrado de variables, manejo de errores, esquemas de DTOs, ORM/Migraciones y estructura de carpetas) que ya está establecida en el código del backend.
4. **Cero Funcionalidades Extra**: Implementa únicamente lo especificado en los criterios de aceptación descritos abajo. No agregues endpoints extra, librerías no solicitadas ni lógica que no esté en este requerimiento.

---

### Requerimiento Técnico: HU09 y HU10 (Exclusivamente Backend)

#### HU09: Recuperar mis credenciales

**Criterios de aceptación (Backend):**

*Solicitud de recuperación:*
1. **Correo registrado**: Con un correo registrado, la API genera un enlace de recuperación con token y dispara el envío del correo.
2. **Correo no registrado**: Responde con el mismo status y payload exacto que con un correo registrado. No debe revelar si el correo existe o no, ni por mensaje ni por timing/tiempo de respuesta.
3. **Seguridad del Token**: El token debe almacenarse en la base de datos únicamente en forma de **hash** junto con su fecha/hora de vencimiento. Nunca se guarda en texto plano o utilizable.
4. **Expiración**: El enlace/token caduca a las 2 horas y debe ser evaluado estrictamente en el servidor (RN-06).
5. **Invalidación**: Emitir un enlace/token nuevo invalida automáticamente el token previo.
6. **Rate Limiting**: Limitar las solicitudes repetidas desde un mismo origen a máximo dos (2) solicitudes por día (RNF-17).

*Uso del enlace:*
7. **Consumo de token**: Con un token vigente y contraseña válida, se actualiza la contraseña y el token pasa a estado usado/invalidador.
8. **Uso único**: El token es de un solo uso; intentos subsecuentes con el mismo enlace deben ser rechazados.
9. **Manejo de errores genérico**: Un token vencido, ya usado, invalidado por uno nuevo o inexistente se rechaza con un mensaje genérico que no revele datos sobre la cuenta.
10. **Seguridad de Contraseña**: La nueva contraseña debe validar la política de fortaleza (misma regla de HU06) y guardarse únicamente con hash + sal única (RNF-15).
11. **Logs y respuestas**: La contraseña nueva no debe figurar en logs ni en las respuestas de la API (RNF-19).
12. **Inmediatización**: La contraseña anterior deja de funcionar de forma inmediata.
13. **Revocación de sesiones**: Tras restablecer la contraseña, se deben revocar todas las sesiones previas del usuario.

*Cambio de contraseña autenticado (RF-003):*
14. Un usuario autenticado puede cambiar su contraseña enviando la nueva, cumpliendo la política de fortaleza.
15. Si no hay sesión válida (no autenticado), responde `401 Unauthorized`.
16. Un usuario solo puede cambiar su propia contraseña (no existe parámetro ni endpoint para enviar el ID de otro usuario).
17. Tras el cambio autenticado, las demás sesiones se revocan, manteniendo la sesión actual activa.

*Estados de cuenta y roles:*
18. Cuentas suspendidas o dadas de baja no deben recibir enlace de recuperación; la API responde exactamente igual que para un correo no registrado.
19. Las operaciones de recuperación no deben alterar ni modificar roles, gimnasios asignados ni relaciones de datos del usuario.

---

#### HU10: Declarar un objetivo de entrenamiento (Backend - T1 y T2)

**Criterios de aceptación (Backend):**

*Declarar y modificar (T1):*
1. **Primer objetivo**: Un alumno autenticado puede declarar su primer objetivo; queda registrado como vigente con fecha de inicio y sin fecha de fin (`null`).
2. **Valores permitidos**: El objetivo debe ser obligatoriamente uno de los cuatro valores enum: `FUERZA`, `HIPERTROFIA`, `RESISTENCIA_MUSCULAR`, `ACONDICIONAMIENTO_GENERAL`. Cualquier otro valor es rechazado con error de validación.
3. **Objetivo único vigente**: Un alumno solo puede tener **un (1) objetivo vigente** como máximo (RN-09, RI-04). Garantizar esto a nivel de base de datos mediante un **índice único parcial** (además de la validación por código).
4. **Transaccionalidad al modificar**: Al declarar un nuevo objetivo, el objetivo anterior se cierra asignando su fecha de fin igual a la fecha de inicio del nuevo, todo dentro de la misma transacción.
5. **Concurrencia e idempotencia**: Dos requests simultáneos no deben dejar dos objetivos vigentes. Si se intenta declarar exactamente el mismo objetivo que ya está vigente, no se genera un nuevo registro ni duplicado.
6. **Timezone**: La fecha y hora de inicio/fin debe calcularse según la zona horaria del gimnasio al que pertenece el alumno (no la del dispositivo ni server UTC simple si aplica la regla local del gym).
7. **Sin objetivo por defecto**: Un alumno sin objetivo declarado debe tener el campo vacío/nulo, diferenciable explícitamente de cualquier valor por defecto (RN-09).

*Historial (T2):*
8. **Consulta de historial**: Endpoint que devuelve la lista con todos los objetivos del alumno (tipo, fecha inicio, fecha fin) en orden cronológico.
9. **Inmutabilidad**: Modificar el objetivo conserva el registro anterior en el historial; no se borra ni sobrescribe.
10. **Consulta por fecha**: La API debe permitir consultar o determinar qué objetivo estaba vigente dada una fecha en particular (D6, RF-008).

*Permisos y accesos:*
11. **Alumno**: Solo puede leer y escribir sus propios objetivos.
12. **Entrenador con asignación**: Un entrenador con asignación vigente puede leer los objetivos de su alumno, pero NO declararlos ni modificarlos (retornar `403 Forbidden` en intentos de escritura - D3).
13. **Entrenador sin asignación / Admin**: Entrenador sin asignación vigente sobre el alumno o Administrador reciben `403 Forbidden` al intentar leer. Alumnos de otro gimnasio reciben `403` o `404` genérico (RA-01, RA-02, RA-06, RNF-14).
14. **Fin de asignación**: Si la asignación del entrenador finaliza, pierde el acceso de lectura al historial inmediatamente (RA-04).

*Efectos sobre otras reglas de negocio:*
15. **Reevaluación de rutina**: Al cambiar el objetivo, se debe disparar el evento o la lógica de reevaluación de la rutina vigente (RN-91, RF-094) para proponer el cambio de tipo de rutina con reajuste de esquemas si aplica (FL-12/A3).
16. **Validación de coincidencia**: Al revisar una rutina cuyo tipo no coincida con el objetivo vigente (y no sea `ACONDICIONAMIENTO_GENERAL`), la API debe alertar o requerir confirmación por parte del entrenador (RN-40).
17. **Contexto suficiente**: El objetivo vigente debe integrarse como parte del cálculo del contexto suficiente del alumno (RF-111, RN-97b).
```
