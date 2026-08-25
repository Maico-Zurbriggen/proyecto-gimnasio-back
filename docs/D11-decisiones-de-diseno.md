# D11 — Registro de decisiones

|                |            |
| -------------- | ---------- |
| **Versión**    | 2.1        |
| **Fecha**      | 2026-08-24 |
| **Estado**     | Normativo  |
| **Depende de** | Todos      |

**Cambios de la v1.0:** DD-13 (nutrición) queda resuelta · decisiones nuevas DD-26 a DD-32, que cierran los bloqueantes de la auditoría · 👁 marca las decisiones que las fuentes tomaron sin advertir que estaban decidiendo.

**Cambios de la v2.0:** DD-33, el candidato de rutina.

---

### DD-01 · Jerarquía de las fuentes

**Contexto.** Tres cuerpos de material de distinta antigüedad y autoridad, sin fechas.
**Elegida.** Pedido del cliente (RF-082 a RF-094 y decisiones posteriores) > especificación funcional > análisis de scope inicial.
**Fundamento.** El análisis inicial es una opinión escrita antes de conocer el pedido del cliente. Conciliar produciría un documento sin criterio.
**Consecuencia asumida.** Varias recomendaciones bien argumentadas del análisis inicial quedan derogadas, en particular su tesis de que el ajuste de la rutina es trabajo manual del entrenador.

### DD-02 · Copia al solicitar **más** versiones completas de la rutina

**Contexto.** Modificar una plantilla no debe alterar rutinas ya creadas (RF-022); aplicar una adaptación debe generar una versión nueva conservando las anteriores (RF-092).
**Opciones.** (a) Referencia a la plantilla. (b) Versionado con diferencias y propagación. (c) Copia sin versiones. (d) **Copia más versiones completas**.
**Elegida.** (d).
**Fundamento.** La objeción de coste al versionado apuntaba a las diferencias, la propagación y la resolución de conflictos. Una versión completa de una rutina es una copia profunda de una estructura pequeña: no hay diferencias que calcular ni conflictos que resolver, y RF-093 se responde comparando dos versiones.
**Consecuencia asumida.** Duplicación de datos, irrelevante a esta escala. Los cambios de plantilla no se propagan, que es el comportamiento deseado.

### DD-03 · La sesión congela su propia prescripción 👁

**Elegida.** Al iniciarse, la sesión copia la prescripción del día en sus registros de serie (RF-028).
**Fundamento.** Vuelve cada sesión autocontenida e inmune a toda edición posterior, y produce el cumplimiento por serie sin trabajo adicional.
**Consecuencia asumida.** Duplicación de la prescripción por sesión.
**Nota.** La especificación heredada enuncia esto como requerimiento sin registrar que es la decisión de modelado más determinante del sistema. Sin ella, el versionado de DD-02 reescribiría el pasado.

### DD-04 · Derivar los indicadores, persistir sólo eventos, salidas de componentes y marcas

**Elegida.** Derivar volumen, frecuencia, carga máxima estimada, adherencia y cumplimiento; persistir récords, diagnósticos, propuestas, estimaciones y el estado de compatibilidad de cada ejercicio de rutina.
**Fundamento.** Un indicador persistido queda inconsistente cuando cambia su definición. Un récord y una salida de componente son eventos fechados: recalcularlos pierde el instante y la versión.
**Excepción explícita.** El estado de compatibilidad es el único derivado que se persiste, porque la marca debe estar disponible al iniciar una sesión y en la vista de rutina sin recalcular el conjunto.

### DD-05 · Catálogo base global, catálogo propio por gimnasio

**Contexto.** RF-013 exige un catálogo accesible a todos; RF-069 exige aislamiento por gimnasio; RF-017 permite a entrenadores crear ejercicios. Las tres cosas no pueden ser ciertas con un catálogo único.
**Elegida.** Base global no editable más catálogo propio por gimnasio.
**Fundamento.** Un catálogo global único filtra ejercicios de un gimnasio a otro; uno replicado multiplica la carga inicial y la curación, que es el trabajo caro y el que determina la calidad del volumen.
**Consecuencia asumida.** Un entrenador no puede promover su ejercicio al catálogo base.

