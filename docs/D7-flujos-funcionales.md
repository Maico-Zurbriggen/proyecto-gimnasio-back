# D7 — Flujos funcionales

|                |                    |
| -------------- | ------------------ |
| **Versión**    | 2.1                |
| **Fecha**      | 2026-08-24         |
| **Estado**     | Normativo          |
| **Depende de** | D2, D3, D4, D5, D6 |

**Cambios de la v1.0:** flujos nuevos FL-00 (aprovisionamiento), FL-19 (invitación), FL-20 (inventario), FL-21 (paneles agregados) · FL-01 rehecho: el alta es por invitación y el alumno ya no declara equipamiento · FL-08 corregido: la contradicción entre RN-51, RN-59 y el registro diferido bajo rutina archivada · FL-09 y FL-10 remiten a los criterios de D5/§9.1 y §9.2, que en la v1.0 no existían.

**Cambios de la v2.0:** FL-04 gana el **candidato de rutina** —el solicitante moldea la rutina generada antes de enviarla a revisión, a mano, pidiendo alternativas o volviendo al lenguaje natural (pasos 6 a 8, A3 a A7)— y FL-03 lo hereda. Ver D5/RN-124 a RN-129, D5/§5.2 y D11/DD-33.

Los cursos alternativos y de excepción no son un apéndice: son la mayor parte del trabajo.

---

## FL-00 · Aprovisionamiento de un gimnasio afiliado

|                     |                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------- |
| **Actor**           | Proveedor del sistema, fuera de la aplicación                                            |
| **Precondiciones**  | Afiliación acordada fuera del sistema                                                    |
| **Postcondiciones** | Gimnasio creado con su zona horaria, y un usuario con rol ADMINISTRADOR en estado activo |
| **Reglas**          | RN-02e, RN-03a, RI-23                                                                    |

**Curso normal.** Se crea el gimnasio con su nombre y zona horaria, y su primer administrador con una invitación de arranque que el propio aprovisionamiento marca como emitida. La persona completa su registro por FL-19.

**Excepción.** E1: un gimnasio queda creado sin administrador → estado inconsistente que el sistema debe impedir; la operación es atómica o no ocurre. E2: la dirección de correo del primer administrador ya pertenece a otro gimnasio → se admite: la unicidad del correo es por gimnasio (RN-02).

**Por qué está fuera de la aplicación.** El alta es por invitación y nadie dentro de un gimnasio nuevo puede emitir la primera. Modelarlo como funcionalidad exigiría un rol superadministrador multi-gimnasio, que está fuera de alcance. Ver D4/PD-08.

---

## FL-19 · Invitación y alta de un usuario

|                     |                                                                              |
| ------------------- | ---------------------------------------------------------------------------- |
| **Actor**           | Administrador o entrenador · Persona invitada                                |
| **Precondiciones**  | El emisor pertenece al gimnasio y tiene el rol que lo habilita               |
| **Postcondiciones** | Usuario activo, vinculado al gimnasio emisor, con los roles de la invitación |
| **Reglas**          | RN-02a a RN-02d, RN-104, RA-09, RA-10                                        |

**Curso normal**

1. El emisor indica la dirección de correo y los roles a otorgar. Un entrenador sólo puede indicar ALUMNO.
2. El sistema crea la invitación en estado VIGENTE y la envía.
3. La persona la abre, define su contraseña y su nombre, y otorga el **consentimiento explícito y separado** para el tratamiento de datos de salud.
4. El usuario queda activo, vinculado a ese gimnasio, con exactamente los roles de la invitación. Si el emisor fue un entrenador, la asignación con él queda establecida.
5. Si tiene rol ALUMNO, continúa por FL-01.

**Cursos alternativos**

|                                               |                                                                                                                                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A1 · El emisor revoca antes de que se use     | La invitación pasa a REVOCADA y el enlace deja de funcionar                                                                                                                                |
| A2 · La persona no otorga el consentimiento   | La cuenta se crea. No puede declarar condiciones ni mediciones y, por lo tanto, no alcanza contexto suficiente: no se le genera rutina. El sistema explica exactamente qué falta y por qué |
| A3 · El administrador invita con varios roles | Admitido. Los roles se otorgan juntos (RA-09)                                                                                                                                              |

**Cursos de excepción**

