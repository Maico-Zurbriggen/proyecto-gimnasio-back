# D1 — Visión y objetivos del producto

|                    |                                                         |
| ------------------ | ------------------------------------------------------- |
| **Versión**        | 2.0                                                     |
| **Fecha**          | 2026-08-18                                              |
| **Estado**         | Aprobado en Fase 1, base para el resto del corpus       |
| **Depende de**     | Nada. Es el documento raíz                              |
| **Es criterio de** | Todos. Una funcionalidad que no se conecte con §3 sobra |

**Marcas usadas en todo el corpus:** `[F]` lo afirma una fuente · `[I]` inferencia · `[S]` supuesto por ausencia de información (registrado en D12).

---

## 1. Problema

Una persona que entrena necesita que lo que hace hoy tenga en cuenta lo que le pasó hasta hoy: cómo viene respondiendo, qué le duele, qué equipamiento tiene, qué se propuso lograr. Esa adecuación permanente es un trabajo que hoy nadie hace de forma sostenida.

| Actor                      | Problema                                                                                                                                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Alumno**                 | Entrena durante meses con un plan que se decidió una sola vez. Si progresa, el plan se le queda corto; si se estanca, el plan no cambia; si se lesiona o cambia de objetivo, el plan sigue igual `[I]`                                           |
| **Gimnasio (como sostén)** | Es quien tiene las máquinas, el espacio y los entrenadores. El plan de una persona sólo es realizable con lo que ese gimnasio efectivamente tiene, y hoy nadie cruza ambas cosas de forma sistemática `[F: cliente]`                             |
| **Entrenador**             | Sabe qué habría que ajustarle a cada alumno pero no puede hacerlo para todos. Revisar a fondo a veinticinco personas cada pocas semanas no entra en su jornada, así que atiende a los que preguntan y a los que ve `[F: A §2.1, autoridad baja]` |
| **Gimnasio**               | Pierde socios que se fueron apagando de a poco y se entera cuando ya se dieron de baja `[F: A §2.1, autoridad baja]`                                                                                                                             |

`[S-04]` Esta caracterización no fue contrastada con un gimnasio real: proviene de un análisis interno del equipo. Es el supuesto sobre el que se apoya todo el producto y el más barato de verificar. Ver D12.

## 2. Situación actual y por qué no alcanza

La rutina vive en un papel, en una planilla o en la memoria del entrenador, y el seguimiento ocurre por conversación `[F: A §2.1]`. Falla por tres razones, en orden de importancia:

1. **No queda registro de lo que realmente pasó.** Se anota lo que había que hacer, no lo que se hizo. Sin esa diferencia nadie puede decir si el plan se cumplió, si funcionó, o si la persona dejó de venir.
2. **Revisar cuesta más que no revisar.** Ajustar bien una rutina exige mirar semanas de historial. Con muchos alumnos, la opción realista es no ajustar.
3. **Nada avisa.** El estancamiento, la caída de constancia y el abandono son graduales; cuando se vuelven visibles ya ocurrieron.

Una aplicación que sólo registre entrenamientos resuelve el punto 1 y ninguno de los otros dos.

## 3. Capacidad central

> **Mantener la prescripción de cada alumno permanentemente adecuada a su estado: desde el primer día, cuando no hay ningún historial, y a lo largo del tiempo, cuando el historial dice que hay que cambiar algo — fundamentando cada cambio y sometiéndolo siempre a la revisión de su entrenador.**

Cinco componentes que sólo tienen valor juntos `[F: RF-086, RF-087, RF-088, RF-089, RF-090, RF-091, RF-094 y decisión del cliente de 2026-08-18]`:

