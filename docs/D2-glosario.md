# D2 — Glosario y lenguaje del dominio

|                |                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Versión**    | 2.0                                                                                                                             |
| **Fecha**      | 2026-08-18                                                                                                                      |
| **Estado**     | Normativo                                                                                                                       |
| **Depende de** | D1                                                                                                                              |
| **Regla**      | Todo el corpus usa exclusivamente estos términos, con esta ortografía y este significado. Un término no definido aquí no se usa |

**Cambios de la v1.0:** se define el verbo _asignar_ (colisionaba con _asignación_) · se define _progreso_ en lugar de prohibirlo · el equipamiento pasa a ser del gimnasio · se agregan _afiliación_, _invitación_, _inventario_, _articulación_, _contraindicación_ · se incorporan las siete enumeraciones cerradas de §4, que antes se presuponían sin existir.

---

## 1. Términos del dominio

### 1.1 Ámbito, identidad y alta

| Término               | Definición                                                                                                                                                                                                                 | Sinónimos descartados              |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| **Gimnasio**          | Organización afiliada al sistema. Ámbito de aislamiento de toda la información y **origen del equipamiento disponible** para sus alumnos. No es un objeto administrable por los usuarios de la aplicación                  | Sucursal, sede, tenant, club       |
| **Afiliación**        | Acuerdo por el cual un gimnasio incorpora el sistema. Ocurre **fuera de la aplicación**; su efecto dentro del sistema es el aprovisionamiento del gimnasio y de su primer administrador                                    | Contratación, alta de cliente      |
| **Aprovisionamiento** | Operación por la que el proveedor del sistema crea un gimnasio afiliado, su zona horaria y su primer administrador. No es una funcionalidad accesible a ningún rol de la aplicación                                        | Instalación, bootstrap             |
| **Invitación**        | Autorización nominal y temporal, emitida por un administrador o por un entrenador, que habilita a una persona a crear su cuenta en un gimnasio determinado con un rol determinado. **Es la única vía de alta de usuarios** | Alta, registro abierto             |
| **Usuario**           | Persona con cuenta en un gimnasio. Posee uno o más roles                                                                                                                                                                   | Cuenta, socio, miembro             |
| **Alumno**            | Rol que recibe prescripciones y registra ejecuciones                                                                                                                                                                       | Cliente, socio, deportista, atleta |
| **Entrenador**        | Rol que diseña prescripciones, revisa toda rutina antes de que rija y resuelve las propuestas de adaptación                                                                                                                | Profesor, coach, instructor        |
| **Administrador**     | Rol que gestiona invitaciones, usuarios, roles, asignaciones y el inventario de equipamiento del gimnasio, y consulta la analítica agregada                                                                                | Admin, dueño, gerente              |
| **Asignación**        | Relación vigente entre un entrenador y un alumno. Tiene fecha de inicio y, cuando termina, fecha de fin. Determina el acceso del entrenador a la información del alumno. **Se usa exclusivamente para esta relación**      | Vinculación, cartera               |
| **Asignar** _(verbo)_ | Establecer una asignación entre un entrenador y un alumno. **Nunca se dice "asignar una rutina"**: una rutina se _solicita_, se _revisa_ y se _pone en vigencia_                                                           | Vincular                           |
| **Cartera**           | Conjunto de alumnos con asignación vigente a un entrenador determinado                                                                                                                                                     | Nómina, listado de alumnos         |

### 1.2 Equipamiento

| Término          | Definición                                                                                                                                                           | Sinónimos descartados                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| **Equipamiento** | Elemento de la enumeración cerrada de §4.1. Es el vocabulario común entre lo que un ejercicio requiere y lo que un gimnasio posee                                    | Material, aparato, máquina                  |
| **Inventario**   | Conjunto de equipamiento que un gimnasio declara poseer. Lo mantiene el administrador y **determina qué ejercicios son prescribibles a los alumnos de ese gimnasio** | Equipamiento disponible, parque de máquinas |

**Decisión de dominio:** el equipamiento disponible para un alumno es el inventario de su gimnasio. El alumno no declara equipamiento propio. Ver D11/DD-26.

### 1.3 Estado del alumno

