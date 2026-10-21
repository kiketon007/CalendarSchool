# Informe del paso 11 - Tests E2E con Cypress

- Fecha: 2026-10-20
- Cambio: us09b-elegir-tutor
- Agente: Claude Sonnet 5.5

## Comandos ejecutados

- `npm run test:e2e -- --spec cypress/e2e/professors.cy.ts,cypress/e2e/courses.cy.ts` (compila, migra la base de test, arranca el backend en :3001 y `vite preview` en :4173 y ejecuta Cypress en modo headless).
- `npm run test:e2e` completo.
- `npm run test:e2e -- --spec cypress/e2e/session.cy.ts` (repetición de la única spec que falló en la ejecución completa).
- Antes de cada ejecución, el propio script vacía la base de test (`scripts/e2eData.mjs`); no se hace al terminar.

## Cambios en las specs

`professors.cy.ts` pasa de 7 a 11 tests, con el bloque «choosing the tutors from the course edition»:

1. Asignar el tutor de una clase desde la edición: «Cursos» muestra «A: Ana García» y «Profesores» muestra «1º Primaria · A».
2. Intercambiar los tutores de dos clases en un solo guardado (A: Luis Ruiz, B: Ana García): el índice único no choca.
3. Carrera: con el formulario abierto y el profesor elegido en la clase 2, otra persona (la API, con un `PUT` de otro curso) lo hace tutor de otra clase; al guardar llega el `409`, aparece el aviso general y el error de la fila, el foco queda en el desplegable con `aria-invalid` y se sigue en la edición.
4. Edición a 360 px con tutores: los desplegables se ven y no hay desplazamiento horizontal (`scrollWidth ≤ clientWidth`).

Los pasos de `courses.cy.ts` (el cuerpo del `PUT` lleva `tutorId`) y del primer test de `professors.cy.ts` (el desplegable en lugar del texto) se ajustaron en el paso 8.2. Ayudantes nuevos: `withProfessorId` y `setTutorViaApi`.

## Resultados

- `professors.cy.ts`: 11 pasan; `courses.cy.ts`: 29 pasan. A la primera.
- Suite completa: 15 specs, 151 tests, **150 correctos y 1 fallido**, 2 min 26 s (antes: 147 tests).
- El fallo está en `session.cy.ts`, «starts the session with a refresh token cookie that scripts cannot read»: `expected 86400.01188898087 to be within 86280..86400`. Es una aserción sensible al reloj (la caducidad de la cookie sale 12 ms por encima del máximo de un día) que no tiene relación con los tutores y que no se ha tocado. Repetida la spec sola: **13 de 13 pasan**. Es un test inestable ya existente; se anota como observación y no se corrige dentro de este cambio.
- `typecheck` (incluido `cypress/tsconfig.json`) y `lint` limpios.
- Al terminar, los puertos 3001 y 4173 quedan libres.

## Verificación de la base de datos de test

- Tras la última ejecución quedaban datos del E2E en `calendarschool_test.public` (10 colegios, 11 intentos limitados, etc.).
- Restaurada con `cleanE2eData` (el mismo vaciado del script). Comparada con la línea base (`counts.sh`, `diff`): **idéntica** en la base de desarrollo y en todos los esquemas de la base de test. No ha aparecido ningún fichero nuevo fuera de los del cambio.

## Observaciones

- El E2E de la carrera cubre lo que el test de componente no puede: que la API real devuelve `409 PROFESSOR_ALREADY_TUTOR` y que el foco acaba en el desplegable de la fila.
- Propuesta (fuera de este cambio): ampliar el margen de la aserción de caducidad de `session.cy.ts` en unos segundos por arriba.

## Resultado

- Estado del paso 11: PASA
- Problemas bloqueantes: ninguno
