# D3 — Actores, roles y permisos

|                |            |
| -------------- | ---------- |
| **Versión**    | 2.1        |
| **Fecha**      | 2026-08-24 |
| **Estado**     | Normativo  |
| **Depende de** | D1, D2     |

**Cambios de la v1.0:** se agrega el proveedor del sistema como actor no aplicativo · filas de invitación, inventario, aviso, consentimiento y desbloqueo de sesión, que faltaban · se resuelve quién registra la aptitud · se elimina el equipamiento declarado por el alumno · referencia cruzada corregida (apuntaba a RN-58 en lugar de RN-106).

**Cambios de la v2.0:** el alumno gana escritura sobre el **candidato** de rutina —no sobre la rutina propuesta— dentro de las operaciones de D5/§5.2. Ver D11/DD-33.

---

## 1. Actores

### 1.0 Proveedor del sistema — actor no aplicativo

|                    |                                                                                                                |
| ------------------ | -------------------------------------------------------------------------------------------------------------- |
| **Qué hace**       | Aprovisiona un gimnasio afiliado: lo crea con su zona horaria y crea su primer administrador                   |
| **Dónde**          | **Fuera de la aplicación.** No es un rol, no inicia sesión, no aparece en ninguna pantalla                     |
| **Por qué existe** | Sin él ningún gimnasio puede arrancar: el alta es por invitación y nadie puede emitir la primera. Ver D4/PD-08 |

Se lo declara como actor porque ejecuta una operación indispensable. Modelarlo como rol de la aplicación reintroduciría el superadministrador multi-gimnasio, que está fuera de alcance.

### 1.1 Alumno

|                |                                                                                                                                                                                                                                                                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Objetivo**   | Entrenar con un plan que se mantenga adecuado a su estado, y saber si progresa                                                                                                                                                                                                                                                                         |
| **Consulta**   | Su rutina vigente y su rutina propuesta, su historial de sesiones, sus indicadores, sus mediciones, el catálogo, las propuestas de adaptación que le afectan y su estado de resolución, sus avisos                                                                                                                                                     |
| **Modifica**   | Su perfil, objetivo, condiciones físicas, aptitud, mediciones; sus sesiones dentro del plazo de corrección; comentarios propios. **Puede solicitar** una rutina eligiendo un preset o pidiendo una generada, y **moldear el candidato** antes de enviarlo a revisión, dentro de las operaciones de D5/§5.2; al confirmarlo se crea la rutina propuesta |
| **Nunca hace** | Poner en vigencia una rutina, resolver una propuesta de adaptación, modificar su rutina vigente **ni su rutina propuesta una vez confirmada**, fijar series, repeticiones, descansos o cargas, declarar equipamiento                                                                                                                                   |
| **Nunca ve**   | Su propia estimación de riesgo de abandono; información de otros alumnos                                                                                                                                                                                                                                                                               |

**Decisión:** el alumno no ve su propia estimación de riesgo. Mostrarle una probabilidad de que abandone es contraproducente y no admite justificación defendible. Sí ve sus indicadores objetivos de adherencia y cumplimiento `[F: RF-062]` · Ver D11/DD-17.

### 1.2 Entrenador

|                         |                                                                                                                                                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Objetivo**            | Que los alumnos de su cartera entrenen con la prescripción correcta, sin tener que revisarlos uno por uno                                                                                                       |
| **Función indelegable** | Es la puerta: **ninguna rutina rige para un alumno suyo sin su revisión**, cualquiera sea su origen                                                                                                             |
| **Consulta**            | Su cartera ordenada por urgencia, la ficha integral de cada alumno asignado, lo pendiente de su revisión, sus plantillas, el catálogo, sus indicadores agregados de cartera, sus avisos                         |
| **Modifica**            | Sus plantillas; las rutinas de sus alumnos asignados; su perfil profesional; comentarios; ejercicios propios del gimnasio. Resuelve propuestas. Emite invitaciones con rol ALUMNO. Desbloquea sesiones a pedido |
| **Nunca ve**            | Alumnos sin asignación vigente con él; información de otro gimnasio                                                                                                                                             |
| **Nunca hace**          | Modificar el inventario del gimnasio, registrar la aptitud de un alumno, otorgar roles distintos de ALUMNO                                                                                                      |

Un entrenador que quiera entrenar necesita **otro** entrenador asignado: no hay excepción a la puerta ni autoasignación (RN-22, RN-22a). Si es el único entrenador del gimnasio, no puede tener rutina vigente y el sistema lo señala al administrador. Ver D11/DD-28.

### 1.3 Administrador