|                                                 |                                                                                               |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| E1 · La invitación caducó                       | Se informa y se ofrece solicitar una nueva al gimnasio. No se permite crear la cuenta         |
| E2 · Se intenta usar dos veces                  | Rechazo: es de un solo uso (RI-19)                                                            |
| E3 · El correo ya tiene cuenta en ese gimnasio  | Rechazo con mensaje genérico, sin revelar si el correo existe                                 |
| E4 · El correo ya tiene cuenta en otro gimnasio | Se admite: son cuentas distintas (RN-02, DD-24). El ingreso resuelve a qué cuenta corresponde |

---

## FL-01 · Puesta en contexto del alumno

|                     |                                                                  |
| ------------------- | ---------------------------------------------------------------- |
| **Actor**           | Alumno · Sistema · Administrador (asignación)                    |
| **Precondiciones**  | Usuario creado por FL-19 con rol ALUMNO                          |
| **Postcondiciones** | Contexto suficiente y una rutina en estado PROPUESTA o BLOQUEADA |
| **Reglas**          | RN-09, RN-97b, RN-21, RF-111                                     |

**Curso normal**

1. El alumno declara su **contexto**: nivel de experiencia, objetivo y días semanales disponibles.
2. Declara sus condiciones físicas, cada una con su **zona corporal** y su **severidad**, o declara expresamente no tener ninguna.
3. Opcionalmente registra su peso actual y su aptitud.
4. El sistema comprueba contexto suficiente y genera una rutina completa sobre el **catálogo prescribible del gimnasio** (FL-04).
5. La rutina queda PROPUESTA y se avisa a su entrenador. La generación del alta **no produce candidato ajustable**: el alumno todavía no solicitó nada que moldear (RN-124). Si quiere intervenir sobre su rutina, la solicita por FL-03.

**El alumno no declara equipamiento:** el disponible es el inventario de su gimnasio (D4/PD-07).

**Cursos alternativos**

|                                                |                                                                                                                                                             |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1 · Declara no tener ninguna condición física | Es una declaración positiva, distinta de no haber contestado. Cuenta para el contexto suficiente                                                            |
| A2 · No tiene entrenador asignado              | La rutina se genera igual y queda BLOQUEADA. El sistema lo señala al administrador (RN-21) y al alumno le informa que espera la asignación de un entrenador |
| A3 · Fue invitado por un entrenador            | Ya tiene asignación desde FL-19/paso 4; la rutina queda PROPUESTA directamente                                                                              |

**Cursos de excepción**

|                                                                      |                                                                                                                                                                         |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1 · Contexto insuficiente                                           | No se genera rutina. Se declara exactamente qué falta (RN-97b). Ver CB-10                                                                                               |
| E2 · La generación no produce salida válida                          | Ver CB-20: la tarea pasa al entrenador; nunca se presenta una rutina inválida                                                                                           |
| E3 · El catálogo prescribible no permite cubrir los patrones mínimos | Ver CB-22 y RN-118: se genera la rutina posible y se declara qué patrones quedaron sin cubrir, señalándolo también al administrador porque es un problema de inventario |

---

## FL-02 · Revisión de una rutina y puesta en vigencia ⭐

Es la puerta del sistema. Todo lo que llega al alumno pasa por acá.

|                     |                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| **Actor**           | Entrenador                                                                                     |
| **Precondiciones**  | Rutina PROPUESTA de un alumno con asignación vigente                                           |
| **Postcondiciones** | Rutina VIGENTE o RECHAZADA; en el primer caso la anterior queda ARCHIVADA y se avisa al alumno |
| **Reglas**          | RN-35, RN-36, RN-40, D5/§6, RN-108                                                             |

**Curso normal**

1. El entrenador abre la rutina propuesta desde su cartera y ve, junto a la estructura: el origen de la rutina, el contexto del alumno con el que se construyó, el estado de compatibilidad de cada ejercicio, y **qué difiere de la salida original del componente o de la plantilla de origen** (RN-129, RF-120).
2. Revisa día por día. Puede modificar cualquier ejercicio, serie, repetición, carga o descanso antes de aprobar.
3. Aprueba. El sistema revalida compatibilidad y rangos de RN-39a sobre la versión final.
4. La rutina pasa a VIGENTE con su versión 1, la anterior queda ARCHIVADA, se registra la revisión en auditoría y se avisa al alumno.

**Cursos alternativos**

