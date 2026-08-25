# D4 — Modelo de dominio

|                |                                              |
| -------------- | -------------------------------------------- |
| **Versión**    | 2.0                                          |
| **Fecha**      | 2026-08-18                                   |
| **Estado**     | Normativo. Congelar antes de escribir código |
| **Depende de** | D1, D2, D3                                   |

**Cambios de la v1.0:** entidades `Invitacion` e `InventarioGimnasio` · `EquipamientoDisponible` eliminada (el equipamiento es del gimnasio) · `EjercicioArticulacion` agregada, sin la cual la compatibilidad no era calculable · `EjercicioRutina` gana el estado de compatibilidad que cuatro reglas exigían y el modelo no soportaba · `Ejercicio` gana el nivel de dificultad como atributo tipado · dos referencias cruzadas corregidas · PD-07 nuevo.

---

## 1. Estructura general

```
Gimnasio ──< InventarioGimnasio >── (equipamiento, §4.1 de D2)
 │
 ├─< Invitacion ──▶ (produce) ──▶ Usuario
 │
 ├─< Usuario ──< RolUsuario
 │     ├── PerfilAlumno ──< Objetivo(vigencia)
 │     │        ├─< CondicionFisica(vigencia, zona corporal, severidad)
 │     │        ├─< Aptitud
 │     │        └─< MedicionCorporal
 │     ├── PerfilEntrenador
 │     ├─< Consentimiento
 │     └─< AsignacionEntrenador (alumno ─ entrenador, vigencia)
 │
 ├─< PlantillaRutina ──< DiaPlantilla ──< EjercicioPlantilla ──< SeriePrescriptaPlantilla
 │        │
 │        │  (copia profunda al solicitar)
 │        ▼
 │   RutinaAsignada ──< RevisionRutina
 │        ├──< VersionRutina ──< DiaRutina ──< EjercicioRutina ──< SeriePrescripta
 │        │         ▲
 │        │         │ (una propuesta aceptada genera una versión)
 │        │   PropuestaAdaptacion ──< AjustePropuesto
 │        │         ▲
 │        │   DiagnosticoEvolucion ──< DiagnosticoEjercicio
 │        ▼
 │   SesionEntrenamiento ──< RegistroSerie   [prescripto + ejecutado en la misma fila]
 │        └─< Comentario
 │
 └─< Ejercicio (del gimnasio)          CATÁLOGO BASE (global, gimnasio = null)
            └────────────── Ejercicio ──< EjercicioMusculo   >── GrupoMuscular
                                      ──< EjercicioArticulacion >── Articulacion
                                      ──< EjercicioEquipamiento

   RecordPersonal · ScoreRiesgo · SegmentoPerfil · Aviso
   RegistroAuditoria · EvaluacionComponente
```

## 2. Entidades

### 2.1 Ámbito, identidad y alta

| Entidad                | Atributos relevantes                                                                                          | Notas                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Gimnasio**           | nombre, zona horaria, estado de afiliación, activo                                                            | Creado por aprovisionamiento (RF-115), no por ningún rol de la aplicación. Su zona horaria define el día y la semana de todos sus usuarios |
| **InventarioGimnasio** | gimnasio, equipamiento (§4.1 de D2), presente                                                                 | N:M contra la enumeración cerrada. **Determina el catálogo prescribible del gimnasio.** Ver PD-07                                          |
| **Invitacion**         | gimnasio, correo destinatario, roles ofrecidos, emitida por, emitida en, vence en, estado, usuario resultante | Única vía de alta. Ver PD-08                                                                                                               |
| **Usuario**            | gimnasio, correo, nombre, estado, fecha de alta, invitación de origen                                         | El correo es único **dentro del gimnasio**: una misma persona puede ser alumna de dos gimnasios. Ver DD-24                                 |
| **RolUsuario**         | usuario, rol ∈ {ALUMNO, ENTRENADOR, ADMINISTRADOR}                                                            | Conjunto, no valor único. Un usuario tiene ≥1                                                                                              |
| **Consentimiento**     | usuario, tipo, otorgado, instante, texto aceptado                                                             | Se conserva el texto exacto que se aceptó, no una referencia a la versión actual                                                           |

### 2.2 Estado del alumno

