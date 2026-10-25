# Informe del paso 10 - E2E con Cypress

- Fecha: 2026-10-25
- Cambio: us-base-c-borrar-calendario
- Agente: Claude Sonnet 5.5

## Qué se añadió

`frontend/cypress/e2e/calendars.cy.ts` gana un `describe('Borrar calendarios')` con 7 casos, contra el build servido con `vite preview` (:4173) y un backend real (:3001) con captcha falso:

1. **Diálogo y cancelar:** al abrir «Borrar Primaria» dice «¿Borrar el calendario «Primaria»?», «Estos cursos se quedarán sin calendario: 1º Primaria, 2º Primaria» y «Esta acción no se puede deshacer», con el foco en «Cancelar» y sin ningún `DELETE` ni nueva petición de la lista. Cancelar con el botón y con Escape cierra el diálogo, devuelve el foco al botón «Borrar» de esa tarjeta y no borra nada.
2. **Borrar con cursos:** el `DELETE` responde `200`, el aviso dice «Calendario «Primaria» eliminado. 2 cursos se quedan sin calendario» en un `role="status"`, el foco está en el `h1`, la tarjeta desaparece, la otra sigue y la lista se pidió una sola vez. Tras recargar sigue borrado; los dos cursos existen en `/cursos` y, en el formulario de un calendario nuevo, aparecen sin el aviso «Ahora sigue…» (no siguen ninguno).
3. **Borrar sin cursos:** el diálogo dice «Ningún curso sigue este calendario» y el aviso es «Calendario «Infantil» eliminado», sin mención a cursos.
4. **El último:** se ve «Todavía no hay calendarios», no queda ninguna tarjeta y el foco está en el título.
5. **Ya no existe:** otra persona (una petición `DELETE` por la API) lo borra con el diálogo abierto; al confirmar responde `404`, el diálogo se cierra, se lee «Ese calendario ya no existe» y la lista se pide por segunda vez sin la tarjeta.
6. **Miembro:** un `MEMBER` ve los calendarios sin «Borrar» y sin «Editar».
7. **360 px:** con el diálogo abierto no hay desplazamiento horizontal y «Borrar calendario» es visible.

Cada `cy.intercept` se registra una sola vez (en el `beforeEach` del `describe` nuevo, que no repite el alias del anterior), no se encadena nada tras `clear()` y las casillas se buscan por el `for` de su etiqueta.

## Comandos ejecutados

- `npm run typecheck -w frontend` (incluye los specs de Cypress): código de salida 0.
- `npm run test:e2e -- --spec cypress/e2e/calendars.cy.ts`: código de salida 0, **25 casos pasan** (los 18 de antes y los 7 nuevos).
- `npm run test:e2e` (todos los specs): código de salida **0**, **231 casos pasan** y ninguno falla ni se salta, en 04:06. Sin errores `Unhandled` ni `Uncaught`.
- Navegador: Electron 146 en modo headless (Cypress 16.1.1).

## Resultados por spec

| Spec | Casos |
|---|---|
| calendars.cy.ts | 25 |
| courses.cy.ts | 34 |
| csp.cy.ts | 11 |
| health.cy.ts | 1 |
| home.cy.ts | 1 |
| invitation-acceptance.cy.ts | 4 |
| invitations.cy.ts | 2 |
| login.cy.ts | 21 |
| logout.cy.ts | 6 |
| onboarding.cy.ts | 4 |
| password-reset.cy.ts | 5 |
| professors.cy.ts | 29 |
| registration.cy.ts | 33 |
| session.cy.ts | 13 |
| students.cy.ts | 32 |
| users-management.cy.ts | 4 |
| users.cy.ts | 6 |
| **Total** | **231** |

## Verificación de la base de datos

- El E2E limpia las tablas **al empezar** y no al terminar, así que `calendarschool_test.public` quedó con los datos de la ejecución (210 usuarios, 186 colegios, 112 cursos, 171 clases, 110 profesores, 141 alumnos, 25 calendarios y 158 periodos, entre otros). El resto de esquemas no cambió.
- Se vaciaron esas tablas con un `TRUNCATE … CASCADE` salvo `municipalities` y `_prisma_migrations` (11 migraciones aplicadas) y el recuento volvió a ser **idéntico** a la línea base (`diff` sin diferencias).
- Los puertos 3001 y 4173 quedaron libres: el script de E2E para sus servidores.

## Observaciones

- El E2E pasó a la primera. Los selectores de los casos anteriores (`article h2`, `a[aria-label^="Editar"]`) no dependen de la estructura de la tarjeta, que ahora envuelve «Editar» y «Borrar» en un `div`.
- El caso del foco en el título después de borrar comprueba `have.focus` en el `h1`, que es lo que jsdom no reproduce (react-bootstrap suelta la captura de foco justo después de `onExited`; la página enfoca un turno más tarde).

## Resultado

- Estado del paso 10: PASA
- Problemas bloqueantes: ninguno