|                                                   |                                                                                                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| A1 · Aprueba con cambios                          | Idéntico. La revisión registra que hubo modificación y cuál                                                                                |
| A2 · Rechaza                                      | La rutina pasa a RECHAZADA con motivo. Se avisa al alumno, que puede solicitar otra. Su rutina vigente anterior, si existía, sigue vigente |
| A3 · El tipo de rutina no corresponde al objetivo | Advertencia y confirmación obligatoria (RN-40). No se impide                                                                               |
| A4 · Falta la aptitud o está vencida              | Advertencia destacada. No impide aprobar (RN-13)                                                                                           |
| A5 · Hay ejercicios ADVERTIDOS por condición leve | Se señalan. No impiden                                                                                                                     |

**Cursos de excepción**

|                                                                    |                                                                                                                                        |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| E1 · Hay un ejercicio INCOMPATIBLE                                 | La aprobación se impide. El sistema ofrece las alternativas admisibles de RN-49a. El entrenador sustituye o retira, y vuelve al paso 3 |
| E2 · No hay alternativa admisible                                  | Ver CB-21 y RN-49: se declara explícitamente; el entrenador retira el ejercicio o deja la rutina propuesta                             |
| E3 · La asignación termina mientras revisa                         | Ver CB-31: la confirmación se rechaza; la rutina queda BLOQUEADA                                                                       |
| E4 · Un ejercicio fue desactivado entre la propuesta y la revisión | Ver CB-13: se marca y se propone sustituto                                                                                             |
| E5 · El inventario cambió entre la propuesta y la revisión         | Los ejercicios afectados pasan a INCOMPATIBLE y se aplica E1                                                                           |

---

## FL-03 · Solicitud de rutina por el alumno

|                     |                                                       |
| ------------------- | ----------------------------------------------------- |
| **Actor**           | Alumno                                                |
| **Precondiciones**  | Contexto suficiente                                   |
| **Postcondiciones** | Una rutina en estado PROPUESTA                        |
| **Reglas**          | RN-35, RN-36, RN-36a, RN-124 a RN-129, D5/§5.2, D5/§6 |

**Curso normal.** El alumno elige un preset del gimnasio o solicita una rutina generada. El sistema copia o genera la estructura sobre el catálogo prescribible, verifica compatibilidad y la presenta como **candidato** (RN-124). El alumno lo ajusta si quiere, dentro de D5/§5.2, y confirma: recién entonces la rutina queda PROPUESTA y se avisa a su entrenador.

**Alternativos.** A1: ya tiene una rutina propuesta → se le informa **al confirmar** y, si continúa, la anterior pasa a DESCARTADA (RN-36a). A2: no tiene entrenador vigente → queda BLOQUEADA (RN-23). A3: abandona el candidato sin confirmar → no queda rutina ni aviso, y su propuesta anterior sigue intacta (RN-124, CB-73).

**Excepción.** E1: el preset elegido contiene ejercicios incompatibles → se le informa cuáles y por qué, y se le ofrecen presets compatibles. No se propone algo que se sabe que será rechazado.

---

## FL-04 · Generación asistida de rutina

|                     |                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------- |
| **Actor**           | Entrenador · Alumno · Sistema                                                               |
| **Precondiciones**  | Contexto suficiente                                                                         |
| **Postcondiciones** | Rutina PROPUESTA con justificación asociada, o ningún efecto si el candidato no se confirma |
| **Reglas**          | RN-39a, RN-95, RN-95b, RN-96, RN-97, RN-97b, RN-98, RN-99, RN-124 a RN-129, D5/§5.2         |

**Curso normal**

1. El solicitante describe la necesidad en lenguaje natural, o completa el formulario estructurado equivalente.
2. Si la entrada fue en lenguaje natural, el sistema la traduce a parámetros estructurados —objetivo, frecuencia semanal, restricciones y duración de sesión— y **los presenta para confirmación antes de usarlos**. El equipamiento no es un parámetro: sale del inventario.
3. El componente de decisión construye la rutina a partir de esos parámetros y del contexto completo, usando exclusivamente el catálogo prescribible.
4. El sistema valida la salida contra RN-39a (estructura de días, series, repeticiones, descansos, cobertura mínima de patrones) y contra D5/§6.
5. Se produce la justificación en lenguaje natural de los criterios aplicados.
6. La rutina se presenta como **candidato**: la estructura completa, día por día, con el estado de compatibilidad de cada ejercicio y la justificación al lado. Todavía no existe como rutina y nadie fue avisado (RN-124).
7. El solicitante ajusta el candidato si quiere, por cualquiera de las tres vías de A3, A4 y A5. Cada ajuste revalida en el acto contra RN-39a y D5/§6 (RN-126).
8. Confirma. La rutina queda PROPUESTA, se registra qué difiere de la salida original del componente y se avisa a su entrenador (RN-129).

