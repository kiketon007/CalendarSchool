# Informe del paso 11 - E2E con Cypress

- Fecha: 2026-10-31
- Cambio: us20-listado-reglas
- Agente: Claude Sonnet 5.5

## Comandos ejecutados

- `npm run test:e2e -- --spec cypress/e2e/constraints.cy.ts` (la spec nueva sola).
- `npm run test:e2e` completo (compila, migra, arranca el backend en :3001 y `vite preview` en :4173 y ejecuta Cypress en modo headless).

## Spec nueva: `cypress/e2e/constraints.cy.ts`

Seis tests, cada `cy.intercept` registrado una sola vez (`getConstraints`):

1. **Listado desde la cabecera (`ADMIN`):** abre «Reglas» desde la navegación, el enlace queda marcado como página actual y se ven las 3 reglas de «1º Primaria» con curso, asignatura, tipo y detalle («Hasta 2 al día», «24 franjas»), el recuento «3 reglas», la fila de «Inglés» sin avisos y el aviso «No cabe en la semana con sus reglas» de «Religión» en rojo.
2. **Filtros:** por tipo («Franjas prohibidas» deja solo «Religión», «1 regla»), por búsqueda («ingl»), «Solo con avisos» (dos reglas, las de «Religión»), una combinación sin coincidencias («Bloques») que dice «No hay reglas que coincidan» y «0 reglas», «Limpiar filtros» (devuelve el foco a la búsqueda y las 3 reglas) y el filtro de curso. Comprueba además que la lista se pidió una sola vez.
3. **Enlaces del `ADMIN`:** «Editar» de las franjas prohibidas de «Religión» lleva a `/cursos/<curso>/carga/<asignatura>/prohibidas`, con su título.
4. **`MEMBER`:** ve las mismas 3 reglas con «Ver» y ningún «Editar»; «Ver» lleva a la carga del curso en su vista de solo lectura, sin «Guardar».
5. **Colegio sin reglas:** muestra el texto del vacío, sin filtros, y el enlace a «Cursos» funciona.
6. **360 px:** tarjetas en lugar de tabla (3 `li`, con la asignatura, el tipo y el aviso), 3 enlaces «Editar» y la página no se desplaza en horizontal.

## Resultados

- **Spec sola:** 6 tests, 6 en verde (10 s).
- **Suite completa:** 297 tests (291 de antes más los 6 nuevos), **297 en verde, 0 fallos**, en 8 min 23 s. Entre ellas, `slots.cy.ts` (17), `workload.cy.ts` (14), `subjects.cy.ts` (27), `courses.cy.ts` y las que recorren la cabecera: añadir el enlace «Reglas» no rompió ninguna, tampoco las de 360 px.
- **Incidencia del lanzador, no de los tests:** la ejecución completa se lanzó en segundo plano con un límite de 10 minutos y el lanzador la dio por terminada justo después de escribir «All specs passed», así que no llegó a registrarse el código de salida de `npm run test:e2e`. El resultado de Cypress (tabla final con 297 de 297) es completo. Los puertos 3001 y 4173 quedaron libres.

## Base de datos de test

- **Antes:** `calendarschool_test.public` vacía de datos (solo las 14 migraciones y los 542 municipios), tras el vaciado del paso 9.
- **Después de la suite:** quedaron los datos de los tests (252 colegios, 284 usuarios, 42 reglas y 218 celdas, entre otros), porque el E2E solo limpia al empezar, no al terminar.
- **Restaurada:** sí, con `TRUNCATE public.schools CASCADE` y `TRUNCATE public.rate_limit_attempts`. La base de desarrollo `calendarschool` no se tocó.

## Resultado

- Estado del paso 11: **PASS**
- Incidencias bloqueantes: ninguna.