| Término                  | Definición                                                                                                                                                                                       | Sinónimos descartados                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| **Perfil**               | Datos del alumno que condicionan la prescripción: edad, sexo, altura, nivel de experiencia y días semanales disponibles                                                                          | Ficha, datos personales                   |
| **Nivel de experiencia** | Clasificación del alumno según §4.4. Limita qué ejercicios le son prescribibles                                                                                                                  | Nivel                                     |
| **Objetivo**             | Propósito de entrenamiento declarado por el alumno, tomado de §4.5, vigente durante un período. Un alumno tiene como máximo un objetivo vigente, y ninguno antes de declararlo                   | Meta, finalidad                           |
| **Condición física**     | Limitación declarada por el alumno que afecta una **zona corporal** (§4.3) con una **severidad** (§4.6). Tiene fecha de inicio y, cuando cesa, fecha de fin                                      | Lesión, restricción, patología            |
| **Zona corporal**        | Elemento de la unión de las enumeraciones de grupos musculares (§4.2) y articulaciones (§4.3). Es el vocabulario que vincula una condición física con un ejercicio                               | Parte del cuerpo, área                    |
| **Contraindicación**     | Relación calculada entre un ejercicio y una condición física vigente de un alumno, según la regla RN-44a. No es un dato que alguien cargue: es el resultado de una comparación                   | Restricción, incompatibilidad (ver abajo) |
| **Aptitud**              | Constancia de aptitud para la práctica deportiva registrada para un alumno, con fecha de emisión y de vencimiento. Su ausencia o vencimiento se advierte de forma destacada; nunca impide operar | Apto físico, certificado médico           |
| **Estado de membresía**  | Situación declarada del alumno respecto del gimnasio. Exclusivamente informativa                                                                                                                 | Cuota, suscripción                        |
| **Medición corporal**    | Valor numérico fechado de una magnitud del cuerpo del alumno. Como máximo un registro por tipo y fecha                                                                                           | Medida, antropometría                     |

### 1.4 Catálogo

| Término                      | Definición                                                                                                                                                                                                         | Sinónimos descartados   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| **Ejercicio**                | Movimiento identificable del catálogo, con instrucciones, equipamiento requerido, patrón de movimiento (§4.7), nivel de dificultad (§4.4), articulaciones exigidas (§4.3), clasificación muscular y recurso visual | Movimiento, actividad   |
| **Catálogo base**            | Conjunto de ejercicios común a todos los gimnasios, incorporado por carga inicial y no editable por ningún usuario                                                                                                 | Semilla, biblioteca     |
| **Catálogo del gimnasio**    | Ejercicios creados por entrenadores de un gimnasio, visibles sólo dentro de él                                                                                                                                     | Ejercicios propios      |
| **Catálogo prescribible**    | Subconjunto del catálogo accesible a un gimnasio cuyos ejercicios requieren únicamente equipamiento presente en su inventario. **Es el conjunto sobre el que operan la construcción y la validación de rutinas**   | —                       |
| **Grupo muscular**           | Elemento de la taxonomía canónica de §4.2                                                                                                                                                                          | Músculo, zona, región   |
| **Articulación**             | Elemento de la enumeración de §4.3. Un ejercicio declara las articulaciones que exige                                                                                                                              | —                       |
| **Participación muscular**   | Relación entre un ejercicio y un grupo muscular, primaria o secundaria                                                                                                                                             | Implicación, activación |
| **Patrón de movimiento**     | Clasificación mecánica del ejercicio según §4.7. Base de la equivalencia entre ejercicios y de la estructura de los días de rutina                                                                                 | Tipo de movimiento      |
| **Ejercicio no clasificado** | Ejercicio sin ninguna participación muscular declarada. No aporta volumen a ningún grupo, y esa ausencia se distingue de aportar cero                                                                              | Sin datos               |

### 1.5 Prescripción