**Por qué existe el paso 7.** Si el alumno no puede moldear lo que pidió, que la solicite él o que se la genere el sistema por su cuenta son la misma funcionalidad. El paso 7 es lo que hace que la solicitud sea suya — y está acotado por D5/§5.2 para que moldear no se convierta en prescribir. Ver D11/DD-33.

**Cursos alternativos**

|                                                           |                                                                                                                                                                                                                         |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1 · Servicio externo no disponible                       | El paso 1 se hace por formulario y el paso 5 se presenta tabulado. La rutina se construye igual. No se muestra error (RN-99)                                                                                            |
| A2 · La interpretación del lenguaje natural es incorrecta | El solicitante corrige los parámetros en el paso 2. Por eso el paso 2 existe                                                                                                                                            |
| A3 · Ajusta el candidato **a mano**                       | Sustituye, agrega, quita o reordena ejercicios dentro de lo que admite D5/§5.2, sin volver a llamar al componente. No consume el tope de RN-127 ni cambia el origen de la rutina                                        |
| A4 · Pide **alternativas** para un ejercicio puntual      | El sistema ofrece las admisibles del mismo patrón dominante, del catálogo prescribible y compatibles con el alumno, ordenadas por el componente (RN-49a, RF-059). El solicitante elige de esa lista; no escribe valores |
| A5 · Vuelve a **describirla en lenguaje natural**         | Regenera desde el paso 2, con los parámetros corregidos y las preferencias ya declaradas como entrada (RN-128). Consume el tope de RN-127                                                                               |
| A6 · Abandona el candidato sin confirmar                  | No queda rutina, no se avisa a nadie y la propuesta anterior, si existía, sigue intacta: RN-36a se aplica al confirmar, no al generar. Ver CB-73                                                                        |
| A7 · El solicitante es el entrenador                      | El ajuste del paso 7 no tiene las restricciones de D5/§5.2, porque ya tiene escritura sobre la rutina. Al confirmar, la rutina entra en FL-02 con él mismo como revisor                                                 |

**Cursos de excepción**

|                                                                                |                                                                                                                                                                       |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1 · La salida no supera la validación                                         | Un reintento; si vuelve a fallar, construcción determinística. Nunca se presenta una propuesta inválida (RN-95b)                                                      |
| E2 · Contexto insuficiente                                                     | No se genera. Se declara qué falta (RN-97b)                                                                                                                           |
| E3 · El catálogo prescribible no cubre los patrones mínimos de RN-39a          | Se genera la rutina posible, se declara qué patrones faltan y se avisa al administrador (RN-118)                                                                      |
| E4 · Un ajuste del paso 7 deja el candidato inválido                           | Se rechaza ese ajuste enunciando el rango o el mínimo incumplido, y el candidato queda como estaba. Un candidato inválido no se confirma nunca (RN-126)               |
| E5 · Agota el tope de regeneraciones sin quedar conforme                       | Ver CB-72: confirma el último candidato, o deriva la construcción a su entrenador adjuntando como comentario lo que no lo convence. No se le muestra un error (RN-99) |
| E6 · El inventario o una condición del alumno cambian con el candidato abierto | Los ejercicios afectados se remarcan en la revalidación del paso 7. Un candidato con un ejercicio INCOMPATIBLE no se confirma hasta sustituirlo o quitarlo            |

---

## FL-05 · Ejecución de una sesión ⭐

|                      |                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------- |
| **Actor**            | Alumno                                                                                 |
| **Precondiciones**   | Rutina VIGENTE; ninguna sesión EN_CURSO                                                |
| **Datos de entrada** | Día elegido; por serie: carga, repeticiones, esfuerzo percibido (opcional), completada |
| **Postcondiciones**  | Sesión COMPLETADA con sus registros; récords detectados; indicadores recalculables     |
| **Reglas**           | RN-50 a RN-61, RN-70, RN-13, RN-93                                                     |

**Curso normal**

1. El sistema propone el siguiente día del ciclo según el historial. El alumno confirma o elige otro.
2. Si la aptitud está ausente o vencida, se advierte de forma destacada. La sesión se inicia igual.
3. Si algún ejercicio del día está marcado INCOMPATIBLE, ADVERTIDO o EJERCICIO_DESACTIVADO, se advierte (RN-93).
4. La sesión pasa a EN_CURSO y **congela la prescripción del día**.
5. Cada serie se presenta precargada con los valores óptimos predichos para ese ejercicio en esa sesión.
6. El alumno confirma o corrige carga y repeticiones, y opcionalmente el esfuerzo percibido.
7. Finaliza. La sesión pasa a COMPLETADA, se sella la duración, se detectan récords y se avisan.

