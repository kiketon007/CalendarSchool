## Why

El motor de US-ALGO-RUN para en el primer horario que cumple las restricciones duras (HC1–HC8) e ignora las preferencias: las franjas preferidas que el administrador marca desde US19_d llegan en la foto del problema, pero nadie las usa, y los profesores pueden acabar con huecos o una asignatura con sesiones en días seguidos. US-ALGO-RUN_b (`docs/User_Stories_MVP.md`, ficha enriquecida el 2026-11-06) lo cierra: tras encontrar un horario válido, la generación lo **mejora** con las restricciones blandas mientras quede tiempo, con una puntuación desglosada que se puede explicar, y el administrador decide en cada generación si quiere mejorarlo. Lo justifica el PRD (§1 y §2: «generación automática de horarios semanales coherentes para alumnado y profesorado»; §3.5: las restricciones «parametrizan cómo genera el algoritmo los horarios», y las franjas preferidas son una de ellas).

## What Changes

- **Puntuación del horario** (`scoreSchedule`, función pura del dominio, reutilizable por US-ALGO-ORTOOLS): desglose por criterio —SC4 sesiones fuera de sus franjas preferidas, SC1 huecos de los profesores y SC3 pares de días seguidos de una misma asignatura— y una penalización ponderada (pesos fijos 10, 3 y 1; cuanto menos, mejor) junto con la del horario antes de mejorar.
- **Fase 2 del motor:** tras la fase 1 actual (sin cambios), una búsqueda local determinista (mover una unidad dentro de su dominio o intercambiar dos unidades de la misma clase y tamaño) que solo acepta cambios que cumplen HC1–HC8, con comprobación incremental, y bajan la penalización. Para al converger, al agotar el tiempo (60 s o lo que quede de `SCHEDULE_MAX_SECONDS`) o al cancelar; valida el resultado con `validateSchedule`.
- **Un horario válido no se pierde por mejorarlo:** agotar el tiempo o cancelar durante la mejora termina en `COMPLETED` con el mejor horario encontrado; `TIMEOUT` y `CANCELLED` siguen significando que la fase 1 no llegó a un horario.
- **La mejora es opcional:** `POST /api/schedule/generate` acepta un cuerpo opcional `{ improve?: boolean }` (por defecto `true`; un valor no booleano es `400 VALIDATION_ERROR`) y el panel de `/horarios` muestra la casilla «Mejorar el horario con las preferencias», marcada por defecto.
- **Progreso en dos fases:** la generación expone `phase` (`SEARCHING`, `IMPROVING`), la puntuación actual y si se detuvo la mejora; el panel dice «Buscando un horario válido…» o «Mejorando el horario…» con la penalización, y el botón de cancelar pasa a «Detener y guardar el horario» durante la mejora.
- **El desglose viaja con el horario:** se guarda en el horario y lo muestran el resumen de la generación y la cabecera de la página del horario (borrador, oficial y anteriores); los horarios generados antes no lo tienen y no muestran nada.
- **Migración:** `schedules.score` (`jsonb`), `schedule_generations.improve` (`boolean`, por defecto `true`), `schedule_generations.phase` (enum `GenerationPhase`) y `schedule_generations.score` (`jsonb`).
- **Contrato:** esquemas nuevos `ScheduleScore`, `GenerationPhase` y `StartGenerationRequest`; `Generation` gana `improve`, `phase`, `score` e `improvementCancelled`; `ScheduleSummary` y `ScheduleDetail` ganan `score`; el `POST` de la generación gana su respuesta `400`. Sin endpoints ni códigos de error nuevos.

**Fuera de alcance:** pesos configurables; SC2 (aulas: no existen en el producto); recordar la casilla o guardarla como ajuste del colegio; mejorar un borrador ya generado sin volver a generar; un presupuesto de mejora elegido por el usuario; perturbaciones o reinicios para salir de óptimos locales; mover unidades entre clases distintas; restricciones blandas de las clases (solo los huecos de los profesores); comparar puntuaciones entre horarios; mostrar el desglose en el resumen del oficial de `/horarios` o en la exportación.

## Capabilities

### New Capabilities

- `schedule-score`: la puntuación de un horario (criterios SC1, SC3 y SC4, pesos y penalización), su almacenamiento con el horario y su lectura en `ScheduleSummary`/`ScheduleDetail`, y el desglose en la página del horario.

### Modified Capabilities

- `schedule-solver`: la entrada lleva las franjas preferidas válidas de cada lección y el motor añade la fase de mejora (movimientos, comprobación incremental, parada, validación final, opciones `improve`/`improveMs`/`onPhase`/`onScore` y el resultado `solved` con `score` e `improvement`).
- `schedule-generation`: el cuerpo opcional `improve` al iniciar, las columnas `improve`, `phase` y `score` de la generación, `COMPLETED` al agotar el tiempo o cancelar durante la mejora, el progreso en dos fases, el evento de log ampliado y, en el panel, la casilla, las dos fases, «Detener y guardar el horario» y el desglose del resumen.

## Impact

- **Backend:** `domain/schedule/` (`scheduleSolver.ts`, `generationInput.ts`, `scheduleScore.ts` y `scheduleImprover.ts` nuevos, `backtrackingSolver.ts`, `generation.ts`, `generationRepository.ts`, `scheduleRepository.ts`, `scheduleRead.ts`), `application/schedule/` (`startGeneration.ts`, `runGeneration.ts`, `generationView.ts`, la lectura de horarios), `infrastructure/prisma/` (repositorios de generación, de escritura y de lectura de horarios), `presentation/schedule/scheduleRouter.ts` (parser del cuerpo) y una migración de Prisma.
- **Contrato y modelo:** `docs/api-spec.yml` y los tipos generados del frontend; `docs/Modelo_de_Datos/MODELO_DATOS.md` (cuatro columnas y un enum).
- **Frontend:** `ScheduleGenerationPanel` (casilla, fases, botón y resumen), componente nuevo `ScheduleScoreSummary`, `ScheduleDraftPage` (cabecera), los servicios de generación y de horarios (con un guardia `isScheduleScore`) y textos en `es.json`/`en.json`; E2E ampliado.
- **Infraestructura y dependencias:** sin cambios (la generación sigue acotada por `SCHEDULE_MAX_SECONDS` ≤ 240 s, por debajo de los 5 minutos del worker).
- **Documentación:** `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `README.md`, `CLAUDE.md` (estado actual), `ARQUITECTURA_COMPLETA.md` (sección 0), `docs/US-ALGO_GenerarHorarios_ESPECIFICACION.md` (SC1–SC4 tal como se implementan), la ficha y el resumen de la épica.
- **Tamaño:** es un cambio grande (13 puntos) pero una sola historia, por decisión de la persona usuaria; se aplica en varios lotes.
