# Informe del paso 11 - E2E con Cypress

- Fecha: 2026-10-23
- Cambio: us-base-calendario
- Agente: Claude Sonnet 5.5

## Comandos ejecutados

- `npm run test:e2e -- --spec cypress/e2e/calendars.cy.ts` (varias veces, hasta dejarlo en verde).
- `npm run test:e2e` completo (compila, migra `calendarschool_test`, arranca el backend en :3001 y `vite preview` en :4173).
- `npm run lint`, `npm run typecheck -w frontend` y los tests de `AppHeader` y `CalendarForm` tras los cambios de maquetación.
- Recuento de tablas antes y después con `countsCal.sh`.

## Escenarios de `calendars.cy.ts` (6)

| Escenario | Resultado |
|---|---|
| Crear «Primaria» generando las sesiones (6 × 45 min desde las 09:00, recreo de 30 min tras la tercera, un curso) y verla con su resumen «6 sesiones al día · 30 a la semana · 270 minutos lectivos al día» | Pasa |
| Crear «Infantil» generando 4 sesiones con recreo y editando a mano el fin del recreo (10:45) y el de la cuarta sesión (12:15): «4 sesiones al día · 20 a la semana · 165 minutos lectivos al día», sin cursos | Pasa |
| Mover un curso de «Primaria» a un calendario nuevo, con el aviso «Ahora sigue «Primaria»: se moverá» | Pasa |
| Nombre repetido (` primaria `): error bajo el nombre, sigue en el formulario con lo escrito; otro nombre guarda | Pasa |
| `MEMBER` (tarea `createUser`): ve la lista sin «Crear calendario», con el texto de solo lectura, y `/calendarios/nuevo` lo lleva a `/onboarding` | Pasa |
| Formulario a 360 px sin desplazamiento horizontal | Pasa (tras corregir el hallazgo de abajo) |

Cada `cy.intercept` se registra una sola vez (el alias `listCalendars` de `beforeEach`).

## Hallazgo: desbordamiento horizontal a 360 px

- La primera ejecución falló en el escenario de 360 px: `expected 396 to be at most 345`.
- Un spec temporal (ya borrado) listó los elementos que sobrepasan el ancho: **no era el formulario, sino la cabecera**. Con el nuevo enlace «Calendario», los cinco enlaces de un administrador (`Cursos`, `Profesores`, `Alumnos`, `Calendario`, `Usuarios`) ya no caben en una línea y el `nav` (`d-flex gap-3`, sin `flex-wrap`) llegaba a 396 px.
- Corrección en `AppHeader.tsx`: el `nav` pasa a `d-flex flex-wrap column-gap-3 row-gap-1`, así que los enlaces saltan de línea en pantallas estrechas.
- Mejora aparte en `CalendarForm.tsx`: en cada fila de periodo, las horas ocupan `col-6` y «Quitar» `col-12` en móvil (antes `col-5/col-5/col-2`, con «Quitar» demasiado estrecho para su texto); desde 768 px no cambia.

## Resultados

| Comprobación | Resultado |
|---|---|
| `calendars.cy.ts` | 6 de 6 |
| `npm run test:e2e` completo | **212 de 212**, 17 specs, código de salida 0, sin «Unhandled» |
| Tests de `AppHeader` y `CalendarForm` | 67 de 67 |
| `npm run lint` y `npm run typecheck -w frontend` | Código de salida 0 (ver la corrección de abajo) |

## Corrección posterior: el lint de la PR falló

- La CI (`Lint y formato`) falló en `calendars.cy.ts:211` con `cypress/unsafe-to-chain-command` (`nameField().clear().type(...)`). En local había visto «lint=0», pero ese valor era el código de salida de `tail`, no el de `npm run lint`: el lint ya fallaba y no lo comprobé bien.
- Se separó el encadenado (`clear()` y `type()` en dos órdenes) y se repitió `npm run lint` y `npm run typecheck --workspaces` guardando el log y leyendo el código de salida: ambos 0. Regla para el resto del trabajo: nunca leer el código de salida tras una tubería.

## Verificación de la base de datos

- Antes de limpiar, `calendarschool_test.public` tenía los datos de la ejecución (189 usuarios, 167 colegios, 103 cursos, 7 calendarios y 42 periodos, entre otros); la limpieza del E2E solo ocurre al empezar, no al terminar.
- Se vació con un script temporal (`cleanE2eData` con `assertTestDatabaseUrl`, ya borrado). Después todo está a 0 salvo `municipalities` (542); `calendarschool.public` y `test_1` a `test_4` siguen idénticos a la línea base.
- La migración `add_calendars` se aplicó a `calendarschool_test.public` en esta ejecución (el paso 9 decía que faltaba).
- Puertos 3001 y 4173 libres al terminar.

## Resultado

- Estado del paso 11: PASA
- Problemas bloqueantes: ninguno