**Cursos alternativos**

|                                           |                                                                                                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1 · Agrega series adicionales            | Se registran marcadas como adicionales. Cuentan para volumen, no para cumplimiento                                                                                              |
| A2 · Omite una serie prescripta           | Se marca no completada, con motivo opcional. No cuenta para volumen ni como cumplida                                                                                            |
| A3 · Sustituye un ejercicio               | FL-06                                                                                                                                                                           |
| A4 · Primera vez que ejecuta un ejercicio | Se precarga la carga sugerida de la prescripción, o el campo queda vacío o predice en base a un peso lógico para un principiante en ese ejercicio en particular. **Nunca cero** |
| A5 · Carga un valor atípico               | RN-55a: se marca y se pide confirmación. Confirmado, se registra con normalidad                                                                                                 |

**Cursos de excepción**

|                                                   |                                                                              |
| ------------------------------------------------- | ---------------------------------------------------------------------------- |
| E1 · Pérdida de conexión                          | El estado parcial se conserva localmente y se reintenta. Ver CB-24           |
| E2 · Cierra la aplicación                         | La sesión sigue EN_CURSO y se retoma (FL-07)                                 |
| E3 · Envía dos veces la misma serie               | Un único registro (RN-60)                                                    |
| E4 · Valor fuera de rango                         | Rechazo del lado del sistema con el rango en el mensaje (RN-55)              |
| E5 · Pasan 8 horas sin actividad                  | Se cierra como ABANDONADA conservando lo registrado (RN-53)                  |
| E6 · Su rutina cambia de versión mientras entrena | La sesión continúa contra la versión con la que se inició (RN-52). Ver CB-14 |

---

## FL-06 · Sustitución de un ejercicio durante la sesión

|           |                                                                                |
| --------- | ------------------------------------------------------------------------------ |
| **Actor** | Alumno · **Precondiciones** Sesión EN_CURSO · **Reglas** RN-56, RN-102, RN-49a |

**Curso normal.** El alumno indica que no puede hacer un ejercicio. El sistema propone hasta cinco alternativas admisibles (RN-49a), excluidas las contraindicadas y las que exigen equipamiento ausente del inventario. Elige una; las series restantes se registran contra el ejercicio ejecutado, marcadas como sustituidas, y cuentan como cumplidas.

**Alternativos.** A1: elige un ejercicio del catálogo prescribible por su cuenta → se admite y se registra igual. A2: declara el motivo → se conserva y alimenta el diagnóstico.

**Excepción.** E1: no hay alternativa admisible → CB-21; se ofrece omitir el ejercicio con motivo y se señala al entrenador. E2: el motivo declarado es una molestia física → el sistema **sugiere** al alumno declararla como condición física con su zona y severidad, y no la registra por su cuenta. Ver CB-23.

---

## FL-07 · Reanudación de una sesión interrumpida

**Curso normal.** Al volver, si existe una sesión EN_CURSO, el sistema la ofrece en el punto exacto en que quedó, con las series ya registradas conservadas.

**Alternativos.** A1: el alumno prefiere descartarla → se cierra como ABANDONADA, conservando lo registrado; no se borra. A2: intenta iniciar una sesión nueva → se le presenta primero la pendiente (RN-50).

**Excepción.** E1: pasaron más de 8 horas → ya está ABANDONADA; se le ofrece registrar una sesión diferida (FL-08).

---

## FL-08 · Registro diferido, corrección y desbloqueo

|           |                                                                           |
| --------- | ------------------------------------------------------------------------- |
| **Actor** | Alumno · Entrenador (desbloqueo) · **Reglas** RN-58, RN-58a, RN-59, RN-71 |

**Curso normal.** El alumno registra una sesión indicando la fecha en que ocurrió y completando sus series. La sesión nace COMPLETADA, marcada como diferida, **imputada a la rutina y a la versión que estaban vigentes en esa fecha** — que pueden estar archivadas hoy. La restricción de RN-51 rige sólo para las sesiones iniciadas en tiempo real.