|                                              |                                                                                                                                                                                     |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Objetivo**                                 | Que el gimnasio tenga las personas, los roles, las asignaciones y el **inventario** correctos, y entender la salud agregada del gimnasio                                            |
| **Función con efecto sobre la prescripción** | Mantiene el inventario de equipamiento, que determina el catálogo prescribible de todo el gimnasio. No es un rol administrativo puro                                                |
| **Consulta**                                 | Usuarios, roles e invitaciones de su gimnasio, asignaciones vigentes e históricas, inventario, panel analítico agregado, registro de auditoría, catálogo del gimnasio               |
| **Modifica**                                 | Invitaciones; roles; suspensión y reactivación de cuentas; asignaciones; inventario; estado de membresía; aptitud; curación del catálogo. Solicita el recálculo de las estimaciones |
| **Nunca ve**                                 | El detalle de sesiones, mediciones corporales ni condiciones físicas de un alumno individual. Ver §4                                                                                |

## 2. Matriz de permisos

**Convención:** `P` propio · `A` alumnos con asignación vigente · `G` todo el gimnasio · `—` sin acceso · `L` leer · `E` escribir

| Recurso / operación                              | Alumno                       | Entrenador                  | Administrador           |
| ------------------------------------------------ | ---------------------------- | --------------------------- | ----------------------- |
| **Invitación**                                   | —                            | `L/E` G, sólo rol ALUMNO    | `L/E` G                 |
| **Inventario del gimnasio**                      | `L`                          | `L`                         | `L/E` G                 |
| Consentimiento propio                            | `L/E` P                      | `L/E` P                     | `L/E` P                 |
| Perfil propio                                    | `L/E` P                      | `L/E` P                     | `L/E` P                 |
| Perfil de alumno (edad, nivel, días disponibles) | `L/E` P                      | `L` A                       | `L` G                   |
| Objetivo e historial de objetivos                | `L/E` P                      | `L` A                       | —                       |
| Condición física e historial                     | `L/E` P                      | `L` A                       | —                       |
| Aptitud                                          | `L/E` P                      | `L` A                       | `L/E` G                 |
| Medición corporal                                | `L/E` P                      | `L` A                       | —                       |
| Estado de membresía                              | `L` P                        | `L` A                       | `L/E` G                 |
| Catálogo base                                    | `L`                          | `L`                         | `L`                     |
| Catálogo del gimnasio                            | `L`                          | `L` + `E` propios           | `L` + curar G           |
| Plantilla                                        | `L` presets                  | `L` presets + `L/E` propias | `L` G                   |
| Rutina propuesta y rutina vigente                | `L` P                        | `L/E` A                     | —                       |
| **Candidato** de rutina, antes de confirmarse    | `L/E` P, acotado por D5/§5.2 | `L/E` A, sin acotar         | —                       |
| Versión histórica de rutina                      | `L` P                        | `L` A                       | —                       |
| **Solicitar** una rutina                         | `E` P                        | `E` A                       | —                       |
| **Poner en vigencia** una rutina                 | **—**                        | `E` A                       | —                       |
| Sesión y registros de serie                      | `L/E` P                      | `L` A                       | —                       |
| **Desbloquear** una sesión bloqueada             | **—**                        | `E` A                       | —                       |
| Indicadores individuales                         | `L` P                        | `L` A                       | —                       |
| Diagnóstico de evolución                         | `L` P                        | `L` A                       | —                       |
| Propuesta de adaptación: ver                     | `L` P                        | `L` A                       | —                       |
| Propuesta de adaptación: **resolver**            | **—**                        | `E` A                       | —                       |
| Historial de adaptaciones                        | `L` P                        | `L` A                       | —                       |
| Comentario sobre sesión o rutina                 | `L/E` P                      | `L/E` A                     | —                       |
| Pauta nutricional orientativa                    | `L` P                        | `L` A                       | —                       |
| **Aviso**                                        | `L/E` P                      | `L/E` P                     | `L/E` P                 |
| Estimación de riesgo de abandono                 | **—**                        | `L` A                       | `L` G (agregado)        |
| Segmentación de perfiles                         | —                            | `L` A                       | `L` G                   |
| Panel agregado de cartera                        | —                            | `L` P                       | `L` G                   |
| Panel analítico del gimnasio                     | —                            | —                           | `L` G                   |
| Gestión de usuarios y roles                      | —                            | —                           | `E` G                   |
| Gestión de asignaciones                          | —                            | —                           | `E` G                   |
| Registro de auditoría                            | —                            | —                           | `L` G                   |
| Solicitar recálculo de estimaciones              | —                            | —                           | `E` G                   |
| Exportar datos propios / solicitar baja          | `E` P                        | `E` P                       | `E` P                   |
| **Aprovisionar un gimnasio**                     | —                            | —                           | **—** (proveedor, §1.0) |

## 3. Reglas de acceso

**RA-01 — Doble filtro.** Toda operación se autoriza en dos pasos y en este orden: (1) ¿el rol admite esta operación?; (2) ¿este recurso concreto le pertenece o le está asignado? `[F: RF-005]`