### DD-06 · La aptitud advierte, nunca bloquea

**Elegida.** Advertencia destacada al poner una rutina en vigencia y al iniciar una sesión; ninguna operación impedida `[F: cliente]`.
**Consecuencia asumida.** El sistema puede tener alumnos entrenando sin aptitud vigente. La responsabilidad queda en el gimnasio, y la advertencia queda registrada.

### DD-07 · El estado de membresía es informativo

**Elegida.** Informativo `[F: cliente]`.
**Fundamento.** Una regla de bloqueo atraviesa todos los flujos de entrenamiento y multiplica los casos borde a cambio de valor nulo para el ciclo central.

### DD-08 · Los roles son un conjunto 👁

**Fundamento.** Un entrenador también entrena. Modelarlo como valor único obliga a un rediseño en cuanto aparece el primer caso.
**Nota.** Es gratis ahora y caro después. Ver DD-28, que resuelve el caso concreto que esta decisión habilita.

### DD-09 · Nada se borra

**Elegida.** Desactivación lógica universal; la única eliminación real es la anonimización en la baja de cuenta.
**Consecuencia asumida.** El catálogo y la base de usuarios acumulan registros inactivos.

### DD-10 · La rutina es cíclica, no un calendario 👁

**Elegida.** El sistema propone el siguiente día del ciclo; el alumno elige.
**Fundamento.** Refleja cómo se entrena realmente y elimina un módulo entero de agenda, recordatorios y días perdidos. La adherencia se resuelve con la frecuencia semanal objetivo.
**Consecuencia asumida.** No hay recordatorios por día ni concepto de "día perdido".

### DD-11 · Constantes documentadas en lugar de configuración

**Elegida.** Constantes fijadas en D5, cada una con su origen marcado; RF-047 desciende a COULD.
**Fundamento.** Ventanas configurables hacen que la adherencia de dos alumnos no sea comparable, y la comparación es lo que sostiene la cartera priorizada y la analítica del gimnasio.

### DD-12 · Un solo entrenador vigente sobre una relación con historial

La estructura soporta el historial; RN-18 impone la unicidad. Sin el historial no se puede responder qué entrenador supervisó un período ni calcular la carga por entrenador. Coste marginal: nulo.

### DD-13 · Alcance de la pauta nutricional — **RESUELTA**

**Contexto.** El cliente pidió generar dietas y descartó el seguimiento de comidas. La especificación heredada había excluido la generación de planes nutricionales por riesgo sanitario sin validador profesional.
**Opciones.**

|     | Forma                                                                                       | Riesgo                                                                                                            | Coste |
| --- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----- |
| (a) | Plan de comidas redactado libremente por un componente generativo                           | **Alto.** Sin base de alimentos no hay forma de verificar la salida; puede producir déficits o ignorar patologías | Bajo  |
| (b) | Plantillas de menú precargadas y revisadas por el equipo                                    | Bajo                                                                                                              | Medio |
| (c) | **Distribución orientativa de energía y macronutrientes por comida, sin nombrar alimentos** | Bajo                                                                                                              | Bajo  |

**Elegida.** (c). RF-075 y RF-108 quedan redactados en esos términos; RF-076 sigue fuera.
**Fundamento.** Cumple el pedido —el sistema produce una pauta alimentaria personalizada— sin afirmar nada que no pueda sostener y sin necesitar la base de alimentos que quedó fuera de alcance. (a) es la única opción que reintroduce el riesgo que la especificación había descartado, y también la única sin forma de evaluarse.
**Consecuencia asumida.** El alumno no recibe qué comer, sino cuánta energía y cuánta proteína distribuir. Si el cliente considera que eso no cumple su pedido, hay que volver sobre la decisión antes de construir, no después.