**Alternativos.** A1: corrige una sesión COMPLETADA dentro de las 48 h → se admite, se audita, y los récords afectados se recalculan sobre el histórico completo (RN-71). A2: pide corregir una sesión BLOQUEADA → su entrenador la desbloquea por 24 h, una sola vez, dejando el motivo en auditoría (RN-58a).

**Excepción.** E1: fecha futura, o anterior a 90 días → rechazo indicando el rango (RN-59). E2: en esa fecha el alumno no tenía ninguna rutina vigente → se rechaza y se explica; el sistema no inventa una rutina de referencia. E3: la sesión ya fue desbloqueada una vez → rechazo; el plazo de corrección dejaría de existir si el desbloqueo fuera repetible. E4: el alumno no tiene entrenador vigente que pueda desbloquear → la solicitud queda pendiente y se señala al administrador.

---

## FL-09 · Diagnóstico periódico de evolución

|                     |                                                                     |
| ------------------- | ------------------------------------------------------------------- |
| **Actor**           | Sistema · Entrenador (a demanda)                                    |
| **Precondiciones**  | Alumno con rutina VIGENTE                                           |
| **Postcondiciones** | Diagnóstico registrado; propuesta generada si corresponde           |
| **Reglas**          | **D5/§9.1** (criterios) y **§9.2** (ajustes) · RN-78 a RN-85, RN-98 |

**Curso normal.** Cada dos semanas el sistema evalúa cada ejercicio de la rutina vigente y le asigna una situación según la tabla de precedencia de RN-79a, y determina la situación global. Si corresponde, produce una propuesta aplicando las reglas de ajuste de RN-89a, con un ajuste fundamentado por cada problema detectado. La propuesta se valida contra D5/§6 y se avisa al entrenador.

**Alternativos.** A1: situación global `PROGRESION_ADECUADA` y ningún ejercicio con ajuste → se registra el diagnóstico y no se genera propuesta. Un diagnóstico sin propuesta es un resultado, no un fallo (RN-89a/restricción 4). A2: el entrenador lo solicita antes de tiempo → se ejecuta sobre los datos disponibles.

**Excepción.** E1: `DATOS_INSUFICIENTES` → diagnóstico registrado sin propuesta (RN-82), declarando qué faltó. E2: el esfuerzo percibido no fue registrado → se diagnostica sin ese criterio y se declara (RN-81). E3: el proceso nunca se ejecutó → CB-35: no hay diagnósticos y la información se presenta como no disponible. E4: un ajuste de sustitución no encuentra alternativa admisible → ese ajuste no se propone y el hecho se declara en la propuesta (RN-49).

---

## FL-10 · Resolución de una propuesta de adaptación ⭐

|                     |                                                                             |
| ------------------- | --------------------------------------------------------------------------- |
| **Actor**           | Entrenador                                                                  |
| **Precondiciones**  | Propuesta PENDIENTE de un alumno con asignación vigente                     |
| **Postcondiciones** | Propuesta resuelta; si fue aceptada, nueva versión vigente y alumno avisado |
| **Reglas**          | RN-35a, RN-86 a RN-92, RN-108                                               |

**Curso normal.** El entrenador ve cada ajuste con su criterio y los datos que lo sustentan, junto a la evolución del alumno en el período. Acepta la propuesta. El sistema genera una versión nueva, conserva la anterior, no altera ninguna sesión ejecutada, y avisa al alumno. **No se pide una segunda revisión: la resolución es la revisión** (RN-35a).

**Alternativos.** A1: acepta algunos ajustes y rechaza otros → se genera la versión con los aceptados. A2: rechaza todo → no se genera versión; se registra el motivo, que es información valiosa sobre la calidad del diagnóstico. A3: prefiere modificar la rutina por su cuenta → FL-11.

**Excepción.** E1: el contexto del alumno cambió y la propuesta dejó de ser compatible → pasa a INVALIDADA y se genera una nueva (CB-16). E2: caduca a los 30 días → CADUCADA registrada (RN-87). E3: la asignación termina mientras la evalúa → CB-31.

---

## FL-11 · Intervención directa del entrenador sobre la rutina

**Curso normal.** El entrenador modifica ejercicios, series, repeticiones, cargas o descansos de la rutina vigente de un alumno asignado. El sistema verifica compatibilidad y rangos de RN-39a, genera una versión nueva, registra autor e instante, y avisa al alumno.

**Reglas.** RN-45, RN-46, RN-88, RN-89, RN-108. Las sesiones ya ejecutadas no cambian.

