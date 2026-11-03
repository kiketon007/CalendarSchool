# Informe del paso 11 - E2E con Cypress

- Fecha: 2026-11-03
- Cambio: us-algo-check
- Agente: Claude Sonnet 5.5

## Comandos ejecutados

- `npm run test:e2e -- --spec cypress/e2e/scheduleReadiness.cy.ts` (dos veces: ver «Resultados»).
- `npm run test:e2e` completo (compila, migra, arranca backend en :3001 y `vite preview` en :4173, ejecuta Cypress).
- `npm run typecheck -w frontend` y ESLint sobre la spec nueva.

## La spec nueva (`scheduleReadiness.cy.ts`, 6 tests)

Los datos se crean por la API; cada test registra su propio colegio.

- Un colegio sin cursos: veredicto «No se puede generar todavía: 1 problema», `SCHOOL_WITHOUT_COURSES` y su enlace a `/cursos/nuevo`.
- Bloqueantes y avisos de varios tipos (`COURSE_WITHOUT_CALENDAR` y `COURSE_WITHOUT_SUBJECTS`) con su insignia y, el primero, su enlace a `/calendarios`.
- Seguir el enlace «Profesores de 1º Primaria» hasta `/cursos/:id/profesores`.
- Corregir el único bloqueante (asignar el profesor por la API) y ver que desaparece y que el veredicto pasa a «Se puede generar».
- La entrada «Horarios» de la navegación lleva a `/horarios` y queda con `aria-current="page"`.
- 360 px sin desplazamiento horizontal.

## Resultados

- **Primera ejecución de la spec:** 4 de 6. Los dos fallos eran de la spec, no del producto:
  - el veredicto lleva un icono delante del texto y la aserción usaba `have.text`; pasa a `contain.text`;
  - `COURSE_WITHOUT_SUBJECTS` solo se avisa si el curso tiene calendario (así está en `readinessOf`); el curso «Vacío» recibe uno.
- **Segunda ejecución de la spec:** 6 de 6.
- **Suite completa:** 26 specs, 330 tests, 0 fallos (7 min 8 s).
- **Tarea 11.2:** ningún E2E existente cambia. Todos localizan los enlaces de la cabecera por su texto dentro de `[aria-label="Navegación principal"]` (`cy.contains`) y ninguno cuenta enlaces ni comprueba su orden.
- **Honestidad del TDD:** la spec se escribió después de la implementación (es una verificación de extremo a extremo, no guía el diseño) y falló dos veces por suposiciones mías sobre los datos y el marcado.

## Estado de la base de datos

- El E2E vacía la base de pruebas al empezar y nunca al terminar (por diseño). No toca `calendarschool` de desarrollo.

## Resultado

- Estado del paso 11: **PASS**
- Incidencias bloqueantes: ninguna.