### DD-14 · Dos clases de componente inteligente

**Contexto.** El cliente definió la inteligencia como centro del producto; la redacción heredada de RF-057 prohibía que los componentes generativos produjeran valores o prescribieran cargas.
**Elegida.** Se distingue **componente de decisión** (produce valores y estructuras; validado y sujeto a revisión humana) de **componente narrativo** (sólo redacta sobre hechos calculados; no introduce ningún valor ausente de su entrada).
**Fundamento.** Prohibirle al sistema producir valores es incompatible con que decida. Mantener la prohibición sobre lo narrado conserva la única métrica de calidad barata, objetiva y contundente del proyecto: cero valores inventados en los textos.
**Consecuencia asumida.** El riesgo se traslada del texto a la prescripción, y se contiene con dos barreras: la validación automática de compatibilidad y de rangos, y la revisión del entrenador.

### DD-15 · Las estimaciones se calculan de forma diferida

**Elegida.** Diferida y periódica, más a demanda del administrador.
**Fundamento.** Elimina la latencia en la petición del usuario, la dependencia de un segundo servicio en el camino crítico y el versionado en tiempo de ejecución. Y hace verdadera la regla de continuidad: si el proceso nunca corre, la columna dice "no disponible" y nada se rompe.
**Consecuencia asumida.** La estimación tiene la antigüedad de la última ejecución, que por eso se muestra siempre junto al valor.

### DD-16 · Historial de objetivos y de condiciones con vigencia

**Fundamento.** Sin él no se puede determinar qué condiciones regían cuando se prescribió algo, y toda auditoría de una decisión pasada queda sin sustento.
**Consecuencia asumida.** Modelado temporal en dos entidades más, con su coste de consulta. Es el coste de poder explicar una decisión pasada.

### DD-17 · El alumno no ve su estimación de riesgo

**Fundamento.** Presentarle una probabilidad de abandono es contraproducente y no admite justificación defendible. Sí ve sus indicadores objetivos de adherencia y cumplimiento, que son accionables.
**Consecuencia asumida.** Una vista distinta según el rol sobre el mismo alumno.

### DD-18 · Toda salida inteligente se registra con su versión y su contexto

**Fundamento.** Es lo que separa un componente evaluable de uno meramente demostrable, y lo que permite responder "¿por qué el sistema propuso esto?" seis semanas después.
**Consecuencia asumida.** Almacenamiento del contexto por cada resultado producido.

### DD-19 · La sustitución cuenta como cumplimiento

**Elegida.** Cuenta como cumplida, marcada como sustituida; el volumen se imputa al ejercicio ejecutado.
**Fundamento.** Si sustituir castiga la métrica, el alumno deja de declararlo y el registro se degrada — y con él el contexto del que depende toda la inteligencia del sistema.

### DD-20 · Los datos simulados se marcan y se excluyen de la analítica real

**Fundamento.** Un panel de retención que mezcla alumnos simulados con reales produce un número que no significa nada, y es indistinguible de uno correcto.

### DD-21 · No hay acceso no autenticado

**Elegida.** Eliminado el catálogo público.
**Fundamento.** Agrega un cuarto ámbito de permisos y una superficie pública a cambio de valor nulo para el ciclo central. Refuerza además DD-29: el sistema no es abierto.

### DD-22 · El administrador no accede al detalle individual sensible 👁

**Elegida.** Acceso de gestión y de agregación; sin sesiones, mediciones ni condiciones de un alumno concreto. Sí registra la aptitud, porque la constancia se presenta en el gimnasio y alguien tiene que cargarla, pero sólo su vigencia.
**Fundamento.** Minimización: su función no lo requiere.
**Consecuencia asumida.** Ante un problema con un alumno, el administrador depende del entrenador. Es correcto.

