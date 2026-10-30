# Informe del paso 12 - E2E con Cypress

- Fecha: 2026-10-30
- Cambio: us19-c-franjas-prohibidas
- Agente: Claude (Sonnet 5.5)

## Tests nuevos (`cypress/e2e/slots.cy.ts`, 10 tests)

- Abrir las franjas desde la carga con el recreo en la cuadrícula, marcar lunes, miércoles y viernes con las cabeceras (18 celdas), guardar con un único `PUT` y ver «Franjas prohibidas (18)» en la matriz.
- Desmarcar una columna que estaba entera con su cabecera, guardar la lista vacía y ver desaparecer el número de la matriz.
- El aviso de que la asignatura no cabe se ve al marcar tres días, antes de guardar; guardar sigue siendo posible y el aviso desaparece al desmarcar.
- La matriz recalcula el aviso con las franjas de la asignatura al subir sus sesiones, sin guardar.
- Un calendario que pasa de 6 a 5 sesiones: la cuadrícula muestra 5 filas, el aviso «Hay 5 franjas fuera del calendario actual; se quitarán al guardar» (también en la matriz) y guardar las quita.
- Un curso sin calendario: la matriz no ofrece el enlace y dice «Asigna un calendario para definir franjas»; abierta por su dirección, la página lo explica con un enlace a los calendarios y sin cuadrícula.
- La asignatura que deja de impartirse mientras se tiene abierta la cuadrícula: el `PUT` responde `404` y la página muestra la vista «ya no se imparte».
- Un `MEMBER` ve la cuadrícula sin ningún botón, con las celdas como texto, sin «Guardar» y con el texto de solo administradores.
- La cuadrícula con su recreo a 360 px, sin desplazamiento horizontal y con la última celda visible.
- Cada `cy.intercept` se registra una sola vez en el `beforeEach`.

`workload.cy.ts` y `subjects.cy.ts` no necesitaron cambios.

## Ejecución (12.2)

`slots.cy.ts` y `workload.cy.ts` en modo headless con `npm run test:e2e -- --spec …`: `slots` 10/10 y `workload` 14/14, con salida 0. El primer intento de `slots` falló en 2 tests **por las horas que yo escribí**: los periodos del calendario de ayuda duran 45 minutos, también el recreo, y los textos esperaban un recreo de 30 minutos («Recreo 11:15–11:45» y una sesión 6 de 13:15 a 14:00 en vez de «11:15–12:00» y «13:30–14:15»). Se corrigieron las horas del test.

`npm run test:e2e` completo: **284 de 284, 20 specs, salida 0**.

## Base de datos de test (12.3)

El E2E trabaja en el esquema `public` de `calendarschool_test` y deja los datos de la última ejecución hasta la siguiente. Se vaciaron las tablas de la aplicación con `TRUNCATE … CASCADE` (sin tocar `_prisma_migrations` ni `municipalities`) y los puertos 3001 y 4173 quedan libres. Los recuentos son los de la línea base del paso 10 salvo dos diferencias esperadas: `public._prisma_migrations` pasa de 13 a 14 y aparece `public.scheduling_constraint_slots` (0 filas), porque el E2E aplica las migraciones pendientes a ese esquema.

Después de la ejecución, `npm run lint` marcó dos reglas de Cypress (`unsafe-to-chain-command`) en el test de 360 px, por encadenar `.scrollIntoView().should(...)`. Se separaron las dos cadenas y se repitió `slots.cy.ts` (10/10, salida 0) y el lint (0).

## Ajuste posterior: los avisos en rojo

`slots.cy.ts` (10/10) y `workload.cy.ts` (14/14) comprueban ahora la clase de peligro del aviso de que no cabe y del aviso del curso sin calendario; salida 0 en las dos. La base de datos de test se vació después.
