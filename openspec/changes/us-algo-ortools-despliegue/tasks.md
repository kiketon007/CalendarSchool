## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us-algo-ortools-despliegue` desde `feature/us-algo-ortools-motor` (no desde `main`: la persona usuaria no integra hasta tener los dos cambios), con los artefactos de este cambio.
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene eso y `.claude/settings.json`, que debe estar en Sonnet con esfuerzo medio para implementar.

## 1. Python: la Lambda

- [x] 1.1 Tests que fallan de `handler.py`: misma respuesta que `solve` para una petición válida y `ValueError` con `version: 2`. Implementar `handler.py` reutilizando `cli.validate`.
- [x] 1.2 Test que falla de que el `Dockerfile` parte de `public.ecr.aws/lambda/python:3.12`, instala solo `requirements.txt` y fija `handler.handler`, y de que `.dockerignore` excluye `.venv`, `tests`, las cachés y `requirements-dev.txt`. Crear los dos ficheros.
- [x] 1.3 `ruff check`, `ruff format --check` y `pytest` en verde. Documentar la Lambda en `solver-ortools/README.md`.

## 2. Contrato

- [x] 2.1 Añadir en `docs/api-spec.yml` el esquema `ScheduleEngine` y `engine` en `Generation` (obligatorio, también en sus ejemplos).
- [x] 2.2 Fijar el contrato en `frontend/src/api/schema.test.ts` (test de tipos que falla), regenerar con `npm run api:types -w frontend` y dejar `typecheck` en verde.

## 3. Backend: dominio

- [x] 3.1 Ampliar los tipos: `SolveOptions.onEngine`, `engine` en `Generation`, en `GenerationRepository.insert` y en el progreso de `saveProgress`. Ajustar los dobles de los tests.
- [x] 3.2 Tests que fallan de `onEngine` en `OrToolsSolver`: se llama con `'BACKTRACKING'` antes del motor actual en la alternativa y en el diagnóstico, una sola vez y antes de su primer `onProgress`, y no se llama si OR-Tools resuelve. Implementarlo en `runFallback`.

## 4. Backend: aplicación

- [x] 4.1 Test que falla de `StartGeneration`: pasa el motor configurado a `insert`. Implementarlo.
- [x] 4.2 Tests que fallan de `RunGeneration`: el motor empieza siendo el de la fila, `onEngine` lo cambia y se escribe con el siguiente progreso. Implementarlo.
- [x] 4.3 Test que falla de `toGenerationView` con `engine`. Implementarlo.

## 5. Backend: infraestructura

- [x] 5.1 Crear la migración con `prisma migrate dev --create-only` (`schedule_generations.engine NOT NULL DEFAULT 'BACKTRACKING'`), revisar el SQL y aplicarla. Actualizar `schema.prisma`.
- [x] 5.2 Tests de integración que fallan de `PrismaGenerationRepository`: `insert` guarda el motor; `saveProgress` lo escribe; las lecturas lo devuelven; una fila antigua tiene `BACKTRACKING`. Implementarlos.
- [x] 5.3 Test de integración que falla de `PrismaScheduleRepository.replaceDraft`: deja en la generación el motor del borrador. Implementarlo.
- [x] 5.4 Tests que fallan de `LambdaOrToolsTransport` con un cliente simulado: éxito con la invocación esperada, `FunctionError` sin su texto en el mensaje, `StatusCode` distinto de 200, JSON roto, abortar con la señal pasada a `send` y `maxAttempts` 1. Implementarlo en `infrastructure/aws/`.
- [x] 5.5 Tests que fallan de `loadConfig` (`SCHEDULE_ORTOOLS_FUNCTION_NAME` opcional y vacía inválida) y de `createScheduleSolver` (transporte de Lambda con el nombre y proceso hijo sin él). Implementarlos y documentar la variable en `backend/.env.example`.

## 6. Backend: presentación

- [x] 6.1 Tests de integración HTTP en `scheduleGeneration.int.test.ts`: `engine` en el `202` y en el `GET` de la generación, con los dos motores. Ajustar las vistas.

## 7. Frontend

