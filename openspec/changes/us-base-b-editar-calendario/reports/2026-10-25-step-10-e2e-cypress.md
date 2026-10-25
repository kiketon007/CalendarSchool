# Informe del paso 10 - E2E con Cypress

- Fecha: 2026-10-25
- Cambio: us-base-b-editar-calendario
- Agente: Claude Sonnet 5.5

## Comandos ejecutados

- `npm run test:e2e -- --spec cypress/e2e/calendars.cy.ts` (varias veces, hasta dejarlo en verde).
- `npm run test:e2e` completo (compila, migra `calendarschool_test`, arranca el backend en :3001 y `vite preview` en :4173).
- `npm run lint`-equivalente sobre el spec (`eslint cypress/e2e/calendars.cy.ts`, con la configuración del proyecto, que incluye `cypress/unsafe-to-chain-command`) y `npm run typecheck -w frontend`, ambos con su código de salida.
- Recuento de tablas antes y después con `countsCal.sh`.

## Escenarios nuevos de `calendars.cy.ts` (10, en «Editar calendarios»)

| Escenario | Resultado |
|---|---|
| Abrir la edición desde el listado con «Editar Primaria»: ruta `/calendarios/<id>/editar`, título, nombre, recreo y última sesión cargados, el curso marcado, «Guardar» deshabilitado, y «Cancelar» vuelve al listado | Pasa |
| «Guardar» sigue deshabilitado con espacios al final del nombre o tras cambiar una hora y devolverla a su valor, y se habilita con un cambio real | Pasa |
| Renombrar y ver «Calendario «Primaria 1º ciclo» actualizado» con el nombre guardado | Pasa |
| Mover el recreo (11:00–11:30) y reajustar las sesiones de alrededor; el listado lo muestra | Pasa |
| Quitar la sesión 6: «5 sesiones al día · 25 a la semana · 225 minutos lectivos al día» | Pasa |
| Liberar un curso y mover otro desde un segundo calendario, con los dos avisos («Se quedará sin calendario» y «Ahora sigue «Infantil»: se moverá») antes de guardar; el listado queda con «Cursos: 1º Primaria, 3º Primaria», «Infantil» sin cursos y «2º Primaria» en ningún calendario | Pasa |
| Nombre de otro calendario: error bajo el nombre con el foco, sigue en la edición con lo escrito, y con otro nombre se guarda | Pasa |
| Calendario que no existe (UUID desconocido y un `id` que no es UUID): «no existe o ya no está disponible» con el enlace a «Calendarios» | Pasa |
| Un `MEMBER` ve los calendarios sin ningún «Editar» y `/calendarios/<id>/editar` lo lleva a `/onboarding` | Pasa |
| La edición a 360 px sin desplazamiento horizontal | Pasa |

Cada `cy.intercept` se registra una sola vez (el alias `listCalendars` del `beforeEach`) y ningún comando se encadena tras `clear()`.

## Resultados

| Comprobación | Resultado |
|---|---|
| `calendars.cy.ts` | **18 de 18** (8 anteriores y 10 nuevos) |
| `npm run test:e2e` completo | **224 de 224**, 17 specs, código de salida 0, sin «Unhandled» |
| ESLint del spec y `npm run typecheck -w frontend` | Código de salida 0 |

## Incidencias del propio spec (no de la aplicación)

- La primera ejecución dio 16 de 18: dos escenarios buscaban el `input` de una casilla dentro de su `label` (`cy.contains('label', …).find('input')`), pero en Bootstrap la etiqueta y la casilla son hermanas, ligadas por `for`. Se añadió un helper (`courseCheckbox`) que sigue el `for` de la etiqueta.
- ESLint rechazó una aserción de tipo innecesaria en los datos de prueba y se quitó.
- Cypress no puede borrar un calendario (US-BASE_c todavía no existe), así que el `404` se prueba con un UUID que no existe y con un `id` que no es UUID, no con un calendario borrado entre medias; el caso del calendario borrado mientras se edita (`404` al guardar) lo cubren los tests de la página y los de integración HTTP.

## Verificación de la base de datos

- Antes de limpiar, `calendarschool_test.public` tenía los datos de la ejecución (202 usuarios, 179 colegios, 107 cursos, 19 calendarios y 120 periodos, entre otros); la limpieza del E2E solo ocurre al empezar, no al terminar.
- Se vació con un script temporal (`cleanE2eData` con `assertTestDatabaseUrl`, ya borrado). Después todo está a 0 salvo `municipalities` (542) y el recuento es **idéntico** a la línea base de este cambio, también en `calendarschool.public` y `test_1` a `test_4`.
- Puertos 3001 y 4173 libres al terminar.

## Resultado

- Estado del paso 10: PASA
- Problemas bloqueantes: ninguno