**Excepción.** E1: la modificación introduce una incompatibilidad → se impide y se ofrecen alternativas (RN-46). E2: la modificación deja la rutina fuera de los rangos de su tipo → se advierte y se exige confirmación; el entrenador puede apartarse de la referencia, el componente automático no. E3: hay una sesión EN_CURSO → la versión se crea igual; la sesión conserva su prescripción congelada (CB-14).

---

## FL-12 · Reevaluación por cambio de contexto

|                |                                                                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Disparador** | Cambio de objetivo, alta o cierre de una condición física, cambio de estado de la aptitud, **o cambio del inventario del gimnasio** |
| **Reglas**     | RN-91, RN-92, RN-93, RN-11, RN-117                                                                                                  |

**Curso normal.** El sistema reevalúa la compatibilidad de la rutina vigente. Si aparece una incompatibilidad, marca los ejercicios afectados **sin retirarlos**, avisa al entrenador y al alumno, y genera la propuesta correspondiente.

**Alternativos.** A1: no aparece incompatibilidad → se registra la reevaluación y no ocurre nada más. A2: la condición se cierra → los ejercicios dejan de estar marcados desde esa fecha, sin efecto retroactivo (RN-11). A3: cambia el objetivo → se propone el cambio de tipo de rutina con el reajuste de esquemas de RN-89a. A4: el administrador retira equipamiento del inventario → todos los alumnos del gimnasio con ese ejercicio en su rutina reciben la marca y la propuesta (RN-117).

**Excepción.** E1: la condición nueva invalida la mayor parte de la rutina → la propuesta puede implicar una rutina sustancialmente nueva. E2: no hay entrenador vigente → la propuesta queda BLOQUEADA y el alumno sigue recibiendo la advertencia en cada sesión (CB-32).

---

## FL-13 · Consulta de la cartera priorizada

**Curso normal.** El entrenador ve sus alumnos con asignación vigente, ordenados según el criterio único de urgencia (RF-107): primero los que tienen una rutina propuesta o una propuesta de adaptación pendientes de su revisión; luego riesgo de abandono alto; luego incompatibilidad sobrevenida sin resolver; luego estancamiento; luego caída de adherencia; luego sin señal. Cada fila muestra fecha de la última sesión, adherencia de cuatro semanas y señales detectadas.

**Alternativos.** A1: filtra por señal. A2: un alumno sin datos suficientes → aparece con "sin datos suficientes", nunca con cero.

**Excepción.** E1: la estimación de riesgo nunca se calculó → la columna dice "no disponible" y el orden se resuelve con los criterios restantes (RN-100). E2: cartera vacía → estado explicativo, no una tabla vacía.

---

## FL-14 · Registro de mediciones corporales

**Curso normal.** El alumno registra un valor fechado de peso o de un perímetro. El sistema lo suma a su serie temporal y presenta la evolución con media móvil de 7 días.

**Reglas.** RN-15, RN-16, RN-17.

**Alternativos.** A1: corrige o elimina un registro → admitido, auditado. A2: carga un segundo valor del mismo tipo y fecha → sustituye al anterior.

**Excepción.** E1: menos de dos registros → no se dibuja tendencia; se declara que hacen falta más datos. E2: valor fuera de rango → rechazo con el rango admitido.

---

## FL-15 · Gestión de asignaciones

|           |                                                                 |
| --------- | --------------------------------------------------------------- |
| **Actor** | Administrador · **Reglas** RN-18 a RN-23, RA-04, RN-108, RN-114 |

**Curso normal.** El administrador asigna un entrenador a un alumno. Si había otro, se finaliza en el mismo instante. Todo lo pendiente pasa al entrante y los avisos del saliente sobre ese alumno se cierran. El acceso del saliente cesa en ese instante.

**Alternativos.** A1: finaliza una asignación sin reemplazo → el alumno queda señalado como sin entrenador; su rutina vigente permanece; sus pendientes quedan BLOQUEADOS.

**Excepción.** E1: el destino no tiene rol de entrenador → rechazo. E2: el destino es el mismo alumno → rechazo (RN-22). E3: operaciones del saliente en curso → se rechazan al confirmarse (CB-31).

---

## FL-16 · Estimación de riesgo de abandono

|           |                                                                                                                   |
| --------- | ----------------------------------------------------------------------------------------------------------------- |
| **Actor** | Sistema (proceso diferido semanal) · Administrador (a demanda) · **Reglas** RN-100, RN-101, RN-98, RN-103, RN-107 |