| Entidad                  | Atributos relevantes                                                                                                                         | Cardinalidad                                                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **PerfilAlumno**         | usuario, fecha de nacimiento, sexo, altura, nivel de experiencia (§4.4), días semanales disponibles, estado de membresía, nivel de actividad | 1:1 con Usuario con rol ALUMNO. `nivel de actividad` alimenta la estimación energética de RF-012                                              |
| **Objetivo**             | perfil, tipo (§4.5), desde, hasta                                                                                                            | 1:N. **Como máximo uno** con `hasta = null`; ninguno antes de la primera declaración                                                          |
| **CondicionFisica**      | perfil, zona corporal (§4.2 ∪ §4.3), severidad (§4.6), descripción libre, desde, hasta                                                       | 1:N. Varias pueden estar vigentes a la vez. **La zona corporal y la severidad son tipadas**: son las que hacen calculable la contraindicación |
| **Aptitud**              | perfil, fecha de emisión, fecha de vencimiento, observación, cargada por                                                                     | 1:N. La vigente es la de vencimiento más lejano no superado. `cargada por` admite al alumno o a un administrador                              |
| **MedicionCorporal**     | perfil, tipo (§4.11), valor, fecha                                                                                                           | 1:N. Única por (perfil, tipo, fecha)                                                                                                          |
| **PerfilEntrenador**     | usuario, especialidad, experiencia, presentación                                                                                             | 1:1 con Usuario con rol ENTRENADOR                                                                                                            |
| **AsignacionEntrenador** | alumno, entrenador, desde, hasta, autor del alta, autor de la baja                                                                           | N:M con vigencia. Como máximo una vigente por alumno, por regla RN-18 y no por estructura                                                     |

**Por qué la asignación es N:M y no un campo en el alumno.** Un campo no permite responder "¿cambió de entrenador antes de abandonar?" ni auditar quién lo asignó. La unicidad se impone por RN-18. Costo marginal: nulo.

**Por qué el alumno ya no declara equipamiento.** Ver PD-07.

### 2.3 Catálogo

| Entidad                             | Atributos relevantes                                                                                                                                                | Notas                                                                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Ejercicio**                       | gimnasio (nulo si es del catálogo base), nombre, instrucciones, patrón de movimiento (§4.7), nivel de dificultad (§4.4), unilateral, recurso visual, estado, origen | `gimnasio = null` identifica el catálogo base                                                                                              |
| **EjercicioEquipamiento**           | ejercicio, equipamiento (§4.1)                                                                                                                                      | N:M. Un ejercicio requiere **todo** el equipamiento que declara. Un ejercicio sin filas requiere sólo `PESO_CORPORAL`                      |
| **EjercicioMusculo**                | ejercicio, grupo muscular (§4.2), participación ∈ {PRIMARIA, SECUNDARIA}                                                                                            | N:M. Sin filas, el ejercicio está **no clasificado**: no aporta volumen, y esa ausencia se distingue de aportar cero. Ver D10/CB-12        |
| **EjercicioArticulacion**           | ejercicio, articulación (§4.3)                                                                                                                                      | N:M. Articulaciones que el movimiento exige. **Sin esta tabla la contraindicación no es calculable**; era el hueco central del modelo v1.0 |
| **GrupoMuscular**, **Articulacion** | código, nombre, región                                                                                                                                              | Tablas de referencia pobladas con §4.2 y §4.3. Cerradas                                                                                    |

### 2.4 Prescripción

| Entidad                      | Atributos relevantes                                                                                                                                                                          |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PlantillaRutina**          | gimnasio, autor, nombre, tipo de rutina (§4.5), publicada, activa                                                                                                                             |
| **DiaPlantilla**             | plantilla, orden, nombre                                                                                                                                                                      |
| **EjercicioPlantilla**       | día de plantilla, ejercicio, orden, nota                                                                                                                                                      |
| **SeriePrescriptaPlantilla** | ejercicio de plantilla, orden, repeticiones mínimas, repeticiones máximas, carga sugerida, descanso, es de calentamiento                                                                      |
| **RutinaAsignada**           | alumno, plantilla de origen, tipo de rutina, frecuencia semanal objetivo, estado (D6/§1), origen ∈ {PLANTILLA_ENTRENADOR, PRESET_ELEGIDO_POR_ALUMNO, GENERADA}, solicitada por, solicitada en |
| **RevisionRutina**           | rutina, entrenador revisor, resultado ∈ {APROBADA, APROBADA_CON_CAMBIOS, RECHAZADA}, observación, instante                                                                                    |
| **VersionRutina**            | rutina, número, vigente, creada en, creada por, propuesta que la originó                                                                                                                      |
| **DiaRutina**                | versión de rutina, orden, nombre, patrón dominante                                                                                                                                            |
| **EjercicioRutina**          | día de rutina, ejercicio, orden, nota, **estado de compatibilidad** ∈ {COMPATIBLE, ADVERTIDO, INCOMPATIBLE, EJERCICIO_DESACTIVADO}, **motivo de la marca**                                    |
| **SeriePrescripta**          | ejercicio de rutina, orden, repeticiones mínimas, repeticiones máximas, carga sugerida, descanso, es de calentamiento                                                                         |

