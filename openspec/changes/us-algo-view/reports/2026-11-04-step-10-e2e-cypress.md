# Informe del paso 10 - E2E con Cypress

- Fecha: 2026-11-04
- Cambio: us-algo-view
- Agente: Claude Sonnet 5.5

## Comandos ejecutados

- `npm run test:e2e -- --spec cypress/e2e/scheduleDraft.cy.ts` (la spec nueva), dos veces.
- `npm run test:e2e` (la suite completa, en modo headless): compila, migra `calendarschool_test`, arranca el backend (:3001) y `vite preview` (:4173) y ejecuta Cypress, con el lanzador en memoria.
- `npm run typecheck -w frontend` (incluye `cypress/tsconfig.json`) y ESLint de la spec: código de salida 0.

## La spec nueva (`cypress/e2e/scheduleDraft.cy.ts`, 6 tests)

El colegio de las pruebas tiene «1º Primaria» con las clases A y B, un calendario de tres sesiones, Lengua (3 sesiones) y una profesora con las dos clases (6 sesiones suyas).

- Un administrador genera, pulsa «Ver horario» en el resumen y llega a `/horarios/borrador`: ve «Borrador», el título, el selector de clase con una clase elegida y su tabla (días en columnas, «Sesión 1», 3 celdas de Lengua y «García, Ana») con «3 sesiones a la semana».
- Recorre las tres vistas sin volver a pedir el borrador (`GET /api/schedule/draft` se pide una vez), con la dirección `?vista=profesor`, `?vista=colegio` y `?vista=colegio&dia=3`; la vista por profesor muestra «1º Primaria · A» y «6 sesiones a la semana», la del colegio las dos clases en columnas; y, al recargar, conserva la vista y el día.
- Una dirección con el profesor de la URL lo abre directamente, y otra con un profesor y un día que no existen usa el primero sin ningún aviso de error.
- Un colegio que nunca ha generado dice «Todavía no hay ningún horario generado» con un enlace a `/horarios`, que funciona.
- Un `MEMBER` ve el mismo borrador, con sus vistas.
- A 360 px las tres vistas se usan sin desplazar la página en horizontal, con los días abreviados.

## Resultados

- **Spec nueva:** primera ejecución con 5 de 6; el fallo era una aserción mal escrita mía (`should('have.value').and('not.be.empty')` sin valor), no de la página. Corregida con `invoke('val')`; segunda ejecución, 6 de 6 (21 s).
- **Suite completa:** 27 specs, 344 tests, todos pasan (7 min 46 s), incluidas `scheduleGeneration.cy.ts` (7 de 7) y `scheduleReadiness.cy.ts` (7 de 7).
- Servidores parados: nada escucha en los puertos 3001 ni 4173.

## Estado de la base de datos

- El E2E no limpia al terminar: se vaciaron todas las tablas de `calendarschool_test.public` salvo `_prisma_migrations` y `municipalities`. Los recuentos coinciden con la línea base del paso 8 (`diff` idéntico). `calendarschool` no cambió.

## Resultado

- Estado del paso 10: **PASS**
- Incidencias bloqueantes: ninguna.
