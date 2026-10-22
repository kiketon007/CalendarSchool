# Informe del paso 8 - E2E con Cypress

- Fecha: 2026-10-22
- Cambio: us15-filtrar-alumnos
- Agente: Claude Sonnet 5.5

## Comandos ejecutados

- `npm run test:e2e -- --spec cypress/e2e/students.cy.ts` (compila, migra la base de test, arranca el backend en :3001 y `vite preview` en :4173 y ejecuta Cypress en modo headless).
- `npm run test:e2e` (todas las specs).
- Limpieza de la base de test con `cleanE2eData` (el E2E solo vacía la base al empezar, nunca al terminar), mediante un script temporal que se borró después.

## Escenarios añadidos a `students.cy.ts` (grupo «search, filters and pagination (US15)», 6 tests, con alumnos creados por la API)

- **Total y búsqueda:** «5 alumnos»; «juan garcia» encuentra a «García López, Juan» y «JOSE munoz» a «Muñoz, José» (palabras en cualquier orden, sin acentos ni mayúsculas), con «Mostrando 1 de 5 alumnos» y **la URL sin cambios**: el texto buscado no se escribe.
- **Curso y clase:** «Clase» desactivada al empezar; «1º Primaria» filtra a 3 alumnos y escribe `?curso=<id>`; la clase «A» a 1 y escribe `&clase=<id>`; «Sin clase» muestra a Ana; cambiar a «2º Primaria» devuelve la clase a «Todas las clases».
- **Comedor y beca:** «Beca» desactivada al empezar; «Come en el comedor» (3), «Con beca» (2) y «Sin beca» (1) con la URL `?comedor=si&beca=no`; «No come en el comedor» desactiva la beca y la devuelve a «Todos».
- **Sin coincidencias:** desde una URL con un curso que no existe, tras elegir un curso y escribir «zzzzz», se ve «No hay alumnos que coincidan con los filtros» sin tabla; «Limpiar filtros» deja la búsqueda vacía y con el foco, los desplegables en «todos», los 5 alumnos, «5 alumnos» y la URL limpia.
- **Paginación y recarga:** con 23 alumnos, 20 en la página 1 («Página 1 de 2»), 3 en la 2 con `?pagina=2`, y al recargar se conserva la página; con «Come en el comedor» (11 alumnos) la URL pasa a `?comedor=si` y al recargar se conserva.
- **360 px:** `?curso=<id inexistente>&pagina=99` se ignora (5 alumnos en tarjetas y «Todos los cursos»), el filtro de comedor deja 3 y no hay desplazamiento horizontal con la barra de filtros.

## Resultados

- `students.cy.ts`: **14 de 14** (8 anteriores y 6 nuevos), a la primera. No hubo que cambiar ningún test existente: sus aserciones estaban acotadas a las filas de la tabla o de las tarjetas.
- Suite completa: **188 de 188** en 16 specs (`courses.cy.ts` 34, `professors.cy.ts` 29, `students.cy.ts` 14…), sin tests inestables ni reintentos. Duración total: 4 min 4 s.

## Entorno

- Base de datos de test restaurada: recuentos **idénticos** a la línea base (todo a 0 salvo `municipalities`, 542).
- Sin procesos en los puertos 3001 y 4173.

## Resultado

- Estado del paso 8: PASA
- Problemas bloqueantes: ninguno