**`estado de compatibilidad` en `EjercicioRutina`.** RN-29, RN-92, RN-93 y RF-101 exigen "marcar el ejercicio en la rutina vigente sin retirarlo". En la v1.0 ninguna estructura lo soportaba. Es un atributo derivado que se recalcula en cada verificación de compatibilidad y se persiste para que la marca sobreviva a la consulta y pueda mostrarse al iniciar una sesión sin recalcular.

### 2.5 Ejecución

| Entidad                 | Atributos relevantes                                                                                                                                                                                                                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SesionEntrenamiento** | alumno, rutina, versión de rutina, día de rutina, estado (D6/§3), iniciada en, finalizada en, duración, **fecha de ocurrencia**, es diferida, es simulada, desbloqueada hasta                                                                                                                      |
| **RegistroSerie**       | sesión, orden, ejercicio prescripto, ejercicio ejecutado, repeticiones mínimas prescriptas, repeticiones máximas prescriptas, carga prescripta, es de calentamiento, carga ejecutada, repeticiones ejecutadas, esfuerzo percibido, completada, es adicional, motivo de omisión, atípico confirmado |
| **Comentario**          | autor, sesión _o_ rutina, texto, instante                                                                                                                                                                                                                                                          |

**`fecha de ocurrencia` separada de `iniciada en`.** Todos los indicadores usan la fecha de ocurrencia; la auditoría usa el instante de registro.

**`ejercicio prescripto` y `ejercicio ejecutado` en la misma fila.** Cuando no hay sustitución son el mismo. El volumen se imputa al ejecutado; el cumplimiento se evalúa contra el prescripto.

### 2.6 Adaptación e inteligencia

| Entidad                  | Atributos relevantes                                                                                                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **DiagnosticoEvolucion** | alumno, versión de rutina evaluada, período desde/hasta, situación global (§4.9), adherencia del período, calculado en, versión del componente, criterios no evaluados                 |
| **DiagnosticoEjercicio** | diagnóstico, ejercicio, situación (§4.9), variación de carga máxima estimada, cumplimiento de repeticiones, esfuerzo percibido medio, sesiones consideradas                            |
| **PropuestaAdaptacion**  | alumno, diagnóstico de origen, estado (D6/§4), creada en, resuelta en, resuelta por, versión resultante, versión del componente                                                        |
| **AjustePropuesto**      | propuesta, tipo (§4.10), ejercicio de rutina afectado _o_ alcance global, valor anterior, valor propuesto, criterio, datos que lo sustentan, estado ∈ {PENDIENTE, ACEPTADO, RECHAZADO} |
| **RecordPersonal**       | alumno, ejercicio, tipo (§4.8), valor, sesión que lo produjo, fecha, vigente                                                                                                           |
| **ScoreRiesgo**          | alumno, valor, nivel, factores principales, calculado en, versión del componente, contexto considerado, basado en datos simulados                                                      |
| **SegmentoPerfil**       | alumno, segmento, calculado en, versión del componente                                                                                                                                 |
| **EvaluacionComponente** | componente, versión, conjunto de datos, tamaño de la muestra, métricas obtenidas, métricas del criterio de referencia, ejecutada en                                                    |

### 2.7 Transversales

| Entidad               | Atributos relevantes                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| **Aviso**             | destinatario, tipo (§4.12), referencia, texto, instante, leído en, vencido                        |
| **RegistroAuditoria** | actor, operación, entidad afectada, identificador afectado, valor anterior, valor nuevo, instante |

## 3. Puntos difíciles del modelo

### PD-01 — Plantilla, rutina y versión

**Problema.** ¿Qué pasa si un entrenador modifica una plantilla ya usada por doce alumnos? ¿Y qué pasa cuando se aplica una adaptación a una rutina bajo la cual ya se ejecutaron sesiones?

