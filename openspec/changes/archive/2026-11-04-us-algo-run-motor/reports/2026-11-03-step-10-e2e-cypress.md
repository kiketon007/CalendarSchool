# Informe del paso 10 - E2E con Cypress

- Fecha: 2026-11-03
- Cambio: us-algo-run-motor
- Agente: Claude Sonnet 5.5

## Comandos ejecutados

- `npm run test:e2e -- --spec cypress/e2e/scheduleReadiness.cy.ts` (compila, migra, arranca el backend en :3001 y `vite preview` en :4173 y ejecuta Cypress en modo headless).
- `npm run test:e2e` completo.
- `npm run typecheck -w frontend` (incluye los tipos de las specs de Cypress).

## Escenarios añadidos

En `frontend/cypress/e2e/scheduleReadiness.cy.ts`, con datos preparados por la API:

- **Aviso de huecos libres:** un administrador con «1º Primaria» (calendario «Corto», 15 franjas), Lengua con 3 sesiones y su profesora asignada ve «Se puede generar» y, a la vez, el aviso «1º Primaria tiene 3 sesiones para 15 franjas: quedarán 12 huecos libres en cada clase.» con la etiqueta «Aviso» y un enlace a `/cursos/{id}/carga`.
- **Desaparece al completar la carga:** tras crear cuatro asignaturas más de 3 sesiones y asignarlas, la página ya no muestra el aviso ni el grupo «Avisos» y el veredicto sigue siendo «Se puede generar».

## Resultados

- **Spec de horarios:** 7 de 7 tests (6 anteriores + 1 nuevo), a la primera.
- **Suite completa:** 331 de 331 tests en todas las specs, 0 fallos (antes, 330).
- **Observación:** el arranque del script imprime un `AggregateError [ECONNREFUSED]` mientras espera a que el backend responda; es el sondeo inicial, no un fallo.

## Estado de la base de datos

- El E2E no limpia al terminar (solo antes de cada ejecución): `calendarschool_test.public` conservaba los datos de esta ejecución y de la anterior (la línea base ya los llevaba). Se vació con `TRUNCATE public.schools CASCADE` y `rate_limit_attempts`, así que queda más limpia que la línea base; no hay migraciones ni datos fijos afectados. `calendarschool` y los esquemas de los workers no cambian.

## Resultado

- Estado del paso 10: **PASS**
- Incidencias bloqueantes: ninguna.
