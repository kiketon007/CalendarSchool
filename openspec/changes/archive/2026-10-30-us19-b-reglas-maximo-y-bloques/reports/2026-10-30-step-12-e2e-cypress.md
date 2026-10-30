# Informe del paso 12 - E2E con Cypress

- Fecha: 2026-10-30
- Cambio: us19-b-reglas-maximo-y-bloques
- Agente: Claude (Sonnet 5.5)

## Tests nuevos o ampliados

- **`workload.cy.ts` (14 tests, 7 nuevos en `describe('the scheduling rules')`):**
  - Poner un máximo al día y un bloque, guardar la fila entera (`maxPerDay`, `blockSize`) y ver «1º Primaria: 4 sesiones · 2 reglas» en la tarjeta de `/asignaturas`.
  - «Guardar» se habilita con un cambio solo de reglas y envía `null` al vaciarla.
  - El aviso de un bloque mayor que la carga: se ve, no impide guardar y se mantiene al recargar.
  - El aviso de «no cabe» con un calendario con recreo tras la 1ª sesión (3 sesiones en bloques de 3), que desaparece con bloques de 2.
  - Pasar a «No se imparte»: aviso «Al guardar se borrarán sus 2 reglas en este curso», selectores deshabilitados, reglas borradas al guardar y a cero al volver a impartirla.
  - Un `MEMBER` ve «Inglés: 4 sesiones · como mucho 2 al día · en bloques de 2», sin selectores.
  - La matriz con reglas y avisos a 360 px, sin desplazamiento horizontal.
- **`subjects.cy.ts` (27 tests, 4 nuevos en `describe('Asignaturas: reglas de reparto')`):** «· N reglas» en la tarjeta, el aviso al desmarcar un curso con reglas (y que no sale en uno sin ellas ni al volver a marcarlo), guardar y que las reglas desaparecen, guardar solo el nombre y que se conservan, y «Se borrarán también N reglas de reparto» en el diálogo de borrado.
- **`courses.cy.ts` (36 tests, 2 nuevos):** el diálogo de borrar un curso con 4 reglas (`impact.constraintCount` y `deleted.constraintCount`, y que las asignaturas pierden el curso) y que no menciona reglas en un curso sin ellas. Se actualizó el `deep.equal` del borrado, que ahora lleva `constraintCount: 0`.
- Cada `cy.intercept` se registra una sola vez por `describe`/`beforeEach`.

## Ejecución (12.3)

Las tres specs en modo headless con `npm run test:e2e -- --spec …`: `workload` 14/14, `subjects` 27/27 y `courses` 36/36, con salida 0.

`npm run test:e2e` completo, **primera pasada: 273 de 274, salida 1.** Falló un test que este cambio no escribió: `subjects.cy.ts › says that nothing matches when the only visible subject is deleted with a filter on…` («Expected to find element: button[aria-label="Borrar Música"]»). La captura mostraba el campo de búsqueda aún con «ingl» y el título con el foco: `clear()` se ejecutó antes de que el foco pasara al `h1` (un turno después de cerrarse el diálogo) y ese cambio de foco llegó en medio de la edición. Repetida la spec dos veces seguía fallando y aislada una vez había pasado, así que es una carrera del test y no del código. Se estabilizó esperando el foco (`cy.get('h1').should('have.focus')`) antes de `clear()`, como ya hace el test de borrado con cursos. Con ese cambio, la spec pasó dos veces seguidas (27/27) y el conjunto completo, **segunda pasada: 274 de 274, salida 0** (19 specs).

## Base de datos de test (12.4)

El E2E trabaja en el esquema `public` de `calendarschool_test` y deja los datos de la última ejecución hasta la siguiente. Se vaciaron las tablas de la aplicación con `TRUNCATE … CASCADE` (sin tocar `_prisma_migrations` ni `municipalities`) y los puertos 3001 y 4173 quedan libres. Los recuentos son los de la línea base del paso 10 salvo dos diferencias esperadas: `public._prisma_migrations` pasa de 12 a 13 y aparece `public.scheduling_constraints` (0 filas), porque el E2E aplica las migraciones pendientes a ese esquema, que antes no tenía `add_scheduling_constraints`.
