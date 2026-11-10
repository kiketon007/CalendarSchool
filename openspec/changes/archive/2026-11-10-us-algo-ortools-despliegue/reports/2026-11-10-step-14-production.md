# Paso 14 - Despliegue y comprobación en producción

- Fecha: 2026-11-10
- Cambio: us-algo-ortools-despliegue (integrado con `us-algo-ortools-motor`, ver su informe `2026-11-10-step-12-production.md`)
- Agente: Claude

## Primer despliegue (motor por defecto)

Merge de la PR #179 en `main` (`a510e4c`); la CI y el despliegue (run 42809367453) terminaron con éxito. Del log del despliegue:

- **Migraciones** aplicadas a la base de producción: `20261109205641_schedule_engine_ortools` y `20261110093415_schedule_generation_engine`.
- **Motor de generación de horarios:** `BACKTRACKING` (la variable `SCHEDULE_ENGINE` no existía).
- **Imagen de OR-Tools:** `Built ScheduleOrToolsFunction/AssetImage` (23 s) y `Published` en el repositorio de assets del *bootstrap* de CDK (23 s). Era la primera imagen de contenedor que sube este proyecto y el *bootstrap* existente sirvió sin cambios.
- **Recursos creados:** el grupo de logs, el rol y la función `ScheduleOrToolsFunction` (`calendarschool-prod-schedule-ortools`), y la política del worker para invocarla. **Actualizados:** `ScheduleWorkerFunction` y `ApiFunction` (la variable `SCHEDULE_ENGINE` y el nombre de la función de OR-Tools para el worker). Pila `CalendarSchool-prod-App` sin retrocesos.
- **Smoke test** correcto, y `curl` propio a producción (ver el informe del otro cambio).

## Probar `ORTOOLS` en producción

Autorizado por la persona usuaria ("vamos a probar antes ORTOOLS en producción"):

1. `gh variable set SCHEDULE_ENGINE --env prod --repo kiketon007/CalendarSchool --body ORTOOLS` (12:07 UTC).
2. Despliegue a mano (`workflow_dispatch`) sobre `a510e4c`: run 42813052900, éxito. El log dice `Motor de generación de horarios: ORTOOLS`, solo se actualizaron las dos Lambdas de Node (la de OR-Tools no cambia, como estaba previsto) y el smoke test pasó. Duración total aproximada: 3 minutos.
3. **La persona usuaria generó un horario en https://app.calendarschools.es/horarios y confirmó que «las pruebas han ido bien».**

## Lo que NO se pudo verificar (cuando se escribió este informe)

> **Actualización:** después se pudo mirar CloudWatch y todo lo de esta sección quedó verificado: las tres generaciones con `ORTOOLS` terminaron con `engine: "ORTOOLS"`, sin `ortools_fallback`, y se midieron los tiempos y el arranque en frío. Ver `2026-11-10-step-14-production-mediciones.md`.

- **CloudWatch y la base de datos de producción:** la sesión de AWS de la máquina de desarrollo había caducado y los intentos de `aws login` terminaron en otra cuenta (`325060063583`, que no contiene el stack; producción es `411217898612`) o caducaron. No se miró, por tanto, el valor de `engine` en los eventos de la generación ni se descartó con los logs que hubiera un `ortools_fallback`. Si alguna vez interesa saberlo, `docs/despliegue/PUESTA_EN_MARCHA.md` («Cambiar el motor de generación de horarios») dice qué consultas hacer.
- **Tiempos reales** de la Lambda: arranque en frío de la imagen (1,07 GB sin comprimir) y duración de la búsqueda.

La conclusión es, por tanto, la de la persona usuaria sobre lo visible (el horario se genera con `ORTOOLS` activo), sin confirmación independiente de qué motor lo encontró.

## Estado en que queda producción

- Variable `SCHEDULE_ENGINE=ORTOOLS` en el entorno `prod` y desplegada. Para volver al motor por defecto: `gh variable set SCHEDULE_ENGINE --env prod --repo kiketon007/CalendarSchool --body BACKTRACKING` (o `gh variable delete …`) y volver a lanzar el despliegue.
- La persona usuaria decidió volver a `BACKTRACKING` tras las mediciones (ver el informe de mediciones).

## Resultado

- Paso 14: **PASA** en lo comprobado (despliegue, migraciones, imagen, Lambda, smoke, `curl` y prueba de la persona usuaria con `ORTOOLS`), con las limitaciones de verificación indicadas.
