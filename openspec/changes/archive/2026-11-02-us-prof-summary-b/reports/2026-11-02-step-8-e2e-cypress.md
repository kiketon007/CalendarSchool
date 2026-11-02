# Informe del paso 8 - E2E con Cypress

- Fecha: 2026-11-02
- Cambio: us-prof-summary-b
- Agente: Claude Sonnet 5.5

## Comandos ejecutados

- `npm run test:e2e -- --spec cypress/e2e/professorsSummary.cy.ts` (spec ampliada).
- `npm run test:e2e` (suite completa, headless).
- `npm run typecheck -w frontend` y ESLint sobre la spec.

## Escenarios añadidos a `professorsSummary.cy.ts` (describe «Detalle de un profesor en el resumen de carga»)

Mismo colegio creado por la API que los escenarios del resumen: tres cursos de dos clases (1º Primaria con el calendario «Mixto», 3º Primaria con «Largo» y 6º Primaria sin calendario), cuatro profesores y la disponibilidad de Ana bloqueada de lunes a jueves. El `seed` devuelve ahora también los ids del curso 3º y de sus clases, de Eva, de Pedro y de las asignaturas.

1. **Desplegar a un profesor:** el botón «Detalle de García, Ana» pasa a `aria-expanded="true"` y se ve su detalle: la asignación con la duración («Lengua · 1º Primaria A · 5 sesiones · «Mixto», sesiones de 45 a 60 min»), el desglose (««Mixto»: 10 sesiones · puede dar 5 · 7 h 30 min – 10 h»), el total, la cuadrícula con celdas «No disponible» y el aviso ampliado de disponibilidad; «Editar disponibilidad» lleva a `/profesores/{id}/disponibilidad`.
2. **Uno a la vez y curso sin calendario:** al desplegar a Eva se cierra el detalle de Ana; el de Eva dice «sin calendario» en su asignación de 6º y explica que el curso no tiene calendario, con un enlace «Calendarios» a `/calendarios`.
3. **Filtros:** «Ruiz, Luis» (sin carga) no tiene botón «Detalle»; buscar «perez» cierra el detalle de Ana y al limpiar la búsqueda aparece cerrado.
4. **Selector de calendario:** con Eva dando clase también en la clase B de 3º (calendario «Largo»), la cuadrícula empieza en «Largo» (más carga), cambia a «Mixto» con el selector, el desglose lista los dos calendarios y aparece el aviso de varios calendarios.
5. **360 px:** el detalle se despliega dentro de la tarjeta, con su cuadrícula, sin desplazamiento horizontal.

## Specs existentes (8.2)

- Los escenarios del resumen no dependían de los botones de la columna «Acciones»: no hizo falta cambiar nada, y la suite completa lo confirma.

## Resultados

- **Spec ampliada:** 10 de 10 a la primera (5 anteriores y 5 nuevos).
- **Suite completa:** 324 de 324 (319 anteriores y 5 nuevos), 0 fallos, 7 min 28 s.
- **Puertos:** 3000, 3001 y 4173 libres tras la ejecución.

## Base de datos

- El E2E deja datos en `calendarschool_test` (por diseño solo limpia al empezar). Se vaciaron con `TRUNCATE ... CASCADE` y la comparación con `diff` coincide con la línea base del paso 6.

## Resultado

- Estado del paso 8: **PASS**
- Incidencias bloqueantes: ninguna.
