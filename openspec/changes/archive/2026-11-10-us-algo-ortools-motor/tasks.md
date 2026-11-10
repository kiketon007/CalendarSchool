## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us-algo-ortools-motor` desde `main` actualizada. Debe llevar los artefactos de este cambio y la ficha enriquecida de US-ALGO-ORTOOLS en `docs/User_Stories_MVP.md`.
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene eso y `.claude/settings.json`, que debe estar en Sonnet con esfuerzo medio para implementar.

## 1. Python: el motor de CP-SAT

- [x] 1.1 Fijar la versión de `ortools`:
  - comprobar con `pip download` que la última estable tiene rueda para Windows x64 y Linux x64 con Python 3.12;
  - crear `solver-ortools/` con `requirements.txt`, `requirements-dev.txt` (`pytest` y `ruff`) y `pyproject.toml`;
  - instalarlo en local y anotar la versión en `design.md`, en «Open Questions».
- [x] 1.2 Tests que fallan de `cli.py`: una petición válida mínima responde `solved` con `version: 1`; `version: 2` y una forma inválida terminan con código distinto de 0, el error en `stderr` y `stdout` vacío. Implementar `cli.py` y el esqueleto de `solver.py`.
- [x] 1.3 Tests que fallan de HC1 y HC5 (exactamente un emplazamiento por unidad; dos lecciones de una clase con una sola celda libre cada día). Implementar las variables `x[u, p]` y sus restricciones.
- [x] 1.4 Tests que fallan de HC2 y HC7: un profesor en dos cursos con sesiones de 45 y 60 minutos que solo encaja sin solaparse, dos intervalos que solo se tocan, que se admiten, y un profesor con más de 1380 minutos de carga, que es `infeasible`, o con menos pero que obliga a elegir las sesiones más cortas. Implementar los intervalos opcionales con `AddNoOverlap` por profesor y día y la suma de minutos por profesor.
- [x] 1.5 Tests que fallan de HC3: un bloque que no cruza el recreo, un día con bloque y sin sueltas, y un máximo de 2 al día. Implementar `b_d` y `s_d`.
- [x] 1.6 Tests que fallan de los estados y el determinismo: `infeasible` (dos lecciones en el único emplazamiento del profesor), `timeout` con `limitSeconds` de 0,001 en un problema grande generado en el test, `cancelled` con `should_stop` y la misma respuesta en 3 ejecuciones. Implementar los parámetros y el callback.
- [x] 1.7 `ruff check`, `ruff format --check` y `pytest` en verde. Escribir `solver-ortools/README.md` con el contrato de la petición y de la respuesta.

## 2. Backend: dominio

- [x] 2.1 Ampliar `scheduleSolver.ts` con `ScheduleEngine` (`'BACKTRACKING' | 'ORTOOLS'`), `engine` en `solved` y `logContext` opcional en `SolveOptions`. Hacer que `BacktrackingSolver` devuelva `'BACKTRACKING'` (test que falla primero) y ajustar los dobles del motor en los tests de la aplicación.
- [x] 2.2 Extraer `solvedOutcomeOf` a `domain/schedule/solvedOutcome.ts`, sin cambiar el comportamiento:
  - test que falla de que, con los mismos emplazamientos y reloj, da lo mismo con los dos `engine`;
  - `BacktrackingSolver` pasa a usarla;
  - la tabla `schedule-generation.json`, la propiedad con semilla fija y la medición de la mejora siguen en verde.
- [x] 2.3 Test que falla de `isOrToolsResponse` en `domain/schedule/orToolsTransport.ts`: los cuatro estados, `version` distinta, falta un emplazamiento, uno repetido, índice fuera de rango, emplazamiento fuera del dominio y campos de otro tipo. Implementar el puerto `OrToolsTransport`, `toOrToolsRequest` (sin nombres ni preferidas, con su test) y la guarda.
- [x] 2.4 Tests que fallan de `OrToolsSolver` con `FakeOrToolsTransport`, temporizadores simulados y reloj contado:
  - `searchMs = min(60 000, restante)`;
  - `isCancelled` cada 500 ms;
  - cancelar aborta la señal y da `cancelled`;
  - `solved` válido da `engine: 'ORTOOLS'` con la mejora, `onPhase` y un único `onProgress(total, total)`.

  Implementar.