### DD-23 · El fin de la asignación revoca también el acceso al histórico

**Fundamento.** El fundamento del acceso es la relación vigente, no el mérito histórico.
**Consecuencia asumida.** El indicador de carga por entrenador del panel del gimnasio se calcula sobre datos agregados y no requiere visibilidad individual del entrenador.

### DD-24 · El correo es único por gimnasio, no globalmente

**Fundamento.** El sistema sirve a varios gimnasios y una persona puede ser alumna de dos.
**Consecuencia asumida.** La identificación en el ingreso debe resolver a qué gimnasio corresponde la cuenta. Es una consecuencia real y hay que diseñarla.

### DD-25 · El entrenador es la única puerta

**Contexto.** El cliente indicó que el entrenador debe revisar toda rutina antes de que llegue al alumno. Esto contradice RF-025 (autoasignación) y la rama de RF-091 que facultaba al alumno a aprobar en ausencia de entrenador.
**Opciones.** (a) Eliminar la autoasignación. (b) **Conservarla como solicitud que no rige hasta ser revisada.** (c) Mantener la excepción para alumnos sin entrenador.
**Elegida.** (b), y se deroga la rama de RF-091.
**Fundamento.** (b) conserva la utilidad de que el alumno elija, elimina la excepción y deja una sola puerta. (c) reintroduce exactamente el caso que se quiso evitar.
**Consecuencia asumida, y es seria.** Todo alumno debe tener un entrenador vigente. Un alumno sin entrenador no puede recibir ninguna rutina nueva ni ninguna adaptación, y el sistema depende de que el entrenador revise a tiempo. Se mitiga con RF-112 y con el indicador E1b de D1, pero **el sistema queda expuesto a la congestión humana**. Riesgo registrado en D12/R-09.

### DD-26 · El equipamiento es del gimnasio, no del alumno

**Contexto.** ¿Contra qué conjunto de equipamiento se valida una prescripción? `[F: cliente, 2026-08-18: "el foco está en el usuario, pero lo mantiene el gimnasio porque está asociado al mismo — depende de qué máquinas tiene el gimnasio"]`
**Opciones.** (a) Lo declara el alumno. (b) **Lo declara el gimnasio.** (c) Ambos, con intersección.
**Elegida.** (b). El inventario del gimnasio es la única fuente; el alumno no declara equipamiento.
**Fundamento.** Con (a), la falta de equipamiento sólo puede advertir —el alumno podría tener acceso circunstancial a algo que no declaró— y la validación se vuelve blanda: el generador puede proponer ejercicios imposibles. Con (b) la validación se vuelve dura: si la máquina no está en el gimnasio, el ejercicio no se puede hacer. (c) duplica el mantenimiento y reintroduce la ambigüedad de (a).
**Qué se gana.** El catálogo prescribible queda determinado por gimnasio; la incompatibilidad por equipamiento pasa de advertencia a impedimento (RN-47); la puesta en contexto del alumno pierde un paso; y el administrador adquiere una función con efecto real sobre la prescripción en lugar de un rol puramente administrativo.
**Qué se sacrifica.** Un alumno que además entrena en su casa no puede recibir una rutina que use su propio equipamiento.
**Consecuencia operativa que hay que asumir.** Si el administrador declara mal el inventario, todo el catálogo prescribible del gimnasio es incorrecto y ninguna rutina generada sirve. El inventario es un dato crítico, no una configuración cosmética. Riesgo en D12/R-15.

### DD-27 · Objetivo y tipo de rutina comparten enumeración

