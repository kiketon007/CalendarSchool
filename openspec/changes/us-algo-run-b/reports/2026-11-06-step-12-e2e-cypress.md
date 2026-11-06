# Paso 12: E2E con Cypress (2026-11-06)

Cambio: `us-algo-run-b`.

## Specs

`frontend/cypress/e2e/scheduleGeneration.cy.ts` gana el bloque «mejorar con las preferencias» (3 tests) y dos comprobaciones nuevas en los existentes:

| Escenario | Qué comprueba |
| --- | --- |
| Mejora por defecto | La casilla «Mejorar el horario con las preferencias» está marcada y con su ayuda; al generar, el resumen lleva el desglose con «Franjas preferidas» y «antes de mejorar: 32»; en `/horarios/borrador` se ve el desglose; se confirma como oficial y `/horarios/oficial` lo conserva, también tras recargar |
| Sin mejorar | Con la casilla desmarcada se genera y el resumen dice «Generado sin mejorar: las preferencias no se han aplicado», sin «antes de mejorar»; la casilla sigue desmarcada y habilitada |
| 360 px | La casilla y el desglose se ven y la página no se desplaza en horizontal |
| Miembro (ampliado) | El panel de un `MEMBER` no tiene botones ni casilla |

El mock de la generación en curso lleva ahora los campos nuevos (`improve`, `phase`, `score`, `improvementCancelled`) y el texto «Buscando un horario válido…» sustituye al antiguo «Generando horarios…».

## Ejecución (headless, `npm run test:e2e`)

- Solo la spec: 10 tests, todos correctos.
- Suite completa en una sola tanda: 30 specs, **360 tests, todos correctos**, 8 min 28 s, código de salida 0.

## Limpieza

- El E2E arranca y para sus propios servidores (`:3001` y `:4173`): no queda nada escuchando en `:3000`, `:3001` ni `:4173`.
- La migración `schedule_score` también se aplicó a la base de test al arrancar el E2E. Se vació el esquema `public` de `calendarschool_test` (el E2E no limpia al terminar) y los recuentos de las dos bases son idénticos a la línea base del paso 10, salvo `_prisma_migrations` del esquema `public` de test, que pasa de 18 a 19 por esa migración.