**Curso normal.** El proceso calcula, para cada alumno con datos suficientes, una estimación con sus factores principales, y la registra con la versión del componente, el contexto y el instante. Entrenadores y administradores la ven; el alumno evaluado nunca.

**Excepción.** E1: nunca se ejecutó → toda la información de riesgo se presenta como no disponible y nada más se degrada. E2: historial insuficiente → no se calcula; se distingue de riesgo bajo. E3: los datos son simulados → la estimación se marca como tal y se excluye de toda presentación como real (RN-107).

---

## FL-17 · Carga y curación del catálogo

**Carga inicial (sistema).** Un proceso repetible incorpora el catálogo base desde la fuente externa con su clasificación muscular, sus articulaciones exigidas, su equipamiento requerido y sus recursos visuales, y **declara qué ejercicios quedaron sin clasificación muscular**. Ejecutarlo dos veces no duplica registros.

**Curación (administrador).** Revisa los ejercicios propuestos por entrenadores, los aprueba o rechaza, y desactiva ejercicios del catálogo del gimnasio. Completa a mano la clasificación de los ejercicios no clasificados de mayor uso (RF-099).

**Excepción.** E1: la fuente cambió de estructura o no responde → la carga falla de forma completa y verificable, sin dejar un catálogo a medias. E2: un ejercicio llega sin clasificación muscular → se incorpora marcado como no clasificado, no aporta volumen y no se presenta como cero (RN-30). E3: se desactiva un ejercicio presente en rutinas vigentes → RN-29 y CB-13.

---

## FL-18 · Baja de cuenta y exportación

**Curso normal.** El usuario solicita una copia estructurada de sus datos y de su historial, o la baja de su cuenta. La baja anonimiza sus datos personales dentro de 7 días, conservando sesiones y series desvinculadas.

**Reglas.** RN-08, RN-106, RN-03a.

**Excepción.** E1: tiene una sesión EN_CURSO → se cierra como ABANDONADA antes de procesar la baja. E2: es el único administrador activo → rechazo hasta que exista otro (RI-23, CB-39). E3: es entrenador con asignaciones vigentes → todas se finalizan y sus alumnos quedan señalados al administrador.

---

## FL-20 · Mantenimiento del inventario del gimnasio

|                     |                                                                  |
| ------------------- | ---------------------------------------------------------------- |
| **Actor**           | Administrador                                                    |
| **Postcondiciones** | Catálogo prescribible actualizado; rutinas afectadas reevaluadas |
| **Reglas**          | RN-115 a RN-118, RN-45, RN-117, RN-108                           |

**Curso normal.** El administrador marca qué equipamiento de la enumeración cerrada posee el gimnasio. El sistema recalcula el catálogo prescribible.

**Alternativos.** A1: **incorpora** equipamiento → el catálogo prescribible crece; los ejercicios antes marcados por equipamiento vuelven a COMPATIBLE y las propuestas abiertas por ese motivo se invalidan. A2: **retira** equipamiento → todo ejercicio de rutina vigente que lo requiera pasa a INCOMPATIBLE y se genera propuesta de sustitución (RN-117), sin interrumpir ninguna sesión ni rutina.

**Excepción.** E1: tras el cambio, el catálogo prescribible no cubre los patrones mínimos de RN-39a → se declara al administrador qué patrones quedan sin cubrir y qué equipamiento los resolvería (RN-118). Es la advertencia que evita descubrirlo alumno por alumno. E2: el inventario queda vacío → sólo quedan prescribibles los ejercicios de `PESO_CORPORAL`; se advierte explícitamente.

---

## FL-21 · Paneles agregados

|             |                                                                                         |
| ----------- | --------------------------------------------------------------------------------------- |
| **Actores** | Entrenador (su cartera) · Administrador (el gimnasio) · **Reglas** RN-73, RN-107, RA-06 |

**Curso normal.** El entrenador consulta la adherencia media de su cartera, la distribución de señales y la evolución de su actividad. El administrador consulta la retención por cohorte de incorporación, la distribución de actividad por día y franja horaria, la adherencia media, la carga de alumnos por entrenador y la cantidad de alumnos sin entrenador vigente.

**Alternativos.** A1: se filtra por período.

**Excepción.** E1: no hay actividad suficiente para una cohorte → se declara, no se dibuja vacía (RN-73). E2: hay datos simulados en la base → se excluyen de la analítica presentada como real, y se indica que se excluyeron (RN-107). E3: el administrador intenta descender al detalle individual → no se ofrece esa navegación (RA-06).
