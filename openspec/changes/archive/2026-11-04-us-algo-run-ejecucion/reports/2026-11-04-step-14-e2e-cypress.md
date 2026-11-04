# Informe del paso 14 - E2E con Cypress

- Fecha: 2026-11-04
- Cambio: us-algo-run-ejecucion
- Agente: Claude Sonnet 5.5

## Comandos ejecutados

- `npm run test:e2e -- --spec cypress/e2e/scheduleGeneration.cy.ts` (la spec nueva).
- `npm run test:e2e` (la suite completa, en modo headless): compila, aplica las migraciones a `calendarschool_test`, arranca el backend (:3001) y `vite preview` (:4173) y ejecuta Cypress. Sin `SCHEDULE_WORKER_FUNCTION_NAME`, así que el backend usa el lanzador en memoria.
- `npm run typecheck -w frontend` (incluye `cypress/tsconfig.json`) y ESLint de la spec: código de salida 0.

## La spec nueva (`cypress/e2e/scheduleGeneration.cy.ts`, 7 tests)

- Un administrador genera, ve «Horario borrador generado: 3 sesiones colocadas» con su nota y los botones «Generar de nuevo» (sin «Cancelar»), y **tras recargar lo sigue viendo**.
- Generar de nuevo **sustituye** el borrador: el `scheduleId` de `GET /api/schedule/generate` cambia.
- **Retomar y seguir el progreso:** el lanzador en memoria termina en milisegundos, así que para ver una generación en curso el test **simula** con `cy.intercept` el `GET /api/schedule/generate` (una `RUNNING` con 20 de 50) y el sondeo del `GET /{id}` (que responde `COMPLETED`). Se comprueba «Generando horarios…», «20 de 50 sesiones», la barra con su nombre, mínimo, valor y máximo, «Cancelar» habilitado y «Generar» deshabilitado, y que a los 2 s el panel pasa al resumen de 50 sesiones y desaparece la barra. Es una comprobación del navegador contra respuestas simuladas, no del worker real (que cubren el test de integración y los curl del paso 13).
- Con un bloqueante (colegio sin cursos): sin botón «Generar horarios» y con la explicación.
- Un `MEMBER`: ve el resumen que generó el administrador, sin ningún botón; sin generación, ve que solo los administradores generan.
- A 360 px: sin desplazamiento horizontal antes y después de generar.
- No se simula un fallo `INFEASIBLE`: los textos y enlaces de cada motivo los cubren los tests de componente.

## Resultados

- **Spec nueva:** 7 de 7 en la primera ejecución (24 s). Los `AggregateError [ECONNREFUSED]` del log son las esperas del script mientras arrancan los servidores.
- **Suite completa:** 26 specs, 338 tests, todos pasan (8 min 44 s), incluida `scheduleReadiness.cy.ts` (7 de 7), que ya incluye el panel en la página.
- Servidores parados: nada escucha en los puertos 3001 ni 4173.

## Estado de la base de datos

- El E2E no limpia al terminar: tras la suite, `calendarschool_test.public` quedó con datos de los tests. Se vaciaron todas las tablas salvo `_prisma_migrations` y `municipalities`.
- Diferencias con la línea base del paso 12, ya sin datos: `public._prisma_migrations` pasa de 16 a 17 y existen en `public` las tablas `schedules`, `schedule_entries` y `schedule_generations` (0 filas). Es el efecto esperado de que el E2E aplique la migración nueva a ese esquema (antes solo la tenían `test_1` a `test_4`); no es una mutación no deseada. `calendarschool` no cambió.

## Resultado

- Estado del paso 14: **PASS**
- Incidencias bloqueantes: ninguna.