**Contexto.** RF-083 exige verificar la correspondencia entre el tipo de la rutina y el objetivo del alumno, y las dos enumeraciones heredadas no coincidían.
**Elegida.** Una única enumeración de cuatro valores para ambos, con `ACONDICIONAMIENTO_GENERAL` compatible con cualquier objetivo.
**Fundamento.** Convierte la verificación de RF-083 en una comparación en lugar de un juicio, y la vuelve verificable sin ambigüedad.
**Consecuencia asumida.** `READAPTACION` queda fuera: no tiene objetivo de alumno equivalente y arrastra implicancias clínicas que el sistema declara fuera de alcance. Si el cliente lo requiere, hay que reabrir esta decisión y también el no-alcance de salud clínica de D1/§6.

### DD-28 · Un entrenador que entrena necesita otro entrenador

**Contexto.** DD-08 admite que un usuario tenga los roles de alumno y entrenador. Pero RN-22 impide autoasignarse y DD-25 exige un entrenador vigente para que una rutina rija. Combinadas, dejaban al entrenador sin poder entrenar, mientras D3 afirmaba lo contrario.
**Opciones.** (a) Permitir que se apruebe a sí mismo. (b) Permitir que el administrador apruebe en ese caso. (c) **Exigir que otro entrenador lo tome como alumno.**
**Elegida.** (c).
**Fundamento.** (a) abre un agujero en la única regla que el cliente declaró indelegable. (b) convierte al administrador en aprobador de prescripciones, para lo cual no tiene ni competencia ni acceso a la información clínica (DD-22).
**Consecuencia asumida, y hay que decirla.** En un gimnasio con un solo entrenador, ese entrenador no puede tener rutina vigente. El sistema lo señala al administrador como situación a resolver incorporando otro entrenador. Es una limitación real, no un descuido.

### DD-29 · El alta es por invitación

**Contexto.** `[F: cliente, 2026-08-18: "el sistema no es abierto para cualquier usuario; un gimnasio tiene que estar afiliado y avisarle al usuario para que se registre"]`
**Elegida.** La invitación nominal es la única vía de alta. La emite un administrador para cualquier rol, o un entrenador sólo con rol alumno, y determina el gimnasio y los roles del usuario resultante.
**Fundamento.** Resuelve de una sola vez cuatro problemas que estaban abiertos: cómo queda vinculado un usuario a un gimnasio, quién decide sus roles, cómo se impide el crecimiento espontáneo de usuarios, y quién responde por cada incorporación.
**Consecuencia asumida.** No hay adquisición espontánea de usuarios, que es exactamente lo que el modelo de negocio pide. Y el primer administrador de cada gimnasio no puede crearse por esta vía: ver DD-30.

### DD-30 · El aprovisionamiento está fuera de la aplicación

**Contexto.** Si el alta es por invitación, nadie dentro de un gimnasio nuevo puede emitir la primera.
**Opciones.** (a) Un rol superadministrador multi-gimnasio dentro de la aplicación. (b) **Una operación de aprovisionamiento del proveedor, externa a la aplicación.** (c) Autorregistro del primer administrador.
**Elegida.** (b), atómica: o quedan creados el gimnasio y su primer administrador, o no queda nada.
**Fundamento.** (a) reintroduce el superadministrador multi-gimnasio, que está fuera de alcance y arrastra un cuarto ámbito de permisos. (c) contradice DD-29.
**Consecuencia asumida.** El sistema tiene una operación que no es accesible desde ninguna pantalla y que hay que ejecutar y documentar aparte. Es el precio de que el modelo de alta sea cerrado y coherente.

### DD-31 · Los criterios de decisión son determinísticos y están escritos