| Alternativa                              | Descartada porque                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| La rutina referencia a la plantilla      | Modificar la plantilla reescribe el pasado de doce alumnos; la personalización individual es imposible |
| Versionado con diferencias y propagación | Exige resolución de conflictos. Coste desproporcionado                                                 |
| **Copia + versiones completas** ✅       | —                                                                                                      |

**Elegida:** copia profunda al solicitar la rutina (RF-022) más versiones completas de la rutina (RF-092).
**Qué se sacrifica.** Los cambios de plantilla no se propagan, y hay duplicación de datos. A esta escala la duplicación es irrelevante; la no propagación es deseable.
**Por qué versiones completas y no diferencias.** Una versión de rutina es una copia profunda de una estructura pequeña: no hay diferencias que calcular ni conflictos que resolver, y RF-093 se responde comparando dos versiones.

### PD-02 — La sesión es autocontenida

Cada sesión copia su prescripción al iniciarse, en sus propios registros de serie. Aunque la rutina cambie de versión mañana, la sesión de hoy conserva lo que estaba prescripto hoy `[F: RF-028]`.

- El pasado es inmune al versionado, sin lógica adicional.
- El cumplimiento (prescripto contra ejecutado) sale gratis, por serie.
- Un ejercicio desactivado después no rompe ninguna sesión anterior.

### PD-03 — Derivado o persistido

**Regla general:** se deriva todo lo que sea función pura de los datos crudos; se persiste sólo lo que es un evento con fecha, la salida fechada de un componente, o una marca que debe sobrevivir a la consulta.

| Dato                                                                 | Decisión                           | Motivo                                                                                                                                                                                                   |
| -------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Volumen, frecuencia, carga máxima estimada, adherencia, cumplimiento | **Derivado**                       | Si se persisten y cambia la definición, hay que recalcular todo el histórico                                                                                                                             |
| **Récord personal**                                                  | **Persistido**                     | Evento con fecha que debe notificarse en el momento. Recalcularlo pierde el instante                                                                                                                     |
| **Diagnóstico y propuesta**                                          | **Persistido**                     | Salidas fechadas de un componente con versión; deben poder auditarse                                                                                                                                     |
| **Estimación de riesgo y segmento**                                  | **Persistido**                     | Ídem `[F: RF-072]`                                                                                                                                                                                       |
| **Estado de compatibilidad de un ejercicio de rutina**               | **Persistido, derivado en origen** | Es el único derivado que se persiste. Se recalcula ante cada verificación (RN-45) y se guarda para que la marca esté disponible al iniciar una sesión y en la vista de rutina sin recalcular el conjunto |
| Peso corporal y perímetros                                           | **Persistido**                     | Son el dato crudo                                                                                                                                                                                        |

### PD-04 — Ámbito del catálogo

Un ejercicio con `gimnasio = null` pertenece al catálogo base y es visible para todos; uno con gimnasio informado sólo dentro de él. Reconcilia RF-013 con RF-069 sin duplicar la carga inicial.
**Qué se sacrifica.** Un entrenador no puede promover su ejercicio al catálogo base.

### PD-05 — Un solo entrenador vigente sobre una relación con historial

El modelo soporta el historial completo; RN-18 impone la unicidad. Sin el historial no se puede responder qué entrenador supervisó un período ni calcular la carga por entrenador.

### PD-06 — Borrado

**Ninguna entidad referenciada por información histórica se borra físicamente.** Ejercicios, usuarios, plantillas y rutinas se desactivan. La única eliminación real es la anonimización de datos personales en la baja de cuenta (RN-106), que reemplaza los identificadores personales y conserva los registros de entrenamiento desvinculados. Ver D10/CB-38.

### PD-07 — El equipamiento es del gimnasio, no del alumno

**Problema.** ¿Contra qué conjunto de equipamiento se valida una prescripción?

| Alternativa               | Consecuencia                                                                                                                                                                                                |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lo declara el alumno      | La falta de equipamiento sólo puede advertir, porque el alumno podría tener acceso circunstancial a algo que no declaró. La validación se vuelve blanda y el generador puede proponer ejercicios imposibles |
| Lo declara el gimnasio ✅ | La falta de equipamiento **impide**: si la máquina no está en el gimnasio, el ejercicio no se puede hacer. La validación se vuelve dura y verificable                                                       |
| Ambos, con intersección   | Duplica el mantenimiento y reintroduce la ambigüedad del primer caso                                                                                                                                        |

**Elegida:** el inventario del gimnasio es la única fuente. El alumno no declara equipamiento `[F: decisión del cliente, 2026-08-18]`.