|     | Capacidad                                                                                                                                                                          | Requerimientos         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| C1  | **Nadie queda sin plan.** Todo alumno incorporado obtiene de inmediato una rutina propuesta, compatible con sus condiciones, aunque no tenga ningún historial                      | RF-087, RF-025         |
| C2  | **Ninguna prescripción contradice el estado de la persona**, ni al asignarla ni después, cuando cambia una condición, el objetivo o la aptitud                                     | RF-086, RF-094         |
| C3  | **La evolución se evalúa sola.** El sistema distingue periódicamente entre progresión adecuada, estancamiento y sobreexigencia                                                     | RF-088                 |
| C4  | **El cambio lo decide la inteligencia del sistema, con fundamento**, a partir del contexto completo del alumno                                                                     | RF-089, RF-090, RF-054 |
| C5  | **El entrenador es la puerta.** Ninguna rutina llega vigente a un alumno sin que un entrenador la haya revisado y aprobado. Sin excepciones, cualquiera sea el origen de la rutina | RF-091, RF-110         |

### 3.0 Dónde está la inteligencia

**Los componentes de inteligencia artificial y de aprendizaje automático son el centro del producto, no un accesorio.** `[F: decisión del cliente, 2026-08-18]` El sistema no se limita a mostrar datos para que una persona decida: **decide**, y presenta su decisión fundamentada para que una persona la valide.

De ahí se derivan tres consecuencias que gobiernan todo el corpus:

1. **La captación de datos del alumno es infraestructura crítica, no una funcionalidad más.** Perfil, objetivo, condiciones físicas, equipamiento, aptitud, mediciones, series registradas y esfuerzo percibido no existen para llenar pantallas: son el **contexto del alumno**, la entrada de todo componente de decisión. Un dato que no se capta es una decisión que se toma a ciegas. Los requerimientos de registro tienen la misma prioridad que los de decisión.
2. **Hay dos clases de componente y no se confunden.** Los **de decisión** (generación de rutinas, ajuste de la prescripción, estimación de riesgo, recomendación de sustitutos) producen valores y estructuras; su salida se valida automáticamente contra las reglas de compatibilidad y siempre pasa por revisión humana. Los **narrativos** (justificación de un ajuste, resumen de progreso) sólo redactan sobre hechos ya calculados y no pueden introducir ningún valor que no esté en su entrada.
3. **La decisión automática y la revisión humana no compiten.** La primera hace que el ajuste exista; la segunda hace que sea seguro. Sin la primera, el entrenador vuelve a revisar veinticinco fichas a mano. Sin la segunda, el sistema prescribe sin responsable.

**Dónde decide una regla y dónde un modelo — dicho sin adornos.** El diagnóstico, el cálculo de los ajustes, la compatibilidad y la estructura de la rutina son **determinísticos y auditables**: están escritos como tablas en D5 §5.1, §6, §9.1 y §9.2. Los componentes aprendidos actúan en la ordenación de alternativas de sustitución, en la estimación de riesgo de abandono y en la segmentación de perfiles. Los generativos actúan en la interpretación del lenguaje natural y en la redacción. Esta distribución es deliberada —un criterio escrito es implementable, verificable, discutible con un entrenador y defendible; y sirve además de criterio de referencia contra el cual medir cualquier componente aprendido que se incorpore después— y se declara aquí para que nadie la descubra en la defensa. Ver D11/DD-31 y D12/R-16.

### 3.1 El ciclo que gobierna el alcance

```
   estado del alumno ──▶ prescripción ──▶ ejecución registrada ──▶ diagnóstico
          ▲                                                             │
          │                                                             ▼
   nueva prescripción ◀── REVISIÓN DEL ENTRENADOR ◀── propuesta fundamentada
                                   ▲
                        toda rutina pasa por acá,
                     venga de una plantilla, de un preset
                    elegido por el alumno o de una generación
```

El registro de entrenamientos, los indicadores, los tableros y la vista de cartera **son el insumo de este ciclo, no productos separados**. Existen porque sin ellos no hay diagnóstico, y sin diagnóstico no hay adaptación fundamentada.

**Criterio de corte:** si una funcionalidad no aparece en este ciclo ni lo alimenta, no entra.

### 3.2 Qué queda en pie cuando falla un servicio externo

Siendo la inteligencia el centro, la continuidad operativa deja de ser una concesión y pasa a ser un requisito de disponibilidad del núcleo. La distinción que lo hace posible:

