# Informe del paso 10 - E2E con Cypress

- Fecha: 2026-10-29
- Cambio: us-subject-c-borrar-asignaturas
- Agente: Claude Sonnet 5.5

## Comandos ejecutados

- `npm run test:e2e -- --spec cypress/e2e/subjects.cy.ts` (el spec ampliado, solo).
- `npm run test:e2e` (la suite completa). El script compila el frontend, migra la base `calendarschool_test`, arranca el backend en :3001 y `vite preview` en :4173 y ejecuta Cypress en modo headless.
- Recuento de filas antes y después (`dbcounts.sh`, el mismo del informe del paso 8).

## Spec ampliado: `cypress/e2e/subjects.cy.ts` (7 tests nuevos, 23 en total)

Nuevo `describe('Asignaturas: borrado')`, con su propio `cy.intercept` del listado registrado una sola vez:

1. **Diálogo y cancelar:** muestra «¿Borrar la asignatura «Inglés»?», los cursos («Se imparte en: 1º Primaria, 2º Primaria»), el recordatorio de inactivar como texto (sin ningún enlace) y la advertencia; el foco empieza en «Cancelar». Al cancelar el diálogo desaparece, el foco vuelve a «Borrar Inglés» y la tarjeta sigue.
2. **Borrar con cursos:** aviso «Asignatura «Inglés» eliminada» en un `role="status"`, la tarjeta desaparece, la otra asignatura que comparte curso sigue y el foco pasa al `h1`. Los cursos siguen en `/cursos`, y el nombre y el código quedan libres: se crea otra «Inglés» con el código `ing` y aparece en el listado.
3. **Borrar sin cursos:** tras borrar su único curso por la API, el diálogo dice «No se imparte en ningún curso» (sin «Se imparte en:») y el borrado funciona.
4. **Con filtro y la última:** borrar la única asignatura visible con una búsqueda puesta muestra «No hay asignaturas que coincidan» y conserva el texto de búsqueda; borrar después la última muestra el estado vacío.
5. **Ya no existe:** otra persona la borra por la API (con el listado ya cargado); al confirmar, la página dice «Esa asignatura ya no existe», recarga la lista y la otra asignatura sigue.
6. **`MEMBER`:** ve las asignaturas y ningún botón «Borrar».
7. **360 px:** el diálogo (con un nombre muy largo) se ve entero, con «Cancelar» y «Borrar asignatura» visibles, sin desplazamiento horizontal.

Cambios en tests existentes:

- **El `404` de la edición:** el `cy.intercept` que simulaba la respuesta se sustituyó por un borrado real por la API mientras se edita (el `PUT` recibe un `404` real).
- **«keeps a subject, without courses, when its only course is deleted»:** comprobaba que la tarjeta no tenía ningún `button`; ahora el administrador ve «Borrar» en todas, así que comprueba que no hay botón de desplegar (`button[aria-expanded]`), que es lo que decía de verdad. Lo detectó el E2E: la revisión del paso 7.1 no lo había visto.

## Resultados

| Ejecución | Resultado |
|---|---|
| `subjects.cy.ts` | 23 tests, **23 correctos**, 0 fallos (33 s) |
| `npm run test:e2e` completo | Código de salida **0**: 18 specs y **254 tests correctos**, 0 fallos (7 min 6 s). `subjects.cy.ts`: 23 |

Incidencias del primer intento de `subjects.cy.ts` (21 de 23): dos fallos del propio test, no de la aplicación. (a) El test antiguo de la asignatura sin cursos (arriba). (b) El test de «nombre y código libres» no elegía el tipo, que el formulario exige, y no salía de `/asignaturas/nueva`. Se corrigieron y se repitió el spec entero y después la suite completa.

## Base de datos de test

El E2E vacía `calendarschool_test.public` al empezar y no al terminar, así que tras la suite quedaban datos (p. ej. 137 cursos y 196 clases). Se vaciaron con `TRUNCATE … CASCADE` (salvo `municipalities` y `_prisma_migrations`) y el recuento coincide con la línea base del paso 8 (`diff` sin diferencias). La base de desarrollo no se tocó.

## Resultado

- Estado del paso 10: PASA
- Problemas bloqueantes: ninguno
