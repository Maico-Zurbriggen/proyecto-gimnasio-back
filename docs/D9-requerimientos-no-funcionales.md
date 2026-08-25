# D9 — Requerimientos no funcionales

|                |            |
| -------------- | ---------- |
| **Versión**    | 2.0        |
| **Fecha**      | 2026-08-18 |
| **Estado**     | Normativo  |
| **Depende de** | D1, D5, D8 |

Sólo se incluyen requerimientos con criterio de verificación concreto. Un requerimiento no funcional sin forma de comprobarlo es una aspiración.

**Cambios de la v1.0:** RNF-24 y RNF-25 llevan tamaño de muestra declarado, sin el cual no eran verificables · RNF-15 fija un criterio comprobable en lugar de un adjetivo · RNF-37 a RNF-40 cubren invitación, inventario, reevaluación masiva y desbloqueo.

---

## 1. Rendimiento

| ID     | Requerimiento                      | Criterio de verificación                                                                                              |
| ------ | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| RNF-01 | Lectura de las vistas principales  | Percentil 95 por debajo de 500 ms con 300 alumnos y 150.000 registros de serie cargados                               |
| RNF-02 | Panel de progreso del alumno       | Carga completa en menos de 1,5 s con seis meses de historial                                                          |
| RNF-03 | Cartera del entrenador             | Se ordena y presenta en menos de 1,5 s con 50 alumnos                                                                 |
| RNF-04 | Generación de una rutina           | Resultado presentado en menos de 20 s, incluida la validación; superado ese tiempo se recurre a la vía determinística |
| RNF-05 | Diagnóstico y estimación de riesgo | Se ejecutan fuera del camino de la petición del usuario. Ninguna vista queda a la espera de su cálculo                |

## 2. Usabilidad

| ID     | Requerimiento                                                                                               | Criterio de verificación                                                                                                            |
| ------ | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| RNF-06 | La sesión de entrenamiento es plenamente usable en pantalla de 360 px de ancho                              | Recorrido completo de registro de una sesión de 5 ejercicios ejecutado en un dispositivo de ese ancho sin desplazamiento horizontal |
| RNF-07 | Registrar una serie con los valores precargados correctos requiere como máximo dos interacciones            | Medido sobre el recorrido de RNF-06                                                                                                 |
| RNF-08 | El alumno completa su incorporación en tres pasos como máximo, de los cuales sólo el primero es obligatorio | Verificado sobre FL-01                                                                                                              |
| RNF-09 | Ninguna vista presenta cero, vacío ni un valor por defecto cuando la causa es falta de datos                | Revisión sistemática de todas las vistas con un alumno sin historial. Ver D10/§A                                                    |

## 3. Robustez y continuidad

| ID     | Requerimiento                                                                             | Criterio de verificación                                                                                                     |
| ------ | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| RNF-10 | La sesión en curso conserva un estado local y reintenta el envío ante pérdida de conexión | Prueba con red interrumpida durante el registro: ningún dato ingresado se pierde                                             |
| RNF-11 | Ningún fallo de un servicio externo produce un error visible al usuario                   | Prueba con el servicio de generación inaccesible: los flujos FL-04 y FL-09 se completan por la vía determinística            |
| RNF-12 | La no ejecución de los procesos diferidos no degrada ninguna otra funcionalidad           | Prueba con la base sin diagnósticos ni estimaciones: todas las vistas funcionan y declaran la información como no disponible |
| RNF-13 | El envío repetido de una misma operación de registro no produce duplicados                | Envío del mismo registro de serie tres veces: un único registro resultante                                                   |

## 4. Seguridad

| ID     | Requerimiento                                                                                                                                                                                                  | Criterio de verificación                                                                                                                                  |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RNF-14 | Toda operación sobre un recurso de un alumno concreto rechaza a un actor no autorizado                                                                                                                         | Una prueba automatizada por cada operación con identificador de alumno, que verifica el rechazo con un actor autenticado pero sin relación con el recurso |
| RNF-15 | Las contraseñas se almacenan mediante una función de derivación de clave con sal única por usuario y coste configurable, calibrada para que una verificación tarde al menos 200 ms en el entorno de producción | Medición del tiempo de verificación e inspección del almacenamiento: ninguna contraseña recuperable, ninguna sal compartida                               |
| RNF-16 | Las credenciales de sesión no son accesibles desde el código de la página                                                                                                                                      | Inspección                                                                                                                                                |
| RNF-17 | Los intentos de autenticación están limitados por origen y por período                                                                                                                                         | Prueba: el sexto intento en un minuto desde un mismo origen es rechazado                                                                                  |
| RNF-18 | Las invocaciones a servicios externos de generación están limitadas por usuario y por período                                                                                                                  | Prueba: superado el límite, se recurre a la vía determinística                                                                                            |
| RNF-19 | Ningún registro de diagnóstico contiene credenciales, contraseñas ni datos de salud                                                                                                                            | Inspección de los registros producidos durante el recorrido completo                                                                                      |
| RNF-20 | El acceso del entrenador cesa en el instante en que finaliza la asignación                                                                                                                                     | Prueba: operación iniciada antes y confirmada después del fin de la asignación, rechazada                                                                 |

## 5. Privacidad