- **La capacidad de decidir vive dentro del sistema.** La generación de rutinas, el diagnóstico, el cálculo de ajustes y la estimación de riesgo se resuelven con recursos propios y con datos propios.
- **Lo que depende de un servicio externo es la conversación**: interpretar una descripción en lenguaje natural y redactar una justificación. Si ese servicio no está disponible, la entrada se hace por formulario estructurado y la justificación se presenta en forma tabulada `[F: RF-058]`.

Es decir: si falla el servicio externo el sistema sigue decidiendo, sólo que deja de hablar. Si además se apagaran los componentes de decisión, el sistema sigue siendo usable como herramienta de prescripción y registro manual — pero deja de ser este producto.

## 4. Actores

| Actor                                                           | ¿Va?                       | Justificación                                                                                                                                                                                                                     |
| --------------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Proveedor del sistema                                           | Sí, fuera de la aplicación | Aprovisiona el gimnasio afiliado y su primer administrador. Sin él ningún gimnasio arranca. No es un rol, no inicia sesión. Ver D11/DD-30                                                                                         |
| Alumno                                                          | Sí                         | Actor central. Puede elegir y pedir una rutina, pero no ponerla en vigencia por sí mismo. **Sólo existe por invitación de un gimnasio afiliado**                                                                                  |
| Entrenador                                                      | Sí                         | **Actor obligatorio del ciclo.** Revisa y aprueba toda rutina antes de que rija, resuelve las propuestas de adaptación, interviene sobre las rutinas de su cartera                                                                |
| Administrador de gimnasio                                       | Sí, acotado                | Invita usuarios, gestiona roles y asignaciones, **mantiene el inventario de equipamiento** y accede a la analítica agregada. El inventario determina qué puede prescribirse en todo el gimnasio: no es un rol administrativo puro |
| Visitante no autenticado                                        | No                         | Ver D11/DD-21                                                                                                                                                                                                                     |
| Recepcionista, nutricionista, superadministrador multi-gimnasio | No                         | Dependen de funcionalidades fuera de alcance (§6)                                                                                                                                                                                 |

## 5. Propuesta de valor

Para el **alumno**: un plan que se mantiene adecuado a lo que le está pasando, y evidencia de si progresa.
Para el **entrenador**: no tener que revisar a veinticinco personas para descubrir a cuáles hay que cambiarles algo; el sistema propone y él decide.
Para el **gimnasio**: aviso temprano de deserción y visibilidad de la actividad agregada.

## 6. No-alcance

No porque cueste construirlo, sino porque no es este problema.

| Fuera                                               | Precisión                                                                                                                                                                                                               |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Decidir por la persona**                          | El sistema propone; el entrenador aprueba. Ninguna rutina rige ni cambia sin su autorización explícita `[F: RF-091 + decisión del cliente]`                                                                             |
| **Entrenar sin entrenador**                         | Todo alumno tiene un entrenador vigente. Un alumno sin entrenador no puede recibir ninguna rutina nueva ni ninguna adaptación —conserva la vigente— y el sistema lo señala al administrador `[F: decisión del cliente]` |
| **Usarse sin gimnasio**                             | El sistema no es abierto. Nadie se registra por su cuenta: la cuenta nace de una invitación de un gimnasio afiliado, y la prescripción depende del equipamiento que ese gimnasio tiene `[F: decisión del cliente]`      |
| **Prescribir con equipamiento propio del alumno**   | Lo disponible es el inventario del gimnasio. Un alumno que además entrena en su casa no recibe una rutina para su casa `[F: decisión del cliente]` · Ver D11/DD-26                                                      |
| **Seguimiento de comidas**                          | Sin base de alimentos, sin composición ni registro de ingesta `[F: decisión del cliente]`. Ver DD-13                                                                                                                    |
| **Salud clínica**                                   | No diagnostica, no rehabilita, no corrige técnica, no reemplaza a un profesional                                                                                                                                        |
| **Operación del gimnasio como negocio**             | Cobros, cuotas, facturación, control de acceso físico, reservas de clases                                                                                                                                               |
| **Alta y administración de gimnasios y sucursales** | El sistema sirve a varios gimnasios; no los gestiona `[F: decisión del cliente]`                                                                                                                                        |
| **Comunicación en vivo**                            | Hay comentarios asincrónicos sobre una sesión o rutina; no hay mensajería `[F: RF-077 WON'T]`                                                                                                                           |
| **Lo que el sistema no puede medir**                | Calorías quemadas, calidad de ejecución, datos de dispositivos externos `[F: RF-081 WON'T]`                                                                                                                             |
| **Alojamiento de video propio**                     | Se referencian recursos externos `[F: RF-079 WON'T]`                                                                                                                                                                    |
| **Representación tridimensional del cuerpo**        | La representación bidimensional cubre la misma necesidad `[F: RF-080 WON'T]`                                                                                                                                            |