| Término                         | Definición                                                                                                                                                                                       | Sinónimos descartados   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| **Plantilla**                   | Estructura de rutina reutilizable creada por un entrenador, no asociada a ningún alumno                                                                                                          | Modelo, template        |
| **Preset**                      | Plantilla publicada para uso de otros usuarios del mismo gimnasio. Es un estado de la plantilla                                                                                                  | Plantilla pública       |
| **Rutina**                      | Copia independiente de una estructura de rutina, asociada a un alumno concreto                                                                                                                   | Plan, programa          |
| **Rutina propuesta**            | Rutina completa asociada a un alumno que aún no rige porque no fue revisada. El alumno la ve; no puede entrenar bajo ella                                                                        | Borrador, pendiente     |
| **Revisión**                    | Acto por el cual un entrenador examina una rutina propuesta y la aprueba, la modifica y aprueba, o la rechaza. Ninguna rutina rige sin una revisión favorable                                    | Validación, visto bueno |
| **Versión de rutina**           | Estado completo de la estructura de una rutina en un momento dado. Cada adaptación aplicada genera una versión nueva; las anteriores se conservan sin alteración                                 | Revisión, snapshot      |
| **Día de rutina**               | Agrupación ordenada de ejercicios dentro de una versión. No está asociado a un día del calendario                                                                                                | Jornada, día A/B/C      |
| **Serie prescripta**            | Unidad de prescripción: rango de repeticiones objetivo, carga sugerida, descanso y carácter de calentamiento o de trabajo                                                                        | Set planificado         |
| **Serie de trabajo**            | Serie prescripta que no es de calentamiento. Sólo las series de trabajo completadas cuentan para el volumen                                                                                      | Serie efectiva          |
| **Tipo de rutina**              | Clasificación de §4.5 que determina, según la tabla RN-39a, la estructura de días admisible, los esquemas de series y repeticiones y los rangos de descanso                                      | Modalidad, enfoque      |
| **Frecuencia semanal objetivo** | Cantidad de sesiones esperadas por semana declarada por una rutina. Referencia única para el cálculo de adherencia                                                                               | Sesiones objetivo       |
| **Incompatibilidad**            | Condición que impide poner una rutina en vigencia: un ejercicio contraindicado con severidad moderada o severa, de nivel superior al del alumno, o que exige equipamiento ausente del inventario | Conflicto               |

### 1.6 Ejecución

| Término                    | Definición                                                                                                                                     | Sinónimos descartados  |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| **Sesión**                 | Ocurrencia concreta de entrenamiento de un alumno correspondiente a un día de su rutina. Contiene su propia copia congelada de la prescripción | Entrenamiento, workout |
| **Registro de serie**      | Anotación de una serie dentro de una sesión, que conserva de forma conjunta lo prescripto y lo ejecutado                                       | Set, serie realizada   |
| **Prescripción congelada** | Copia de la prescripción del día realizada al iniciarse la sesión, inmune a toda modificación posterior de la rutina                           | Snapshot de sesión     |
| **Esfuerzo percibido**     | Valoración subjetiva del alumno sobre la dificultad de una serie, de 1 a 10. Opcional                                                          | RPE, RIR               |
| **Sustitución**            | Reemplazo, durante una sesión, de un ejercicio prescripto por otro efectivamente ejecutado                                                     | Cambio de ejercicio    |
| **Sesión diferida**        | Sesión registrada con posterioridad a la fecha en que ocurrió                                                                                  | Registro retroactivo   |
| **Registro atípico**       | Valor dentro del rango admisible pero muy superior al histórico del alumno en ese ejercicio, que requiere confirmación antes de aceptarse      | Outlier                |

### 1.7 Indicadores