- [x] 2.5 Tests que fallan de la alternativa: rechazo da `invoke_error`, forma inválida da `bad_response`, horario que `validateSchedule` rechaza da `invalid_schedule`. Los tres terminan en `BACKTRACKING` con `warn ortools_fallback`, `reason`, `elapsed_ms` y el id de la generación, y `timeout` no tiene alternativa. Implementar.
- [x] 2.6 Tests que fallan del diagnóstico: `infeasible` con la causa `PROFESSOR_BUSY` del motor actual; `timeout` con `ortools_infeasible_undiagnosed`; `solved` con `engine: 'BACKTRACKING'` y `ortools_infeasible_contradicted`. Implementar.

## 3. Backend: aplicación

- [x] 3.1 Tests que fallan de `RunGeneration`:
  - pasa `logContext` con el id de la generación;
  - guarda `outcome.engine` en `replaceDraft`;
  - `SCHEDULE_GENERATION_STARTED` lleva el motor configurado;
  - `SCHEDULE_GENERATION_COMPLETED` lleva el del resultado.

  Implementar, con `engine` en el puerto `ScheduleDraft` y en la dependencia de `RunGeneration`.

## 4. Backend: infraestructura

- [x] 4.1 Crear la migración con `prisma migrate dev --create-only` (`ALTER TYPE "ScheduleEngine" ADD VALUE 'ORTOOLS'`), revisar que el SQL no toca los `CHECK` ni los índices parciales y aplicarla. Actualizar `schema.prisma` con su comentario.
- [x] 4.2 Test de integración que falla de `PrismaScheduleRepository.replaceDraft`: guarda el `engine` recibido, `ORTOOLS` y `BACKTRACKING`. Implementarlo sin el literal.
- [x] 4.3 Tests que fallan de `loadConfig`:
  - `SCHEDULE_ENGINE` por defecto, `ORTOOLS` y `FOO` (falla nombrando la variable y los valores);
  - `SCHEDULE_ORTOOLS_PYTHON` por defecto;
  - `scheduleOrToolsScript` resuelto desde `cwd`.

  Implementarlos y documentar las variables en `backend/.env.example`.
- [x] 4.4 Tests de integración que fallan de `ChildProcessOrToolsTransport` con el proceso real:
  - responde `solved` en un problema pequeño;
  - un `pythonPath` inexistente rechaza;
  - un código de salida distinto de 0 rechaza sin `stderr` en el mensaje;
  - abortar mata el proceso;
  - el tope de seguridad.

  Incluir la guarda que salta los tests sin `ortools` en local y falla en CI. Implementarlo.
- [x] 4.5 Test que falla de la composición: `BACKTRACKING` construye `BacktrackingSolver`, y `ORTOOLS` construye `OrToolsSolver` con el transporte y la alternativa. Implementarla en `composeApp.ts`.

## 5. Backend: equivalencia de los motores

- [x] 5.1 Test de integración `orToolsSolver.int.test.ts`, con el proceso hijo real y sin mejora, sobre `test-fixtures/schedule-generation.json`, el colegio de tamaño real y el colegio sin huecos libres: `validateSchedule` acepta los dos horarios en los resolubles, y los dos motores dicen `infeasible` en los imposibles.
- [x] 5.2 Medir los tiempos de los dos motores en esos problemas y anotarlos en `reports/YYYY-MM-DD-step-5-engine-comparison.md`. Es informativo.
- [x] 5.3 Test de integración `orToolsGeneration.int.test.ts` con la app real y el Python real. Con `SCHEDULE_ENGINE=ORTOOLS`: generar termina `COMPLETED` con un borrador `ORTOOLS` que pasa `validateSchedule`, y `SCHEDULE_GENERATION_STARTED` y `SCHEDULE_GENERATION_COMPLETED` llevan el motor. Con un transporte que retrasa 2,5 s la respuesta de Python: `heartbeat_at` avanza mientras busca y cancelar termina `CANCELLED` sin esperar. Para ello `composeApp` admite sustituir el motor en los tests (`scheduleSolver`), como ya admite el verificador de captcha, y `realApp` acepta el motor y el solver.

## 6. CI

- [x] 6.1 En el job `quality` de `.github/workflows/ci.yml`: `actions/setup-python` (3.12, con caché de `pip`), `pip install -r solver-ortools/requirements-dev.txt`, `ruff check`, `ruff format --check` y `pytest solver-ortools`, antes de `npm test`.
- [x] 6.2 Comprobar en la PR que el job ejecuta `pytest` y los tests de integración de OR-Tools sin saltarlos.

