# Informe del paso 8 - E2E con Cypress

- Fecha: 2026-11-08
- Cambio: us-ui-lists-b
- Agente: Claude Sonnet 5.5

## Cambios en las specs

- `professors.cy.ts`, `professorsSummary.cy.ts` y `students.cy.ts`: los nombres de elemento pasan de `h2` a `h3` y el total sin búsqueda ni filtros se lee en la cabecera del bloque (`.cs-list-count`); el `data-testid` de recuento solo se comprueba con búsqueda o filtros (y que no existe sin ellos).
- Specs nuevas dentro de las existentes:
  - `/profesores` a 1280 px: la región «Equipo docente» con su contador, y una tabla sin contenedor con desplazamiento y dentro de su bloque, con un nombre muy largo, una tutoría y las tres acciones.
  - `/profesores/resumen` a 1280 px: la región «Carga por profesor», el aviso de clases sin profesor fuera de ella y la tabla dentro de su bloque con los datos de la spec (siete columnas); a 360 px, filas `li.cs-list-item` con `h3` y sin desplazamiento horizontal.
  - `/profesores` a 1280 px con un profesor de cuatro asignaturas (en `professorsSummary.cy.ts`, que ya las crea): la tabla cabe en su bloque.
  - `/alumnos` a 1280 px: la región «Alumnado» con el contador y los filtros dentro, y la tabla dentro del bloque con un nombre largo, curso, clase, comedor con beca y las dos acciones; a 360 px, filas sin desplazamiento horizontal.
- `assignments.cy.ts`: una comprobación de la lista de profesores a 360 px buscaba el nombre en un `h2`; pasa a `h3`. La suite completa lo detectó.

## Ejecución

- Specs cambiadas (`professors`, `professorsSummary`, `students`): 77 tests, 77 correctos.
- Suite completa (`npm run test:e2e`): 32 specs, 384 tests, 383 correctos y 1 fallo en `assignments.cy.ts` (el selector `h2` anterior). Tras corregirlo, esa spec se repitió sola: 9 de 9 correctos. No se ha vuelto a ejecutar la suite completa entera tras la corrección; el resto de specs no cambió entre las dos ejecuciones.
- Se ejecutó en una sola tanda: la memoria lo permitió.
- Los puertos 4173, 3000 y 3001 quedaron libres.

## Base de datos

- Se vaciaron `public` y `test_*` de `calendarschool_test` tras la ejecución; los recuentos coinciden con la línea base del paso 6.

## Resultado

- Estado del paso 8: **PASS**
- Incidencias bloqueantes: ninguna.
