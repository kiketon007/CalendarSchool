# Informe del paso 12 - E2E con Cypress

- Fecha: 2026-10-30
- Cambio: us19-d-franjas-preferidas
- Agente: Claude Sonnet 5.5

## Comandos ejecutados

- `npm run test:e2e -- --spec cypress/e2e/slots.cy.ts` (compila, migra, arranca el backend en :3001 y `vite preview` en :4173 y ejecuta Cypress en modo headless).
- `npm run test:e2e` completo.
- `npm run typecheck -w frontend`, que incluye las specs de Cypress.

## Specs nuevas en `cypress/e2e/slots.cy.ts`

Un `describe` nuevo, «Franjas preferidas de una asignatura», con sus propios `cy.intercept` (registrados una sola vez) y 7 tests:

1. **Abrir, marcar, guardar:** abre las preferidas desde la matriz, marca con las cabeceras de sesión las sesiones 1 y 2 de los cinco días (10 celdas, con el recreo a la vista), guarda con un único `PUT` y ve «Franjas preferidas (10)» en la matriz, sin tocar el enlace de las prohibidas.
2. **Prohibidas visibles y no marcables:** con el lunes entero prohibido, sus celdas están deshabilitadas con «Prohibida» en su nombre, la cabecera «Lunes» está deshabilitada y la cabecera de la sesión 1 solo marca de martes a viernes (4 celdas).
3. **Contradicción posterior:** una preferida (martes 2ª) que después se prohíbe se ve como «Preferida · prohibida, se ignora»; el aviso «1 franja preferida está prohibida y se ignorará» sale en rojo (`text-danger`) en la carga y en la página; al desmarcarla el aviso desaparece, se guarda una lista vacía y la matriz vuelve a «Franjas preferidas» sin aviso.
4. **Vaciar:** vaciar las preferidas quita el número de la matriz y deja las prohibidas (`Franjas prohibidas (1)`).
5. **Sin calendario:** no hay enlace de preferidas y se explica qué falta.
6. **`MEMBER`:** ve las preferidas, las prohibidas y las dos a la vez como texto, sin botones ni «Guardar», con el aviso de solo administradores.
7. **360 px:** la cuadrícula con el recreo y los tres estados cabe sin desplazamiento horizontal.

Las 10 specs anteriores de `slots.cy.ts` siguen igual; solo cambió la clave del texto «guardadas» (`slots.type.forbidden.saved`).

## Resultados

- `slots.cy.ts`: **17 pasan** (10 anteriores y 7 nuevas), 0 fallos, 25 s.
- `npm run test:e2e` completo: **291 pasan** en 20 specs, 0 fallos, 0 pendientes, 6 min 5 s, código de salida 0. Entre ellas `workload.cy.ts` (14) y `subjects.cy.ts` (27), que usan las formas de la carga que cambian.
- Sin capturas ni vídeos de fallos: no los hubo. Los tres servicios del E2E (:3000, :3001 y :4173) quedaron libres.

## Persistencia y base de datos

- Lo guardado desde la interfaz se comprobó releyéndolo de la API: la matriz refleja `preferredSlotCount` tras volver de la página, y las prohibidas no cambian al guardar las preferidas.
- El E2E solo limpia la base al empezar, así que al terminar quedaban los datos de la ejecución en `calendarschool_test.public` (246 colegios, 178 cursos y 98 celdas, entre otros). Se vaciaron con `TRUNCATE public.schools, public.users, public.rate_limit_attempts CASCADE`.
- Los recuentos por tabla coinciden con la línea base del paso 10. Estado restaurado: sí.

## Resultado

- Estado del paso 12: **PASS**
- Incidencias bloqueantes: ninguna.