## 7. Revisar y actualizar los tests existentes (MANDATORY)

- [x] 7.1 Revisar los tests que dependen de la forma de `solved`, de `replaceDraft`, de los eventos de la generación y de la configuración, y ajustarlos: `backtrackingSolver.test.ts`, `scheduleImprover.test.ts`, `runGeneration.test.ts`, los repositorios de horarios, `config.test.ts`, `composeApp` y los int de la generación.

## 8. Ejecutar los tests y verificar el estado de la base de datos (MANDATORY)

- [x] 8.1 Vaciar la base de test y capturar la línea base de recuentos (`calendarschool` y `calendarschool_test`).
- [x] 8.2 Ejecutar `pytest` y los tests de los módulos cambiados.
- [x] 8.3 Ejecutar `npm test` con cobertura (90 % backend, 80 % frontend), `npm run lint` y `typecheck`.
- [x] 8.4 Comprobar que la base queda como en la línea base y restaurarla si no.
- [x] 8.5 Crear `reports/YYYY-MM-DD-step-8-unit-test-and-db-verification.md` y marcar el paso solo con el informe creado.

## 9. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 9.1 Arrancar el backend con el lanzador en memoria y `SCHEDULE_ENGINE=ORTOOLS`, preparar por la API un colegio listo y generar. Comprobar:
  - `GET` de la generación termina `COMPLETED`;
  - el borrador existe y en la base tiene `engine` `ORTOOLS`;
  - el log lleva los eventos con `engine`;
  - `heartbeat_at` avanzó mientras CP-SAT buscaba.
- [x] 9.2 Probar la cancelación y la alternativa:
  - generar de nuevo y cancelar con `DELETE` mientras busca: `CANCELLED` en unos 2 s y el proceso de Python ya no existe;
  - con `SCHEDULE_ORTOOLS_PYTHON` apuntando a un ejecutable inexistente: borrador `BACKTRACKING` y log `ortools_fallback`;
  - sin `SCHEDULE_ENGINE`: borrador `BACKTRACKING`.
- [x] 9.3 Restaurar la base, parar el backend, comprobar que el puerto 3000 queda libre y que no queda ningún proceso de Python, y crear `reports/YYYY-MM-DD-step-9-curl-manual-testing.md`.

## 10. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 10.1 Sin cambios de interfaz: ejecutar en modo headless la suite completa con el motor por defecto (`npm run test:e2e`; en dos tandas si falta memoria), para comprobar que no hay regresiones, y crear `reports/YYYY-MM-DD-step-10-e2e-cypress.md`.

## 11. Documentación técnica (MANDATORY)

- [x] 11.1 Actualizar con la skill `update-docs`:
  - `backend/CLAUDE.md`: los dos motores, `OrToolsSolver`, el transporte, la alternativa, el diagnóstico, `solvedOutcomeOf` y las variables;
  - `README.md`: Python 3.12 y `pip install -r solver-ortools/requirements-dev.txt` en la instalación, y `pytest` en los comandos;
  - el `CLAUDE.md` raíz: comandos y estado actual;
  - `docs/Modelo_de_Datos/MODELO_DATOS.md`: `ORTOOLS` en el enum;
  - `docs/US-ALGO_GenerarHorarios_ESPECIFICACION.md`: el modelo de CP-SAT;
  - `ARQUITECTURA_COMPLETA.md` (sección 0) y los diagramas C4: el motor de Python como proceso hijo en local;
  - la ficha de US-ALGO-ORTOOLS: este cambio, implementado.
- [x] 11.2 Verificar que `.claude/settings.json` está en Sonnet con esfuerzo medio.
- [x] 11.3 Verificar con `openspec validate us-algo-ortools-motor --strict` que el cambio es válido.

## 12. Despliegue y comprobación en producción

- [x] 12.1 Repetir `npm run lint`, `typecheck`, `api:types:check`, `ruff` y `pytest`, cada uno con su código de salida. Abrir la PR con los grupos 0–11 tras la confirmación de la persona usuaria. Tras integrarla, verificar el CI del push a `main`, el despliegue y que la migración se aplicó.
- [x] 12.2 Comprobar en producción con `curl` que `/api/health` responde bien y que `POST /api/schedule/generate` sin token responde `401`. La persona usuaria genera un horario y comprueba que nada cambia, con el motor por defecto.
- [x] 12.3 Documentar el resultado en `reports/YYYY-MM-DD-step-12-production.md`.
