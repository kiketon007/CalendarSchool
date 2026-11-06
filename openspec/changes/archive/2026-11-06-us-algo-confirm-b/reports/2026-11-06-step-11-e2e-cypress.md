# Paso 11: E2E con Cypress (2026-11-06)

Cambio: `us-algo-confirm-b`. Se añade `frontend/cypress/e2e/schedulePrevious.cy.ts` y se ejecuta la suite completa en modo headless contra el build (`npm run test:e2e`, backend en `:3001` y `vite preview` en `:4173`).

## El spec nuevo (3 tests)

| Test | Qué comprueba |
| --- | --- |
| Lista, abre, cambia de vista, exporta (administrador y miembro) | Dos confirmaciones seguidas dejan un anterior; `/horarios` enlaza «Horarios anteriores (1)»; la lista tiene una fila con quién lo confirmó, «Vigente hasta el» y «6 sesiones»; «Ver» lleva a `/horarios/anteriores/<uuid>`, con «Horario anterior», «Sustituido», «Confirmado el … por …», «Sustituido el …», el aviso de los datos de hoy, la tabla y sin «Confirmar» ni «Descartar»; cambiar a la vista por profesor deja `vista=profesor` en la dirección; «Exportar» descarga `horario-garcia-ana.md` con «Horario oficial confirmado el … · sustituido el …» y sin «Borrador generado el»; un miembro ve la lista y el anterior, con «Exportar» y sin acciones |
| Sin anteriores y un id desconocido | `/horarios/anteriores` dice «Todavía no hay horarios anteriores» con el enlace de vuelta; un id inexistente dice «Este horario no existe» con el enlace a la lista |
| 360 px | La lista y la página de un anterior no desplazan la página en horizontal |

El spec solo, la primera vez: 3 de 3 (18 s).

## Suite completa

El primer intento de `npm run test:e2e` completo lo detuvo el sistema por falta de memoria cuando solo había arrancado el primer fichero (1 de 30), sin ningún fallo de test; no se relanzó hasta confirmar que había memoria libre. La suite se ejecutó entonces en dos tandas con el mismo script:

| Tanda | Specs | Resultado |
| --- | --- | --- |
| 1: `schedule*.cy.ts` | 6 | 32 de 33 en la primera vuelta; el fallo está más abajo. `scheduleConfirmation.cy.ts` repetido: 5 de 5 |
| 2: las otras 24 | 24 | 324 de 324, 6 min 21 s |

### Fallo intermitente de un test existente

`scheduleConfirmation.cy.ts` › `discards a draft, which disappears while the official stays` falló una vez (esperaba `/horarios/borrador` y la dirección era `/horarios/oficial`) y pasó al repetir el spec sin tocar nada. No tiene relación con este cambio (no usa lo nuevo). Causa probable, **sin comprobar**: tras «Generar de nuevo», la comprobación `panel().contains(SUMMARY)` también se cumple con el estado completado de la generación anterior, que enseña el mismo texto, y el clic cae en su enlace «Ver horario oficial» antes de que llegue la generación nueva. Queda anotado; si vuelve a aparecer, hay que corregir el test (esperar a que cambie el estado) y no reintentarlo.

## Limpieza

- Backend (`:3001`) y `vite preview` (`:4173`) parados; los puertos 3000, 3001 y 4173 quedan libres.
- El E2E deja sus datos en `calendarschool_test` (`public`): se vaciaron las tablas salvo `_prisma_migrations` y `municipalities`, y los recuentos de las dos bases son idénticos a la línea base del paso 9.