| Término                          | Definición                                                                                                                                                                                               | Sinónimos descartados  |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| **Volumen**                      | Trabajo dirigido a un grupo muscular en un período, en **series efectivas**: cada serie de trabajo completada aporta 1,0 al grupo de participación primaria y 0,5 a cada secundario. **No es tonelaje**  | Carga total, tonelaje  |
| **Volumen por ejercicio**        | Cantidad de series de trabajo completadas de un ejercicio en un período. Unidad distinta del volumen por grupo muscular; nunca se comparan                                                               | —                      |
| **Frecuencia**                   | Cantidad de sesiones distintas de un período que estimularon un grupo muscular                                                                                                                           | —                      |
| **Carga máxima estimada**        | Estimación de la carga máxima que un alumno movilizaría una vez en un ejercicio, derivada de sus series registradas. Sinónimo técnico admitido en notas de diseño: _e1RM_                                | Fuerza máxima, 1RM     |
| **Adherencia**                   | Proporción entre las sesiones realizadas y las esperadas, sobre una ventana móvil de cuatro semanas. Mide **si vino**                                                                                    | Constancia, asistencia |
| **Cumplimiento de series**       | Series de trabajo completadas sobre series de trabajo prescriptas                                                                                                                                        | —                      |
| **Cumplimiento de repeticiones** | Repeticiones ejecutadas sobre repeticiones objetivo, en las series de trabajo prescriptas. Mide **qué hizo cuando vino**                                                                                 | Logro                  |
| **Progreso**                     | Evolución conjunta de los indicadores de un alumno en un período: carga máxima estimada por ejercicio, volumen, adherencia, cumplimiento, récords y mediciones corporales. Se usa sólo con esta acepción | Avance, mejora         |
| **Récord personal**              | Mejor marca registrada de un alumno en un ejercicio, en alguno de los tres tipos de §4.8. Es un evento con fecha                                                                                         | PR, mejor marca        |
| **Señal de seguimiento**         | Situación detectada sobre un alumno que requiere atención: estancamiento, caída de adherencia o desbalance                                                                                               | Alerta, flag           |
| **Desbalance**                   | Diferencia entre el volumen recibido por un grupo muscular y su rango de referencia                                                                                                                      | Descompensación        |

### 1.8 Adaptación

| Término                      | Definición                                                                                                                                                             | Sinónimos descartados       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| **Situación de evolución**   | Clasificación de §4.9 aplicada a un ejercicio o al conjunto de la rutina de un alumno en un período                                                                    | Estado, diagnóstico parcial |
| **Diagnóstico de evolución** | Resultado fechado de la evaluación periódica de un alumno sobre su rutina vigente, que asigna una situación a cada ejercicio y una global                              | Evaluación, análisis        |
| **Propuesta de adaptación**  | Conjunto fechado de ajustes sugeridos sobre la rutina vigente, derivado de un diagnóstico. Nunca se aplica sin revisión                                                | Sugerencia                  |
| **Ajuste**                   | Cada modificación individual de una propuesta, de alguno de los tipos de §4.10, con su criterio motivador y los datos que lo sustentan                                 | Cambio                      |
| **Aprobador**                | Única persona facultada para poner una rutina en vigencia y resolver una propuesta: el entrenador con asignación vigente sobre el alumno. No hay aprobador alternativo | —                           |
| **Riesgo de abandono**       | Estimación fechada de la probabilidad de que un alumno interrumpa su actividad. Visible para entrenadores y administradores; nunca para el alumno evaluado             | Deserción, churn            |

### 1.9 Datos y componentes

| Término                        | Definición                                                                                                                                                                                                                                                                                            |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contexto del alumno**        | Conjunto estructurado que se entrega como entrada a un componente de decisión: perfil, nivel, objetivo vigente, condiciones físicas vigentes, aptitud, inventario del gimnasio, rutina vigente, indicadores del período y esfuerzo percibido registrado. Se conserva junto a cada resultado producido |
| **Contexto suficiente**        | Contexto que contiene, como mínimo, nivel de experiencia, objetivo vigente y declaración de condiciones físicas (aunque sea la declaración expresa de no tener ninguna). Sin contexto suficiente no se produce ninguna decisión automática                                                            |
| **Componente de decisión**     | Componente que produce valores o estructuras que afectan la prescripción o la gestión. Su salida se valida contra las reglas de compatibilidad y de tipo de rutina, y se somete a revisión humana                                                                                                     |
| **Componente narrativo**       | Componente que sólo redacta texto sobre hechos ya calculados. No introduce valores ausentes de su entrada ni afecta ninguna prescripción                                                                                                                                                              |
| **Alternativa determinística** | Camino equivalente que produce el mismo tipo de resultado sin recurrir a un servicio externo de generación                                                                                                                                                                                            |
| **Dato simulado**              | Registro generado con fines de desarrollo, evaluación o demostración, marcado de forma inequívoca y excluido de toda analítica presentada como real                                                                                                                                                   |
| **Criterio de referencia**     | Regla simple contra la cual se compara el resultado de un componente para determinar si aporta algo                                                                                                                                                                                                   |