## 7. Criterios de éxito

No son métricas de tablero: son las preguntas que, contestadas con datos del propio sistema, dicen si esto sirvió.

| #   | Pregunta                                                                                        | Observación                                                                                                                                                                                                                       | Verificable sin usuarios reales |
| --- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| E1  | ¿Alguien se quedó sin plan?                                                                     | Todo alumno incorporado tiene una rutina propuesta el mismo día, y vigente en cuanto su entrenador la revisa. Ningún alumno queda sin entrenador vigente                                                                          | Sí                              |
| E1b | ¿Cuánto tarda la puerta?                                                                        | Días entre que una rutina se propone y su entrenador la resuelve. Si crece, el sistema deja de servir por congestión humana, no por defecto técnico                                                                               | No                              |
| E2  | ¿Alguna rutina vigente prescribe algo incompatible con las condiciones vigentes de esa persona? | Cero casos                                                                                                                                                                                                                        | Sí                              |
| E3  | ¿Cuánto tarda el sistema en reaccionar?                                                         | Días entre la aparición de un estancamiento o caída de constancia y la existencia de una propuesta                                                                                                                                | No                              |
| E4  | ¿Las propuestas se aceptan?                                                                     | Proporción aprobada total o parcialmente. Una tasa de rechazo alta significa que el diagnóstico es malo, y es más útil saberlo que no tenerlo                                                                                     | No                              |
| E5  | ¿El entrenador atiende a quien lo necesita?                                                     | Sus intervenciones se concentran en alumnos señalados                                                                                                                                                                             | No                              |
| E6  | ¿El pasado se mantuvo intacto?                                                                  | Una sesión ejecutada nunca cambia porque la rutina haya cambiado después                                                                                                                                                          | Sí                              |
| E7  | ¿Cada cambio tiene explicación?                                                                 | Toda adaptación conserva el criterio que la motivó y los datos que lo sustentan                                                                                                                                                   | Sí                              |
| E8  | ¿El alumno percibe que progresa?                                                                | Puede responder "¿estoy mejor que hace tres meses?" sin que se lo explique nadie                                                                                                                                                  | No                              |
| E9  | ¿La decisión automática es mejor que una regla trivial?                                         | Cada componente de decisión y de estimación se compara contra un criterio de referencia simple sobre un conjunto reservado, y se conservan ambas métricas. Que la regla simple gane también es un resultado, y hay que informarlo | Sí                              |
| E10 | ¿Lo narrado es cierto?                                                                          | Ningún valor numérico presente en un texto generado está ausente de sus datos de entrada. Cero excepciones                                                                                                                        | Sí                              |
| E11 | ¿El contexto está completo?                                                                     | Proporción de alumnos con contexto suficiente para decidir: objetivo, condiciones, equipamiento y nivel declarados. Un contexto pobre degrada toda decisión aguas abajo                                                           | Sí                              |

| E12 | ¿Lo que se prescribe se puede hacer en este gimnasio? | Ninguna rutina vigente contiene un ejercicio que exija equipamiento ausente del inventario. Cero casos | Sí |

**Verificables sin usuarios reales:** E1, E2, E6, E7, E9, E10, E11 y E12 — todos binarios o contables sobre la base.
**Requieren uso sostenido:** E1b, E3, E4, E5 y E8. Con datos simulados sólo se demuestra el mecanismo, no el efecto, y así deben presentarse.
