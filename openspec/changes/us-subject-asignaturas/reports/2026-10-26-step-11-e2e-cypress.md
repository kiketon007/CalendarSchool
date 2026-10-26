# Informe del paso 11 - E2E con Cypress

- Fecha: 2026-10-26
- Cambio: us-subject-asignaturas
- Agente: Claude Sonnet 5.5

## Comandos ejecutados

- `npm run test:e2e -- --spec cypress/e2e/subjects.cy.ts` (el spec nuevo, solo).
- `npm run test:e2e` (la suite completa). El script compila el frontend, migra la base `calendarschool_test`, arranca el backend en :3001 y `vite preview` en :4173 y ejecuta Cypress en modo headless.
- Recuento de filas antes y después (`countsSubjects.sh`, los mismos de los informes de los pasos 9 y 10).

## Spec nuevo: `cypress/e2e/subjects.cy.ts` (7 tests)

1. **Crear Inglés y Programación y verlas:** desde la cabecera (estado vacío, «Crear asignatura»), Inglés con código, descripción, color «Verde azulado» y los tres cursos (1º, 2º y 10º) con 2 sesiones por defecto y 4 en el 10º; aviso «Asignatura «Inglés» creada»; tarjeta con «Código ING», «Troncal», «Activa», la descripción, el color con su nombre accesible y «3 cursos · 8 sesiones a la semana»; el desplegable con cada curso y sus sesiones. Programación con un solo curso y sin código («1 curso · 3 sesiones a la semana», sin «Código»). Orden del listado: Inglés, Programación.
2. **Errores y foco:** el formulario vacío muestra los errores del nombre, el tipo y los cursos, con el foco en el nombre y sin enviar nada; con un código con un espacio, el error sale bajo el código y el foco va a él.
3. **Filtros y búsqueda en el navegador:** por tipo, por estado, por nombre («prog»), por código («fr-2»), combinados («No hay asignaturas que coincidan») y de nuevo todas, en orden alfabético. La lista se pidió **una sola vez** (`@listSubjects.all` de longitud 1).
4. **Nombre y código repetidos:** el nombre «  inglés » da «Ya existe una asignatura con ese nombre», con el foco en el nombre y lo escrito conservado; el código «ing», «Ya existe una asignatura con ese código», con el foco en el código.
5. **Curso borrado:** al borrar por la API el único curso de una asignatura, la asignatura sigue en el listado con «Sin cursos» y su aviso, y sin nada que desplegar.
6. **`MEMBER`** (tarea `createUser`): ve el listado, ve «Solo los administradores pueden crear y modificar las asignaturas», no ve «Crear asignatura» y `/asignaturas/nueva` lo lleva a `/onboarding`.
7. **360 px:** el formulario (con el color, un curso marcado y su selector de sesiones) y el listado con un nombre muy largo y un curso desplegado, sin desplazamiento horizontal.

## Resultados

| Ejecución | Resultado |
|---|---|
| `subjects.cy.ts` solo | **7 de 7**, código de salida 0 |
| `npm run test:e2e` completo | **238 de 238** en 16 specs, 0 fallos, código de salida **0** (4 min 19 s de Cypress; 5 min 29 s en total) |

Los specs anteriores (`calendars`, `courses`, `csp`, `invitation-acceptance`, `invitations`, `login`, `logout`, `onboarding`, `password-reset`, `professors`, `registration`, `session`, `students`, `users-management` y `users`) siguen pasando con la cabecera nueva.

## Verificación y restauración de la base de datos

- La suite solo toca `calendarschool_test.public`; la limpieza del E2E se hace al empezar cada ejecución, no al terminar. Tras la ejecución quedaban 218 usuarios, 193 colegios, 120 cursos, 25 calendarios y 9 asignaturas, entre otros. La base de desarrollo (`calendarschool`) y los esquemas `test_<n>` no cambiaron.
- Se vaciaron las tablas de `calendarschool_test.public` (salvo `municipalities` y `_prisma_migrations`) con un `TRUNCATE … CASCADE`.
- El recuento posterior es **idéntico** a la línea base del paso 9, con una sola diferencia esperada: `subjects` y `subject_courses` existen ahora en ese esquema (0 filas), porque el script de E2E aplicó la migración `add_subjects` a la base de test.
- Al terminar, los puertos 3000, 3001 y 4173 no tienen ningún proceso escuchando (solo sockets en `TimeWait`).

## Resultado

- Estado del paso 11: PASA
- Problemas bloqueantes: ninguno
