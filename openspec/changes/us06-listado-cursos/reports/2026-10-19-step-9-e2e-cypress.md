# Informe del paso 9 - E2E con Cypress

- Fecha: 2026-10-19
- Cambio: us06-listado-cursos
- Agente: Claude Sonnet 5.5

## Qué se cambió y qué se añadió

- **`frontend/cypress/e2e/courses.cy.ts`** (de 11 a 14 tests). Se añadieron dos ayudantes: `courseRow(nombre)` (la fila de la tabla de un curso) y `createCourseViaApi(nombre, clases)` (alta por la API con la sesión del navegador, para no repetir el formulario en cada test), y `formattedDate` para dar a la fecha el formato del listado.
  - **Actualizados** (buscaban el `h2` y la lista «Clases de …» de US05, que ya no existen en escritorio):
    1. el recorrido del administrador: ahora comprueba en la fila «2 clases: A, B», «Sin tutor» y la fecha de creación, que se calcula a partir del `createdAt` de la respuesta del `POST`;
    2. los nombres con `º`, `ª` y `ñ`: la celda «2 clases: 1ªA, Grupo Ñ»;
    3. el orden natural, el miembro, el aislamiento entre colegios y la comprobación de que el curso no está en la tabla de otro colegio.
  - **Nuevos:**
    1. **Tabla a 1280 px:** las cuatro columnas (Curso, Clases, Tutores, Creado), la fila del curso y que no hay botones en la página ni textos de editar, borrar, horario o alumnos.
    2. **Tarjetas a 360 px:** sin tabla, una tarjeta por curso con «2 clases: A, B» y «Sin tutor», y sin desplazamiento horizontal.
    3. **Búsqueda:** con tres cursos, «educacion» deja solo «Educación Infantil» y el indicador dice «Mostrando 1 de 3 cursos»; la búsqueda no hace peticiones nuevas (`@listCourses.all` sigue en 1); «XYZ» muestra «No hay cursos que coincidan con «XYZ»» y quita la tabla; «Limpiar búsqueda» vacía el campo, le devuelve el foco y restaura los tres cursos.
  - El test de 360 px de US05 (errores y un curso de seis clases) se mantiene: a ese ancho el listado son tarjetas y su `h2` sigue siendo válido.
- Revisión de los demás E2E (6.2): no necesitaron cambios.

## Comandos ejecutados

Desde la raíz, con PostgreSQL 17 en Docker Compose; el script compila ambos workspaces, migra la base de test, la vacía, arranca el backend (:3001) y `vite preview` (:4173) y ejecuta Cypress en modo headless:

- `npm run test:e2e -- --spec cypress/e2e/courses.cy.ts`
- `npm run test:e2e` (suite completa), con la salida a un fichero
- Limpieza al terminar: `cleanE2eData` de `scripts/e2eData.mjs` sobre el esquema `public` de `calendarschool_test`.

## Resultados

- **Spec actualizada:** 14 de 14 a la primera. Se escribió con la implementación ya hecha, así que no se vio en rojo; lo que cubre ya tenía sus tests unitarios en rojo antes (paso 7).
- **Suite completa** (1 min 55 s de Cypress, 2 min 31 s en total, salida 0): 125 pasan, 0 fallan, 0 pendientes, en 14 ficheros (los 122 de antes más los 3 nuevos).

| Spec | Tests |
|---|---|
| `courses.cy.ts` | 14 |
| `csp.cy.ts` | 11 |
| `health.cy.ts` | 1 |
| `home.cy.ts` | 1 |
| `invitation-acceptance.cy.ts` | 4 |
| `invitations.cy.ts` | 2 |
| `login.cy.ts` | 21 |
| `logout.cy.ts` | 6 |
| `onboarding.cy.ts` | 4 |
| `password-reset.cy.ts` | 5 |
| `registration.cy.ts` | 33 |
| `session.cy.ts` | 13 |
| `users-management.cy.ts` | 4 |
| `users.cy.ts` | 6 |

- Los puertos 3000, 3001 y 4173 quedaron libres al terminar.
- Notas: sin tests inestables ni reintentos. La fecha del listado se compara con la que da el `createdAt` real de la respuesta y se formatea con `Intl` en el propio navegador de Cypress, así que no depende de la hora a la que se ejecute. Queda sin comprobar en un navegador real el contraste de los textos nuevos (`axe` en jsdom no lo mide), que se verá en la comprobación de producción.

## Base de datos de test

- Antes de la ejecución, `calendarschool_test.public` estaba vacío y con 542 municipios (la línea base del paso 7).
- Tras la suite completa quedaban datos del E2E (los vacía el script al empezar, nunca al terminar): 96 usuarios, 81 colegios, 99 sesiones, 103 intentos, 13 enlaces de acceso, 14 cursos y 23 clases.
- Restauración: `cleanE2eData` los vació. Ahora `public` tiene todas las tablas de datos a 0 y `municipalities` a 542.
- `calendarschool` y los esquemas `test_1` a `test_4` son idénticos a la línea base (comparados con `diff`).

## Resultado

- Estado del paso 9: PASA
- Problemas bloqueantes: ninguno