## 2. Términos prohibidos

| Término                                       | Motivo                                                                                                                                    |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Historial** (como entidad)                  | El historial son las sesiones ordenadas por fecha                                                                                         |
| **Tonelaje**, **carga total**                 | Métrica no comparable entre ejercicios                                                                                                    |
| **Calorías quemadas**, **puntaje de fitness** | No estimables con la información disponible                                                                                               |
| **Rutina activa**                             | Se usa exclusivamente **vigente**                                                                                                         |
| **Asignar una rutina**                        | Se usa _solicitar_, _revisar_ o _poner en vigencia_. _Asignar_ queda reservado a la relación entrenador–alumno                            |
| **Preset** como entidad separada de plantilla | Es un estado de la plantilla                                                                                                              |
| **Chat**, **mensaje**                         | El sistema tiene comentarios asincrónicos                                                                                                 |
| **Dieta**, **plan alimentario**, **menú**     | El sistema produce una **pauta nutricional**: distribución orientativa de energía y macronutrientes, sin nombrar alimentos. Ver D11/DD-13 |
| **Cumplimiento** sin calificar                | Se dice _cumplimiento de series_ o _cumplimiento de repeticiones_                                                                         |

## 3. Unidades y marco temporal

| Magnitud                       | Unidad                               | Precisión                                                                                            |
| ------------------------------ | ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Carga                          | Kilogramo                            | Dos decimales, redondeo a 0,01 al ingresar. Nunca representación en coma flotante _(nota de diseño)_ |
| Incrementos de carga sugeridos | Kilogramo                            | Múltiplos de 2,50 kg                                                                                 |
| Repeticiones                   | Entero                               | —                                                                                                    |
| Descanso y duración            | Segundo                              | Entero                                                                                               |
| Esfuerzo percibido             | Entero de 1 a 10                     | —                                                                                                    |
| Peso corporal                  | Kilogramo                            | Un decimal                                                                                           |
| Perímetros                     | Centímetro                           | Un decimal                                                                                           |
| Volumen                        | Series efectivas                     | Un decimal                                                                                           |
| Energía                        | Kilocaloría                          | Entero                                                                                               |
| Proteína                       | Gramo por kilogramo de peso corporal | Un decimal                                                                                           |

- **Instante:** se almacena en tiempo universal coordinado y se presenta en la zona horaria del gimnasio.
- **Día:** delimitado por la zona horaria del gimnasio, no por la del dispositivo.
- **Semana:** de lunes a domingo inclusive. Definición única para toda agregación semanal.
- **Ventana móvil de adherencia:** cuatro semanas completas hacia atrás desde el instante de cálculo.
- **Período de diagnóstico:** seis semanas completas hacia atrás desde el instante de cálculo.

## 4. Enumeraciones cerradas

Estas listas son el vocabulario del sistema. Ninguna admite valores fuera de ella sin modificar este documento.

### 4.1 Equipamiento — 22 valores

`PESO_CORPORAL` · `BARRA` · `DISCOS` · `MANCUERNAS` · `PESAS_RUSAS` · `BANCO_PLANO` · `BANCO_INCLINADO` · `BANCO_DECLINADO` · `RACK_SENTADILLA` · `JAULA_POTENCIA` · `PRENSA_PIERNAS` · `POLEA_ALTA` · `POLEA_BAJA` · `MAQUINA_PECHO` · `MAQUINA_ESPALDA` · `MAQUINA_HOMBRO` · `MAQUINA_CUADRICEPS` · `MAQUINA_ISQUIOTIBIALES` · `MAQUINA_GEMELOS` · `BARRA_DOMINADAS` · `PARALELAS` · `BANDAS_ELASTICAS`

`PESO_CORPORAL` se considera presente en todo inventario y no se declara.

### 4.2 Grupos musculares — 17 valores

**Cadena anterior:** `PECTORAL` · `DELTOIDES_ANTERIOR` · `DELTOIDES_LATERAL` · `BICEPS` · `ANTEBRAZO` · `ABDOMINALES` · `OBLICUOS` · `CUADRICEPS` · `ADUCTORES`

