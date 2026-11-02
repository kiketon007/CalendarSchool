## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us-prof-summary-b` desde `main` actualizada (`01671c1`, con US-PROF-SUMMARY archivada), con los artefactos de este cambio
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene los artefactos de este cambio, la ficha enriquecida de US-PROF-SUMMARY_b y su fila de la épica en `docs/User_Stories_MVP.md`, y `.claude/settings.json`, que debe volver a Sonnet con esfuerzo medio para la implementación

## 1. Contrato

- [x] 1.1 Documentar en `docs/api-spec.yml` `ProfessorLoadCalendar` y `ProfessorLoad.calendars` (requerido, solo en respuestas), con la regla de la suma, y actualizar los ejemplos de `GET /api/professors/summary`
- [x] 1.2 Fijar el campo en `api/schema.test.ts` (test que falla) y regenerar los tipos con `npm run api:types -w frontend`

## 2. Backend: dominio y aplicación

- [x] 2.1 Añadir a cada caso de `test-fixtures/teaching-load.json` el desglose esperado (`calendars`) y hacer que el test del dominio lo compare (falla)
- [x] 2.2 Implementar el desglose en `teachingLoadOf` (mismo bucle, por nombre) y un test de la propiedad «la suma del desglose es el rango del profesor» sobre toda la tabla
- [x] 2.3 Actualizar los tests de `GetProfessorsSummary`, del router (`SUMMARY` de ejemplo) y la integración HTTP (`professorsSummary.int.test.ts`) con `calendars`

## 3. Frontend: servicio

- [x] 3.1 Tests que fallan e implementación en `professorsSummaryService`: valida cada entrada de `calendars` y que sus rangos sumen el del profesor; actualizar los fixtures de los tests que construyen `ProfessorLoad`

## 4. Frontend: detalle

- [x] 4.1 Tests que fallan e implementación de una utilidad pura para la duración de las sesiones de cada curso a partir de los calendarios («de X a Y min», un solo valor o sin calendario) y del calendario por defecto del selector (mayor carga; empate, por nombre)
- [x] 4.2 Tests que fallan e implementación de `components/ProfessorLoadDetail.tsx`: las secciones de asignaciones y de desglose con el total
- [x] 4.3 Tests que fallan e implementación de la sección de disponibilidad: `SlotGrid` de solo lectura con celdas no disponibles y parciales, el selector, «Disponible siempre», sin calendario, cargando y error con «Reintentar»
- [x] 4.4 Tests que fallan e implementación de los avisos ampliados, cada uno con su explicación y su enlace (o sin enlace el de varios calendarios), con plurales
- [x] 4.5 Tests que fallan e implementación en `ProfessorsSummaryPage`: el botón «Detalle de {profesor}» con `aria-expanded` y `aria-controls`, uno solo abierto, la fila siguiente en la tabla y el bloque en la tarjeta, sin botón para «Sin carga»
- [x] 4.6 Tests que fallan e implementación de la carga del detalle: calendarios una vez por visita, disponibilidad al desplegar, la respuesta tardía descartada, el error local con «Reintentar» y el cierre cuando un filtro oculta al desplegado
- [x] 4.7 Textos en `es.json` y `en.json` (`professors.summary.detail.*`, con plurales) y tests de `axe` con el detalle abierto (con avisos, cargando, con error, en inglés y a 360 px)

## 5. Revisar y actualizar los tests unitarios existentes (MANDATORY)

- [x] 5.1 Revisar los tests que construyen `ProfessorLoad` o `TeachingLoad` (dominio, caso de uso, router, servicio, página y `App`) para que sigan comprobando lo mismo con el campo nuevo
- [x] 5.2 Ejecutar `npm run lint`, `npm run typecheck --workspaces` y `npm run api:types:check -w frontend`, cada uno con su código de salida

## 6. Ejecutar los tests y verificar el estado de la base de datos (MANDATORY)

- [x] 6.1 Vaciar la base de test y capturar la línea base de recuentos (`calendarschool` y `calendarschool_test`)
- [x] 6.2 Ejecutar los tests de los módulos cambiados
- [x] 6.3 Ejecutar `npm test` con cobertura (90 % backend, 80 % frontend)
- [x] 6.4 Comprobar que la base queda como en la línea base y restaurarla si no
- [x] 6.5 Crear `reports/YYYY-MM-DD-step-6-unit-test-and-db-verification.md` y marcar el paso solo con el informe creado

## 7. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 7.1 Arrancar el backend contra `calendarschool` migrada
- [x] 7.2 Preparar por la API un colegio con dos calendarios de duraciones distintas, un curso sin calendario, profesores con asignaciones en uno y en varios calendarios y con tramos no disponibles
- [x] 7.3 Comprobar `calendars` en `GET /api/professors/summary`: entradas por nombre, sesiones, disponibles y rangos calculados a mano, y que su suma es el rango del profesor; vacío sin calendario
- [x] 7.4 Comprobar los endpoints que usa el detalle sin cambios: `GET /api/calendars` (con sus cursos y periodos) y `GET /api/professors/{id}/availability`, `401` sin token
- [x] 7.5 Restaurar la base, parar el backend, comprobar que el puerto 3000 queda libre y crear `reports/YYYY-MM-DD-step-7-curl-manual-testing.md`

## 8. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 8.1 Añadir a `cypress/e2e/professorsSummary.cy.ts` (describe «Detalle de un profesor»): desplegar a un profesor y ver sus asignaciones con la duración, su desglose y su cuadrícula; cambiar de calendario; seguir el enlace de un aviso; desplegar a otro y comprobar que se cierra el primero; a 360 px sin desplazamiento horizontal
- [x] 8.2 Actualizar los E2E existentes del resumen si el botón nuevo cambia lo que comprueban
- [x] 8.3 Ejecutar la spec y la suite completa en modo headless (`npm run test:e2e`)
- [x] 8.4 Crear `reports/YYYY-MM-DD-step-8-e2e-cypress.md`

## 9. Documentación técnica (MANDATORY)

- [x] 9.1 Actualizar con la skill `update-docs`:
  - `backend/CLAUDE.md`: el desglose de `teachingLoadOf`;
  - `frontend/CLAUDE.md`: el detalle, su carga y sus avisos;
  - el README (módulo 8);
  - `docs/api-spec.yml` ya actualizado en 1.1;
  - la ficha de US-PROF-SUMMARY_b y la fila de la épica (implementada).
- [x] 9.2 Verificar que `.claude/settings.json` está en Sonnet con esfuerzo medio
- [x] 9.3 Verificar con `openspec validate us-prof-summary-b --strict` que el cambio es válido

## 10. Despliegue y comprobación en producción

- [x] 10.1 Repetir `npm run lint`, `typecheck` y `api:types:check`, cada uno con su código de salida, y abrir la PR con los grupos 0–9 tras la confirmación de la persona usuaria. Tras integrarla, verificar el CI del push a `main` y el despliegue
- [ ] 10.2 Comprobar en producción:
  - **Con `curl`:** el bundle contiene los textos nuevos y `GET /api/professors/summary` sin token responde `401`;
  - **La persona usuaria, con un navegador real**, despliega a un profesor y ve sus asignaciones, su desglose, su cuadrícula, el selector y los avisos ampliados con sus enlaces.
- [ ] 10.3 Documentar el resultado en `reports/YYYY-MM-DD-step-10-production.md`