| ID     | Requerimiento                                                                                                 | Criterio de verificación                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| RNF-21 | Los datos de condiciones físicas, aptitud y mediciones sólo se tratan con consentimiento explícito registrado | Prueba: sin consentimiento registrado, las operaciones correspondientes son rechazadas                                           |
| RNF-22 | La baja de cuenta produce anonimización efectiva en 7 días o menos                                            | Prueba: tras el proceso, ningún dato identificatorio del usuario es recuperable, y sus sesiones siguen contando en los agregados |
| RNF-23 | El sistema no solicita ni almacena documento de identidad ni domicilio                                        | Inspección del modelo de datos                                                                                                   |

## 6. Calidad de los componentes inteligentes

| ID     | Requerimiento                                                                                         | Criterio de verificación                                                                                                                                                                                                                                                                                                                                              |
| ------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RNF-24 | Ningún texto generado contiene un valor numérico ausente de sus datos de entrada                      | Verificación automática sobre **50 textos generados** de cada tipo narrativo: tasa de valores no presentes igual a cero                                                                                                                                                                                                                                               |
| RNF-25 | Toda rutina generada es válida por construcción                                                       | Sobre **200 rutinas generadas** cubriendo los cuatro tipos y al menos tres inventarios distintos: 100% con ejercicios existentes en el catálogo prescribible, 100% sin ejercicios incompatibles, 100% dentro de los rangos de la tabla de derivación del tipo, 100% con la cobertura mínima de patrones o con la declaración explícita de qué patrón no pudo cubrirse |
| RNF-26 | Los componentes de recomendación y estimación se evalúan contra un criterio de referencia simple      | Existe un procedimiento reproducible que produce las métricas de ambos y las conserva. Que el criterio simple resulte mejor es un resultado admisible y debe informarse                                                                                                                                                                                               |
| RNF-27 | Toda salida de un componente inteligente es reproducible a partir de lo registrado                    | Dado un resultado almacenado, su versión de componente y su contexto de entrada permiten reejecutar y obtener el mismo resultado                                                                                                                                                                                                                                      |
| RNF-28 | Las estimaciones producidas sobre datos simulados están identificadas como tales en toda presentación | Inspección de las vistas de riesgo y de analítica                                                                                                                                                                                                                                                                                                                     |

## 7. Mantenibilidad y entrega

| ID     | Requerimiento                                                                                                              | Criterio de verificación                            |
| ------ | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| RNF-29 | La lógica de cálculo de indicadores y la de construcción y validación de rutinas están cubiertas por pruebas automatizadas | Cobertura igual o superior al 70% en esos módulos   |
| RNF-30 | Toda incorporación de cambios exige la ejecución exitosa de la verificación automatizada                                   | Configuración del repositorio                       |
| RNF-31 | Un integrante que clona el repositorio tiene el sistema en ejecución local en menos de 10 minutos                          | Prueba con un integrante que no lo haya hecho antes |
| RNF-32 | Los cambios de estructura de datos están versionados desde el inicio                                                       | Inspección del repositorio                          |

## 8. Compatibilidad y accesibilidad

| ID     | Requerimiento                                                                                                          | Criterio de verificación                                                 |
| ------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| RNF-33 | Funciona en las dos últimas versiones de los navegadores mayoritarios, de escritorio y móviles                         | Recorrido de FL-05 y FL-02 en cada uno                                   |
| RNF-34 | Contraste de texto conforme al nivel AA, navegación completa por teclado y etiquetas en todos los campos de formulario | Auditoría automatizada más recorrido manual por teclado de FL-02 y FL-05 |
| RNF-35 | La representación muscular transmite su información sin depender exclusivamente del color                              | El detalle numérico es accesible por interacción y por texto alternativo |

## 9. Escalabilidad

| ID     | Requerimiento                                                                                                                                              | Criterio de verificación                                                |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| RNF-36 | El diseño soporta 5.000 alumnos sin rediseño estructural                                                                                                   | Prueba de carga con ese volumen sembrado, cumpliendo RNF-01             |
| RNF-39 | Un cambio del inventario del gimnasio reevalúa todas las rutinas vigentes afectadas en menos de 60 s con 500 alumnos, sin bloquear ninguna sesión en curso | Prueba: retirar un equipamiento usado por el 30% de las rutinas y medir |

## 10. Alta y arranque

| ID     | Requerimiento                                                                                                           | Criterio de verificación                                                                                               |
| ------ | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| RNF-37 | Ninguna cuenta puede crearse sin una invitación vigente                                                                 | Prueba: todo intento de alta sin invitación, con invitación caducada, revocada o ya usada, es rechazado                |
| RNF-38 | El aprovisionamiento de un gimnasio es atómico: o quedan creados el gimnasio y su primer administrador, o no queda nada | Prueba con fallo inducido a mitad del proceso: ningún gimnasio sin administrador en la base                            |
| RNF-40 | El desbloqueo de una sesión es irrepetible y siempre auditado                                                           | Prueba: el segundo desbloqueo de la misma sesión es rechazado, y el primero deja registro con actor, motivo e instante |

---

## No incluidos deliberadamente

Se nombran para dejar constancia de que fueron considerados y descartados por alcance, lo que vale más que implementarlos a medias:

acuerdo de nivel de servicio de disponibilidad · internacionalización · funcionamiento sin conexión completo · escalado horizontal · alta disponibilidad · doble factor de autenticación · cifrado a nivel de campo · auditoría de seguridad externa · gestión centralizada de secretos.