**Cadena posterior:** `DORSAL` · `TRAPECIO` · `DELTOIDES_POSTERIOR` · `TRICEPS` · `ERECTORES_LUMBARES` · `GLUTEO` · `ISQUIOTIBIALES` · `GEMELOS`

`[S]` La granularidad de esta lista es una convención de modelado adoptada por este proyecto, no un estándar anatómico. Es la unidad de agregación del volumen y la unidad de pintado de la representación muscular; cambiarla obliga a rehacer la curación del catálogo. Registrado en D12/§1.

### 4.3 Articulaciones — 8 valores

`HOMBRO` · `CODO` · `MUNECA` · `COLUMNA_CERVICAL` · `COLUMNA_LUMBAR` · `CADERA` · `RODILLA` · `TOBILLO`

**Zona corporal** = unión de §4.2 y §4.3, 25 valores en total.

### 4.4 Nivel — 3 valores, ordenados

`PRINCIPIANTE` < `INTERMEDIO` < `AVANZADO`

Se aplica tanto al nivel de experiencia del alumno como al nivel de dificultad del ejercicio, con el mismo orden.

### 4.5 Objetivo del alumno y tipo de rutina — 4 valores comunes

`FUERZA` · `HIPERTROFIA` · `RESISTENCIA_MUSCULAR` · `ACONDICIONAMIENTO_GENERAL`

Objetivo y tipo de rutina comparten enumeración deliberadamente: hace que la verificación de correspondencia de RN-40 sea una comparación y no un juicio. `ACONDICIONAMIENTO_GENERAL` como tipo de rutina es compatible con cualquier objetivo.

`READAPTACION` fue evaluado y excluido: no tiene objetivo de alumno equivalente y arrastra implicancias clínicas que el sistema declara fuera de alcance. Ver D11/DD-27.

### 4.6 Severidad de una condición física — 3 valores

`LEVE` — advierte, no impide · `MODERADA` — impide · `SEVERA` — impide

### 4.7 Patrón de movimiento — 9 valores

`EMPUJE_HORIZONTAL` · `EMPUJE_VERTICAL` · `TRACCION_HORIZONTAL` · `TRACCION_VERTICAL` · `DOMINANTE_RODILLA` · `DOMINANTE_CADERA` · `CORE` · `AISLAMIENTO_SUPERIOR` · `AISLAMIENTO_INFERIOR`

### 4.8 Tipo de récord personal — 3 valores

`CARGA_MAXIMA_ESTIMADA` — mayor carga máxima estimada alcanzada
`CARGA_MOVILIZADA` — mayor carga usada en una serie de trabajo completada
`REPETICIONES` — mayor cantidad de repeticiones en una serie de trabajo completada. **Es el único aplicable a ejercicios cuya carga ejecutada es cero**

### 4.9 Situación de evolución — 5 valores

`DATOS_INSUFICIENTES` · `SOBREEXIGENCIA` · `PROGRESION_ADECUADA` · `ESTIMULO_INSUFICIENTE` · `ESTANCAMIENTO`

Enumerados en el orden de precedencia con que se evalúan (RN-79a).

### 4.10 Tipo de ajuste — 5 valores

`CARGA` — modifica la carga sugerida de un ejercicio
`VOLUMEN` — modifica la cantidad de series de un ejercicio
`ESQUEMA` — modifica el rango de repeticiones o el descanso
`SUSTITUCION` — reemplaza un ejercicio por otro
`ESTRUCTURA` — modifica la composición de días o la frecuencia semanal objetivo

### 4.11 Tipo de medición corporal — 6 valores

`PESO_CORPORAL` · `PERIMETRO_CINTURA` · `PERIMETRO_CADERA` · `PERIMETRO_BRAZO` · `PERIMETRO_MUSLO` · `PERIMETRO_PECHO`

### 4.12 Tipo de aviso — 9 valores

`RUTINA_PROPUESTA_PENDIENTE` · `RUTINA_EN_VIGENCIA` · `RUTINA_RECHAZADA` · `RUTINA_AJUSTADA` · `PROPUESTA_PENDIENTE` · `RECORD_ALCANZADO` · `SENAL_DETECTADA` · `INCOMPATIBILIDAD_SOBREVENIDA` · `APTITUD_POR_VENCER`