**RA-02 — Alcance por gimnasio.** Ninguna operación devuelve información de un gimnasio distinto del de su actor. La única excepción es el catálogo base. `[F: RF-069, RF-100]`

**RA-03 — Vigencia de la asignación.** El acceso del entrenador existe si y sólo si hay asignación vigente en el instante de la consulta. `[F: RF-066]`

**RA-04 — Efecto inmediato del fin de la asignación.** Al finalizar, el acceso cesa en ese instante y las operaciones en curso no se completan. Ver D10/CB-31.

**RA-05 — Acumulación de roles.** Un actor con varios roles obtiene la unión de los permisos de cada uno, evaluados de forma independiente. No hay elevación: tener el rol de entrenador no otorga acceso a alumnos no asignados aunque el actor sea además administrador.

**RA-06 — El administrador no accede al detalle individual sensible.** Su acceso es de gestión y agregación. No lee sesiones, mediciones corporales ni condiciones físicas de un alumno concreto. Sí registra la aptitud, porque la constancia se presenta en el gimnasio y alguien tiene que cargarla, pero sólo su vigencia, no su contenido clínico. Ver D11/DD-22.

**RA-07 — El entrenador es la única puerta.** El facultado para poner una rutina en vigencia y para resolver una propuesta es **exclusivamente** el entrenador con asignación vigente. No hay aprobador alternativo: sin entrenador vigente, la rutina permanece propuesta y la propuesta permanece pendiente. `[F: RF-091 + decisión del cliente]` Ver D11/DD-25.

**RA-07b — Ningún origen exime de la revisión.** Plantilla del entrenador, preset elegido por el alumno o rutina generada: todas entran por la misma puerta.

**RA-08 — Datos propios siempre accesibles.** Ningún estado —membresía vencida, aptitud vencida, cuenta suspendida— priva a un usuario de leer y exportar sus propios datos.

**RA-09 — La invitación determina los roles.** Un usuario no puede otorgarse roles ni cambiar de gimnasio. Los roles del usuario creado son exactamente los de su invitación. `[F: RN-02c]`

**RA-10 — Un entrenador sólo invita alumnos.** Y el alumno resultante queda asignado a él. `[F: RN-02d]`

## 4. Evolución de los permisos cuando cambia una relación

| Evento                                          | Efecto inmediato                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Se emite una invitación                         | No otorga ningún acceso hasta usarse. Puede revocarse mientras no se haya usado                                                                                                                                                                                                                                                                 |
| Se crea una asignación                          | El entrenador gana lectura del alumno y escritura sobre sus rutinas. Lo pendiente de revisión pasa a corresponderle. `[F: RF-109]`                                                                                                                                                                                                              |
| Finaliza la asignación                          | El entrenador pierde todo acceso al alumno, **incluido el histórico que supervisó**. La rutina vigente permanece vigente y el alumno puede seguir entrenando; lo que se detiene es la aprobación de cambios. Lo pendiente queda BLOQUEADO y el sistema lo señala al administrador. Los avisos del saliente sobre ese alumno se cierran (RN-114) |
| Se reasigna a otro entrenador                   | Equivale a finalizar la anterior e iniciar la nueva en el mismo instante. No hay intervalo con dos entrenadores vigentes ni con ninguno. Todo lo pendiente pasa al entrante                                                                                                                                                                     |
| Un alumno pierde el rol de alumno               | Sus datos permanecen; deja de poder iniciar sesiones. Sus sesiones anteriores siguen contando para la analítica agregada                                                                                                                                                                                                                        |
| Un entrenador pierde el rol de entrenador       | Sus asignaciones vigentes finalizan en ese instante. Sus plantillas publicadas permanecen utilizables. Sus alumnos conservan su rutina vigente pero no pueden recibir ninguna rutina nueva ni ninguna adaptación hasta ser reasignados                                                                                                          |
| Un administrador pierde el rol de administrador | Se rechaza si es el último administrador activo del gimnasio (RN-03a)                                                                                                                                                                                                                                                                           |
| Se suspende una cuenta                          | No puede autenticarse. Sus datos y sus asignaciones permanecen: la suspensión es reversible y no destruye relaciones                                                                                                                                                                                                                            |
| Se da de baja una cuenta                        | Anonimización, no borrado. Ver D5/RN-106 y D10/CB-38                                                                                                                                                                                                                                                                                            |
| Cambia el inventario del gimnasio               | No altera permisos, pero recalcula el catálogo prescribible y dispara la reevaluación de las rutinas vigentes afectadas (RN-117)                                                                                                                                                                                                                |

**Sobre la pérdida de acceso al histórico.** Que el entrenador pierda el acceso a los datos de un alumno que sí supervisó es incómodo y correcto: el fundamento del acceso es la relación vigente, no el mérito histórico. La consecuencia asumida es que el indicador de carga por entrenador del panel del gimnasio se calcula sobre información agregada y no requiere que el entrenador conserve visibilidad individual. Ver D11/DD-23.