- [x] 7.1 Test que falla de `scheduleGenerationService`: acepta `engine` y devuelve `unavailable` sin él o con un valor desconocido. Implementarlo con la lista cerrada atada al contrato.
- [x] 7.2 Tests que fallan de `ScheduleGenerationPanel`:
  - con `ORTOOLS` en `SEARCHING`: barra sin `aria-valuenow` y con nombre, sin «N de M sesiones», con «Cancelar» y `axe` limpio;
  - al pasar a `BACKTRACKING` vuelve la barra con valor;
  - con `BACKTRACKING` nada cambia.

  Implementarlo y añadir los textos a `es.json` y `en.json`.

## 8. Infraestructura

- [x] 8.1 Tests que fallan de la plantilla:
  - tres funciones, la de OR-Tools con `PackageType: Image`, 2048 MB, 300 s y sin variables de entorno;
  - la política del worker para invocarla, limitada a su ARN, y la de la API sin ella;
  - `SCHEDULE_ENGINE` en la API y en el worker;
  - `SCHEDULE_ORTOOLS_FUNCTION_NAME` en el worker.

  Implementar `ScheduleOrToolsFunction` en `appStack.ts`.
- [x] 8.2 Tests que fallan del contexto `scheduleEngine`: por defecto `BACKTRACKING`, `ORTOOLS`, y un valor inválido que hace fallar la síntesis. Implementarlo en `bin/app.ts` y en `AppStackProps`.
- [x] 8.3 Pasar el contexto en `.github/workflows/deploy.yml` desde `vars.SCHEDULE_ENGINE` (con `BACKTRACKING` por defecto) y documentarlo en su encabezado.
- [x] 8.4 Construir la imagen en local con Docker (`docker build --platform linux/amd64 solver-ortools`), si está disponible, y comprobar que `handler.handler` responde a una petición con el emulador del runtime de Lambda (`docker run` y `curl` al puerto 9000). Si Docker no está disponible, dejarlo anotado en el informe del paso 9.

## 9. Revisar y actualizar los tests existentes (MANDATORY)

- [x] 9.1 Revisar y ajustar los tests que dependen de la forma de `Generation`:
  - backend: dobles de `RunGeneration` y `StartGeneration`, repositorios, rutas y los int de la generación y de la confirmación;
  - frontend: fixtures de `ScheduleGenerationPanel`, `ScheduleReadinessPage` y el servicio;
  - las specs E2E que simulan respuestas de la generación con `cy.intercept`.

## 10. Ejecutar los tests y verificar el estado de la base de datos (MANDATORY)

- [x] 10.1 Vaciar la base de test y capturar la línea base de recuentos (`calendarschool` y `calendarschool_test`).
- [x] 10.2 Ejecutar `pytest` y los tests de los módulos cambiados.
- [x] 10.3 Ejecutar `npm test` con cobertura (90 % backend, 80 % frontend), `npm run lint`, `typecheck` y `api:types:check`.
- [x] 10.4 Comprobar que la base queda como en la línea base y restaurarla si no.
- [x] 10.5 Crear `reports/YYYY-MM-DD-step-10-unit-test-and-db-verification.md` y marcar el paso solo con el informe creado.

## 11. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 11.1 Arrancar el backend con el lanzador en memoria y `SCHEDULE_ENGINE=ORTOOLS` (proceso hijo), preparar por la API un colegio listo y generar. Comprobar:
  - el `202` y el `GET` llevan `engine: "ORTOOLS"`;
  - con el arranque de Python ralentizado, mientras busca, `GET` sigue con `ORTOOLS`;
  - al terminar, la generación y el horario llevan `ORTOOLS`.
- [x] 11.2 Con un Python inexistente: el `GET` pasa a `engine: "BACKTRACKING"` (alternativa) y el borrador también. Sin `SCHEDULE_ENGINE`: `BACKTRACKING` desde el `202`.
- [x] 11.3 Restaurar la base, parar el backend, comprobar que el puerto 3000 queda libre y que no queda ningún proceso de Python, y crear `reports/YYYY-MM-DD-step-11-curl-manual-testing.md`.

