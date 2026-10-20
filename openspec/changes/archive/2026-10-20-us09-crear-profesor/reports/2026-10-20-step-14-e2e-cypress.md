# Informe del paso 14 - Tests E2E con Cypress

- Fecha: 2026-10-20
- Cambio: us09-crear-profesor
- Agente: Claude Sonnet 5.5

## Comandos ejecutados

- `npm run test:e2e -- --spec cypress/e2e/professors.cy.ts` (compila, migra la base de test, arranca el backend en :3001 y `vite preview` en :4173 y ejecuta Cypress en modo headless).
- `npm run test:e2e -- --spec cypress/e2e/courses.cy.ts`.
- `npm run test:e2e` completo.
- Antes de cada ejecución, el propio script vacía la base de test (`scripts/e2eData.mjs`); no se hace al terminar.

## Spec nueva: `professors.cy.ts` (7 tests)

1. Un administrador ve el listado vacío, entra en «Crear profesor» desde la navegación, comprueba que el desplegable ofrece las clases agrupadas por curso, crea a «Ana García» (cargo Director, clase A de «1º Primaria»), vuelve al listado con el aviso y la ve con su cargo y «1º Primaria · A». En `/cursos` la columna «Tutores» dice «A: Ana García»; en la edición del curso la fila de la clase muestra «Tutor: Ana García» y la otra «Sin tutor», con «Guardar» deshabilitado. Al abrir de nuevo el formulario, solo se ofrece la clase B. La respuesta de la API lleva `subjects: []` y `tutoredClass`.
2. Validación sin enviar: «Guardar» vacío muestra los errores de nombre y apellidos, el foco queda en el nombre con `aria-invalid` y no se hace ninguna petición `POST` (alias `@createProfessor.all` vacío).
3. Carrera: con el formulario abierto y la clase A elegida, otra persona (la API) le pone tutor a esa clase; al enviar llega un `409` y aparece el error en el campo de la clase, con el foco en él, conservando lo escrito.
4. Borrar el curso de la clase de un profesor (desde el diálogo de «Cursos»): el profesor sigue en el listado y pasa a «Sin clase».
5. Un `MEMBER` (creado con la tarea `createUser`) no ve «Usuarios», entra en «Profesores» y crea un profesor.
6. A 1280 px se ve la tabla y no hay tarjetas; a 360 px, una tarjeta por profesor con `h2`, sin tabla y sin desplazamiento horizontal (`scrollWidth ≤ clientWidth`).
7. Un visitante sin sesión que abre `/profesores` va a `/login`.

## Resultados

- `professors.cy.ts`: 7 pasan, 0 fallan, a la primera.
- `courses.cy.ts`: 29 pasan, 0 fallan. No hizo falta ajustar ningún paso: los que miran «Sin tutor» siguen siendo ciertos porque ninguna de esas clases tiene tutor.
- Suite completa: **15 specs, 147 tests, todos correctos** (antes: 14 specs y 140 tests). Duración 2 min 16 s. Sin reintentos ni tests inestables.
- Los mensajes `AggregateError [ECONNREFUSED]` del registro son los sondeos de espera mientras arrancan el backend y `vite preview`; no son fallos.
- `typecheck` (incluido `cypress/tsconfig.json`), `lint` y `prettier` limpios con la spec nueva.
- Al terminar, los puertos 3001 y 4173 quedan libres (ninguna conexión en escucha).

## Verificación de la base de datos de test

- El E2E deja sus datos en `calendarschool_test.public` (la base solo se vacía al empezar): 103 colegios, 29 cursos, 55 clases y 6 profesores, entre otros.
- Estado restaurado con `cleanE2eData` (el mismo vaciado que usa el script). Comparado con la línea base del paso 12, la única diferencia es esperada: `calendarschool_test.public` ahora tiene la tabla `professors` (0 filas) y 9 migraciones aplicadas, porque el E2E la migra antes de arrancar. La base de desarrollo y los esquemas `test_1` a `test_4` no cambian.
- No ha aparecido ningún fichero nuevo fuera de los del cambio.

## Observaciones

- El E2E de la carrera (test 3) cubre lo que el test de componente no puede: que la API real devuelve `409 CLASS_ALREADY_HAS_TUTOR` y que el foco acaba en el desplegable.
- Las comprobaciones de ancho (6) usan `scrollWidth` frente a `clientWidth`, como las de `/cursos`.

## Resultado

- Estado del paso 14: PASA
- Problemas bloqueantes: ninguno
