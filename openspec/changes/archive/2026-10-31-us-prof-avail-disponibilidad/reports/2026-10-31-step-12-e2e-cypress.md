# Informe del paso 12 - E2E con Cypress

- Fecha: 2026-10-31
- Cambio: us-prof-avail-disponibilidad
- Agente: Claude Sonnet 5.5

## Comandos ejecutados

- `npm run test:e2e -- --spec "cypress/e2e/professor-availability.cy.ts"` (la spec nueva sola, dos veces).
- `npm run test:e2e -- --spec "cypress/e2e/professor-availability.cy.ts,cypress/e2e/professors.cy.ts"` (la nueva y la de profesores, cuyas columnas «Acciones» ganan un enlace).
- `npm run test:e2e` completo (compila, migra, arranca el backend en :3001 y `vite preview` en :4173 y ejecuta Cypress en modo headless).

## Spec nueva: `cypress/e2e/professor-availability.cy.ts`

Ocho tests, cada `cy.intercept` registrado una sola vez (`getAvailability` y `putAvailability`):

1. **Marcar y guardar desde el listado:** abre «Disponibilidad» desde `/profesores`, ve «30 de 30 franjas disponibles», marca la cabecera «Miércoles» y la celda del lunes 1ª, ve «23 de 30», guarda y comprueba el cuerpo del `PUT` (dos tramos normalizados: lunes 09:00–09:45 y miércoles 09:00–13:30), el aviso «Disponibilidad de Ana García guardada» y, de vuelta en el listado, «Disponibilidad (2 tramos)».
2. **Partir un tramo:** con el lunes de 09:00 a 11:15 guardado, desmarca la 2ª sesión y el `PUT` lleva 09:00–09:45 y 10:30–11:15.
3. **Otro calendario:** con dos calendarios (se abre con el que siguen más cursos), un tramo del lunes y otro del viernes fuera de ambas jornadas:
   - la página menciona «También no disponible fuera de esta jornada: Viernes 16:00–17:00»;
   - al elegir «Infantil», la 1ª sesión del lunes (09:00–10:00) se ve parcial, con las horas en su nombre accesible;
   - marcar otra celda y guardar conserva el tramo del viernes.
4. **«Disponible todo»:** con un tramo que la cuadrícula no muestra, pide confirmación, «Cancelar» lo conserva todo y confirmar lo borra todo; el `PUT` va con la lista vacía y el listado vuelve a decir «Disponibilidad».
5. **`MEMBER`:** un miembro edita y guarda (`200`).
6. **Sin calendarios:** explica que no hay, sin cuadrícula, y el enlace lleva a `/calendarios`.
7. **Profesor inexistente:** un id desconocido dice «Este profesor no existe o ya no está disponible» con el enlace de vuelta a «Profesores».
8. **360 px:** la cuadrícula se ve con los días abreviados, una celda parcial, «Disponible todo» y «Guardar» a la vista, y la página no se desplaza en horizontal.

## Resultados

- **Spec sola:** 8 tests, 8 en verde. La primera ejecución dio 7 en verde y 1 fallo por una aserción mal escrita del propio test (`should('have.value')` sin valor); se corrigió el test, no la aplicación.
- **Spec nueva y `professors.cy.ts`:** 37 tests, 37 en verde.
- **Suite completa:** 305 tests (297 de antes más los 8 nuevos), **305 en verde, 0 fallos**, código de salida 0, en 6 min 19 s. Añadir el enlace «Disponibilidad» al listado de profesores no rompió ninguna spec, tampoco las de 360 px.
- Los puertos 3001 y 4173 quedaron libres.

## Base de datos de test

- **Antes:** `calendarschool_test` sin datos de colegio (solo las migraciones y los 542 municipios).
- **Después de la suite:** quedaron los datos de los tests (260 colegios, 117 profesores y 9 tramos, entre otros), porque el E2E solo limpia al empezar, no al terminar.
- **Restaurada:** sí, con `TRUNCATE public.schools CASCADE` y `TRUNCATE public.rate_limit_attempts`. La única diferencia con la línea base del paso 10 es que `public` pasa de 14 a 15 migraciones y gana la tabla `professor_unavailabilities` (vacía): el script del E2E aplica `prisma migrate deploy` a esa base y ahí se aplicó la migración nueva. La base de desarrollo `calendarschool` no se tocó.

## Resultado

- Estado del paso 12: **PASS**
- Incidencias bloqueantes: ninguna.