## 12. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 12.1 Ajustar las specs que simulan la generación con `cy.intercept` (si las hay) para que lleven `engine`, y añadir a `scheduleGeneration.cy.ts` un caso con una generación `ORTOOLS` simulada en `SEARCHING` que muestra la barra sin valor. Ejecutar la spec y la suite completa en modo headless (`npm run test:e2e`) y crear `reports/YYYY-MM-DD-step-12-e2e-cypress.md`.

## 13. Documentación técnica (MANDATORY)

- [x] 13.1 Actualizar con la skill `update-docs`:
  - `backend/CLAUDE.md`: el transporte de Lambda, `onEngine` y `engine` de la generación;
  - `frontend/CLAUDE.md`: la barra indeterminada;
  - `solver-ortools/README.md`: la Lambda y su imagen;
  - `docs/despliegue/PUESTA_EN_MARCHA.md`: Docker para un despliegue manual de CDK (la imagen de OR-Tools se construye al desplegar);
  - `README.md`, el `CLAUDE.md` raíz (infraestructura: tres Lambdas) y `MODELO_DATOS.md` (`schedule_generations.engine`);
  - `ARQUITECTURA_COMPLETA.md` (sección 0) y los diagramas C4 (`DIAGRAMA_C4.md` y el DSL), con la Lambda de OR-Tools en la parte implementada;
  - la ficha de US-ALGO-ORTOOLS: los dos cambios implementados.
- [x] 13.2 Documentar en `docs/despliegue/PUESTA_EN_MARCHA.md` una sección «Cambiar el motor de generación de horarios» que explique que el motor se elige con la **variable de entorno `SCHEDULE_ENGINE` del entorno `prod` de GitHub** (no con código ni con `cdk.json`), con los pasos:
  - **Valores:** `BACKTRACKING` (por defecto; también si la variable no existe) u `ORTOOLS`. Cualquier otro valor hace fallar el despliegue en la síntesis de CDK, sin tocar producción.
  - **Desde la web:** *Settings* → *Environments* → `prod` → *Environment variables* → *Add variable* (o editarla), nombre `SCHEDULE_ENGINE` y valor `ORTOOLS`.
  - **Desde la terminal:** `gh variable set SCHEDULE_ENGINE --env prod --body ORTOOLS` (y `gh variable list --env prod` para comprobarla).
  - **Aplicarlo:** el cambio no tiene efecto hasta el siguiente despliegue: *Actions* → *Deploy* → *Run workflow* con el commit de `main` que ya está desplegado (o el siguiente push a `main`). Solo cambian las variables de entorno de las dos Lambdas de Node; la Lambda de OR-Tools ya existe.
  - **Comprobarlo:** tras generar un horario, `SCHEDULE_GENERATION_STARTED` y `SCHEDULE_GENERATION_COMPLETED` llevan `engine: "ORTOOLS"` en los logs de CloudWatch del worker, y no hay `ortools_fallback` (si lo hay, OR-Tools falló y se usó el motor actual); en la base, `schedules.engine` y `schedule_generations.engine`.
  - **Volver atrás:** poner `BACKTRACKING` o borrar la variable (`gh variable delete SCHEDULE_ENGINE --env prod`) y volver a desplegar.
  - **Requisito:** quien la cambie necesita permisos de administración del repositorio, y el entorno `prod` solo despliega desde `main`.

  Enlazar la sección desde el encabezado de `deploy.yml`, desde `backend/CLAUDE.md` y desde la ficha de US-ALGO-ORTOOLS.
- [x] 13.3 Verificar que `.claude/settings.json` está en Sonnet con esfuerzo medio.
- [x] 13.4 Verificar con `openspec validate us-algo-ortools-despliegue --strict` que el cambio es válido.

## 14. Entrega (sin integrar en `main`)

- [x] 14.1 Repetir `npm run lint`, `typecheck`, `api:types:check`, `ruff` y `pytest`, cada uno con su código de salida. Hacer commit y subir la rama solo si la persona usuaria lo pide. **No abrir PR**: la integración de los dos cambios en `main`, el despliegue y la comprobación en producción con `ORTOOLS` (tareas 6.2 y 12.x de `us-algo-ortools-motor`, y el arranque en frío de la imagen) quedan para cuando la persona usuaria lo decida.
