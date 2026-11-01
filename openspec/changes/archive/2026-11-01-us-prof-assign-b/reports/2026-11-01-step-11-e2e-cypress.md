# Informe del paso 11 - E2E con Cypress

- Fecha: 2026-11-01
- Cambio: us-prof-assign-b
- Agente: Claude Sonnet 5.5

## Comandos ejecutados

- `npm run test:e2e -- --spec cypress/e2e/assignments.cy.ts` (spec con los escenarios nuevos).
- `npm run test:e2e` (suite completa, headless), dos veces: la primera con 2 fallos en `courses.cy.ts`, la segunda limpia.
- `npm run typecheck -w frontend` para los tipos de las specs.

## Escenarios añadidos a `assignments.cy.ts` (describe «Avisos de asignaciones que se pierden»)

1. **Carga horaria:** con Inglés con una regla y dos asignaciones, «No se imparte» muestra «Al guardar se borrarán su regla y sus 2 asignaciones de profesores en este curso»; en Lengua (una asignación), «Al guardar se borrará su asignación de profesor en este curso»; al volver a 3 sesiones el aviso desaparece.
2. **Quitar una clase con asignaciones y sin alumnos:** el diálogo «¿Quitar la clase B?» dice «sus 2 asignaciones de profesores» y no menciona alumnos; tras guardar, la matriz de profesores no tiene la clase B y conserva la asignación de la clase A.
3. **Borrar un profesor con asignaciones:** el diálogo las enumera agrupadas por asignatura («Inglés: 1º Primaria B · Lengua: 1º Primaria B»); tras borrar, las celdas de esa clase quedan «Sin asignar».
4. **360 px:** los avisos de la carga y los diálogos de quitar clase y de borrar profesor no producen desplazamiento horizontal.

## Specs existentes (11.2)

- Los textos de `workload.cy.ts` y `subjects.cy.ts` («Al guardar se borrarán sus 2 reglas en …») no cambian: con solo reglas la frase es idéntica.
- `courses.cy.ts` comprobaba con `deep.equal` el cuerpo del `DELETE` de un curso sin el campo nuevo: se añadió `assignmentCount: 0` a lo esperado (es el cambio de contrato del propio US).

## Resultados

- **Spec nueva:** 9 de 9 (5 anteriores y 4 nuevos).
- **Suite completa, primera ejecución:** 312 de 314; fallaron en `courses.cy.ts` (a) el `deep.equal` anterior, que es un fallo real de la expectativa y está corregido, y (b) «says how many scheduling rules go with the course…», que esperaba que el diálogo se cerrara y no lo hizo en 4 s. El segundo no se pudo reproducir: la spec completa pasó 36 de 36 tras corregir el primero, y no hay cambio de código entre medias. No se ha identificado la causa; pudo ser un fallo intermitente de tiempo del propio test (quedó anotado).
- **Suite completa, segunda ejecución:** 23 specs, 314 de 314, sin fallos (6 min 4 s).
- **Puertos:** 3001 y 4173 libres tras la ejecución.

## Base de datos

- El E2E deja datos en `calendarschool_test` (por diseño solo limpia al empezar). Se vaciaron con `TRUNCATE ... CASCADE` y la comparación con `diff` coincide con la línea base del paso 9.

## Resultado

- Estado del paso 11: **PASS**, con la salvedad del fallo intermitente no reproducido del segundo test de borrado de curso.
- Incidencias bloqueantes: ninguna.