**Contexto.** El cliente definió la inteligencia como núcleo. La versión anterior del corpus describía el ciclo de adaptación completo sin especificar ninguno de sus criterios, lo que lo volvía no implementable.
**Elegida.** El diagnóstico (RN-79a), los ajustes (RN-89a), la compatibilidad (RN-44a a RN-44d) y la derivación del tipo de rutina (RN-39a) se especifican como **tablas determinísticas y auditables**. Los componentes aprendidos actúan en la ordenación de alternativas de sustitución, en la estimación de riesgo y en la segmentación. Los generativos, en la interpretación de lenguaje natural y en la redacción.
**Fundamento.** Un criterio escrito es implementable, verificable, discutible con un entrenador real y defendible ante un tribunal. Un criterio aprendido sobre los datos que este proyecto puede reunir no sería ninguna de esas cuatro cosas. Y una regla explícita es un criterio de referencia contra el cual medir cualquier componente aprendido que se incorpore después (RF-073).
**Consecuencia asumida, y hay que declararla sin adornos.** El corazón del ciclo de adaptación es un motor de reglas, no un modelo aprendido. Presentarlo como "inteligencia artificial que decide" sin esta aclaración sería inexacto. Lo que el sistema tiene de aprendido está en la periferia del ciclo, y lo que tiene de generativo está en la conversación y en la redacción. Ver D12/R-16 y D13/N-15.

### DD-32 · Existe una vía de corrección tardía, nominal y auditada

**Contexto.** El plazo de corrección de 48 h dejaba sin remedio un error detectado después, y un valor equivocado contamina de forma permanente la carga máxima estimada, el diagnóstico y toda la cadena de adaptación.
**Opciones.** (a) Ninguna corrección tardía. (b) **Desbloqueo por el entrenador, una sola vez por sesión, con motivo auditado.** (c) Corrección libre sin plazo.
**Elegida.** (b), complementada con el recálculo del récord sobre el histórico completo (RN-71) y con la confirmación de valores atípicos en el momento del registro (RN-55a).
**Fundamento.** (a) preserva la estabilidad de los indicadores a costa de conservar datos que se sabe que son falsos. (c) elimina la estabilidad de los indicadores. La excepción nominal y auditada conserva ambas cosas.
**Consecuencia asumida.** El plazo de 48 h deja de ser absoluto. El límite de un desbloqueo por sesión es lo que impide que la excepción se convierta en la norma.

### DD-33 · El candidato se moldea; la propuesta, no

**Contexto.** El corpus dejaba que la rutina generada naciera PROPUESTA y le llegara al entrenador tal como salió del componente. El alumno que la había solicitado no tenía modo de intervenir sobre ella salvo pedir otra entera —consumiendo una rutina DESCARTADA y un aviso por RN-36a— o comentarla. Si el alumno no puede moldear lo que pidió, que la solicite él o que se la genere el sistema por su cuenta son la misma funcionalidad.
**Opciones.** (a) La rutina generada nace PROPUESTA, sin intervención del solicitante. (b) El alumno edita libremente su rutina propuesta. (c) **La generación produce un candidato ajustable, que sólo al confirmarse se convierte en rutina PROPUESTA.**
**Elegida.** (c), con las operaciones del alumno acotadas por D5/§5.2, revalidación en el acto (RN-126) y un tope de tres regeneraciones (RN-127).
**Fundamento.** (a) convierte la solicitud del alumno en un trámite y desaprovecha la ocasión más barata de acercar el plan a lo que la persona efectivamente va a hacer; además empuja toda inconformidad a la única salida disponible, que es pedir otra rutina entera. (b) contradice la matriz de D3 y, sobre todo, borra la frontera entre lo que el alumno elige y lo que el entrenador prescribe: series, repeticiones, descansos y cargas son prescripción. (c) conserva las dos cosas: el alumno decide **qué ejercicios** hace, el entrenador decide **cómo se hacen**, y la puerta de RN-35 sigue intacta porque nada rige sin revisión.
**Consecuencia asumida.** Aparece un objeto que no está en el ciclo de vida de D6 —el candidato— que no se persiste como rutina y muere si no se confirma; se declara explícitamente en D6/§1 para que nadie lo resuelva agregando un estado BORRADOR. Y el entrenador debe recibir en la revisión la diferencia entre lo que el componente produjo y lo que el alumno confirmó (RN-129, RF-120): sin eso revisaría como `GENERADA` una rutina que en realidad armó el alumno.