**Qué se gana.** El catálogo prescribible queda determinado por gimnasio, la incompatibilidad por equipamiento pasa de advertencia a impedimento (RN-47), la incorporación del alumno pierde un paso, y el administrador adquiere una función con efecto real sobre la prescripción en lugar de un rol puramente administrativo.

**Qué se sacrifica.** Un alumno que además entrena en su casa no puede recibir una rutina que use su propio equipamiento. Es una limitación aceptada: el sistema prescribe para el gimnasio que lo mantiene.

**Consecuencia operativa que hay que asumir.** Si el administrador declara mal el inventario, todo el catálogo prescribible del gimnasio es incorrecto y ninguna rutina generada sirve. El inventario es un dato crítico, no una configuración cosmética.

### PD-08 — El alta es por invitación

**Problema.** El sistema no es abierto: un gimnasio afiliado avisa a la persona para que se registre. ¿Cómo queda vinculado un usuario a su gimnasio?

**Elegida:** la invitación es la única vía de alta. Un administrador —o un entrenador, para sus futuros alumnos— emite una invitación nominal a una dirección de correo, con los roles que se le otorgarán. La persona crea su cuenta desde esa invitación y queda vinculada al gimnasio emisor `[F: decisión del cliente, 2026-08-18]`.

**Qué resuelve.** No hay autorregistro sin gimnasio; la pertenencia al gimnasio no es un dato que el usuario elige; los roles quedan determinados por quien invita y no por quien se registra; y queda auditado quién incorporó a cada persona.

**Qué se sacrifica.** No hay crecimiento espontáneo de usuarios. Es exactamente lo que el modelo de negocio pide.

**Arranque.** El primer administrador de un gimnasio no puede invitarse a sí mismo: lo crea el aprovisionamiento (RF-115), junto con el gimnasio. Es una operación del proveedor del sistema, fuera de la aplicación y de todo rol.

## 4. Restricciones de integridad

| #      | Restricción                                                                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RI-01  | Un usuario pertenece a exactamente un gimnasio                                                                                                          |
| RI-02  | El correo es único dentro de un gimnasio                                                                                                                |
| RI-03  | Un usuario tiene al menos un rol                                                                                                                        |
| RI-04  | Un alumno tiene como máximo un objetivo con `hasta = null`                                                                                              |
| RI-05  | Un alumno tiene como máximo una asignación con `hasta = null`                                                                                           |
| RI-06  | Un alumno tiene como máximo una rutina en estado VIGENTE y como máximo una en estado PROPUESTA                                                          |
| RI-06b | Una rutina sólo alcanza VIGENTE si existe una revisión favorable de un entrenador con asignación vigente sobre ese alumno en el instante de la revisión |
| RI-07  | Una rutina tiene exactamente una versión marcada como vigente                                                                                           |
| RI-08  | Una medición corporal es única por (alumno, tipo, fecha)                                                                                                |
| RI-09  | Un alumno tiene como máximo una sesión en estado EN_CURSO                                                                                               |
| RI-10  | Un registro de serie es único por (sesión, orden)                                                                                                       |
| RI-11  | Un ejercicio del catálogo base tiene `gimnasio = null`; uno del gimnasio lo tiene informado                                                             |
| RI-12  | Toda serie prescripta pertenece a un ejercicio de rutina, que pertenece a un día, que pertenece a una versión                                           |
| RI-13  | El orden es único dentro de su nivel                                                                                                                    |
| RI-14  | Una propuesta pertenece a un único diagnóstico, y ambos al mismo alumno                                                                                 |
| RI-15  | Un ajuste pertenece a una única propuesta                                                                                                               |
| RI-16  | Toda sesión referencia la versión de rutina bajo la cual se ejecutó                                                                                     |
| RI-17  | `hasta` es posterior a `desde` en toda entidad con vigencia                                                                                             |
| RI-18  | Una sesión simulada sólo contiene registros de serie simulados                                                                                          |
| RI-19  | Una invitación pertenece a un gimnasio y produce como máximo un usuario                                                                                 |
| RI-20  | Todo usuario referencia la invitación que lo originó, salvo el primer administrador de cada gimnasio, que referencia el aprovisionamiento               |
| RI-21  | Un ejercicio tiene como máximo una participación PRIMARIA                                                                                               |
| RI-22  | Un récord personal vigente es único por (alumno, ejercicio, tipo)                                                                                       |
| RI-23  | Un gimnasio tiene al menos un usuario con rol ADMINISTRADOR en estado activo                                                                            |
