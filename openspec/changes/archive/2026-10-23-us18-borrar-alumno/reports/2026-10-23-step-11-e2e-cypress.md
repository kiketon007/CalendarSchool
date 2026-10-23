# Informe del paso 11 - E2E con Cypress

- Fecha: 2026-10-23
- Cambio: us18-borrar-alumno
- Agente: Claude Sonnet 5.5

## Comandos ejecutados

- `npm run test:e2e -- --spec cypress/e2e/students.cy.ts` (compila, migra la base de test, arranca el backend en el puerto 3001 y `vite preview` en el 4173 y ejecuta Cypress en modo headless), varias veces mientras se escribían los tests.
- `npm run test:e2e` completo.
- Limpieza de la base de test con `cleanE2eData` (`scripts/e2eData.mjs`) mediante un script temporal que se borró después.

## Tests nuevos en `students.cy.ts` (7, «deleting a student (US18)»)

Con alumnos creados por la API y la sesión del navegador:

- Borrar desde `/alumnos?comedor=si`: el diálogo dice «¿Borrar a Juan García López?» con «Esta acción no se puede deshacer», sin el tipo de comida ni las observaciones y con el foco en «Cancelar»; al confirmar (`DELETE` `200`) el diálogo se cierra, se ve «Alumno «Juan García López» eliminado», la URL sigue siendo `/alumnos?comedor=si`, aparece «No hay alumnos que coincidan con los filtros», el foco está en el título y el borrado no añade ninguna petición de la lista. Tras recargar, el alumno no está y «Limpiar filtros» muestra a los dos que quedan.
- Borrar al único alumno de la última página (21 alumnos, `?pagina=2`): se muestra la primera página con 20 alumnos, sin paginación, y la URL sigue siendo `?pagina=2`.
- Cancelar con Escape: el diálogo se cierra, no se envía ningún `DELETE`, los tres alumnos siguen y el foco vuelve al botón «Borrar» de esa fila.
- El alumno que otra persona borra antes de confirmar (por la API): el `DELETE` responde `404`, el diálogo se cierra, se ve «Ese alumno ya no existe», la lista se vuelve a pedir, ya no trae a ese alumno y el foco pasa al título.
- El último alumno de un curso filtrado (`?curso=<id>`): se borra (`200`), la URL y el filtro se conservan, aparece «No hay alumnos que coincidan con los filtros» y «Limpiar filtros» devuelve a los dos que quedan.
- Un `MEMBER` (creado con la tarea `createUser`) borra a un alumno.
- Borrado desde una tarjeta a 360 px, con el diálogo abierto y después sin desplazamiento horizontal.

## Resultados

- `students.cy.ts`: **32** tests (25 anteriores y 7 nuevos), todos en verde.
- Suite completa: **206** tests en 16 ficheros, todos en verde, código de salida **0** (4 min 21 s).

## Hallazgo (fuera del alcance de esta historia)

- Al cargar `/alumnos` en el build de producción servido por `vite preview`, el navegador pide `GET /api/students` **dos veces** (las dos con `200`). Ocurre también con `StudentsPage` tal como estaba antes de esta historia (se comprobó restaurando el fichero original), así que no lo introduce el borrado. `/cursos` solo pide la suya una vez en su E2E. No se ha investigado la causa.
- Por eso el test del borrado no asegura «una sola petición de la lista», sino que **el número de peticiones no cambia tras borrar**.

## Incidencias de la preparación (no del código)

- Mi test de recarga esperaba ver a Ana tras recargar `/alumnos?comedor=si`, pero ese filtro la oculta: se corrigió el test para pulsar «Limpiar filtros» antes.

## Verificación de la base de datos

- Línea base (`counts14.sh`): todo a 0 salvo `municipalities` (542) en `calendarschool` y en `calendarschool_test` (`public` y `test_1` a `test_4`).
- Tras el E2E, la base de test (`calendarschool_test.public`) quedó con los datos de la ejecución (182 usuarios, 161 colegios, 141 alumnos…): el E2E solo la vacía al empezar. Se vació con `cleanE2eData` y se comprobó que quedó **idéntica** a la línea base. `calendarschool` (desarrollo) no se tocó.
- Cypress dejó una captura del test que falló en una ejecución intermedia en `frontend/cypress/screenshots/`, que está en `.gitignore` y no se versiona.
- Puertos 3000, 3001 y 4173 libres al terminar.

## Resultado

- Estado del paso 11: PASA
- Problemas bloqueantes: ninguno
