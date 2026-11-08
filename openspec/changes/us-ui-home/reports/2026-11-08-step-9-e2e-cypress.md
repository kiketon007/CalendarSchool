# Informe del paso 9 - E2E con Cypress

- Fecha: 2026-11-08
- Cambio: us-ui-home
- Agente: Claude Sonnet 5.5

## Comandos ejecutados

- `npm run test:e2e -- --spec cypress/e2e/onboarding.cy.ts,cypress/e2e/courses.cy.ts`: 41 tests, 41 pasan (1 min 14 s con el build y las migraciones).
- `npm run test:e2e` (suite completa, headless, contra el build servido con `vite preview`): 387 tests, 387 pasan, 0 fallos, 7 min 49 s, código de salida 0.

## Escenarios cubiertos

- **`onboarding.cy.ts` (reescrito, 4 tests):**
  - Administrador: ve el `h1` con su nombre, el colegio, el `time` visible con un `datetime` `AAAA-MM-DD`, las siete secciones como enlaces (ruta y descripción) y ni «Comedor» ni «Próximamente». «Inicio» lleva `aria-current` y la marca no. Va a Horarios desde su tarjeta y vuelve con «Inicio»; va a `/usuarios` desde su tarjeta (espera `GET /api/users` con 200) y vuelve con la marca.
  - Miembro (creado con la tarea `createUser`): inicia sesión, ve las siete secciones y exactamente 7 enlaces, y no ve «Administración» ni «Usuarios».
  - 360 px: ocho enlaces para el administrador, todos con la misma `left`, apilados, de al menos 44 px de alto, sin desplazamiento horizontal.
  - 1280 px: las cuatro primeras tarjetas con la misma `top`, la quinta en la fila siguiente y en la primera columna, sin desplazamiento horizontal.
- **`courses.cy.ts`:** el caso de «Gestión de horarios» como próximamente pasa a comprobar que la tarjeta «Horarios» enlaza a `/horarios` y no dice «Próximamente».
- **Specs que visitan la portada** (`registration`, `login`, `session`, `logout`): sin cambios, porque solo comprueban el `data-testid`, el nombre y el colegio.

## Verificación de datos

- Los datos del E2E se limpian al empezar cada ejecución (`scripts/e2eData.mjs`); `calendarschool` (desarrollo) sigue con 0 colegios y 0 usuarios, como en la línea base del paso 7.
- No hubo que restaurar nada.

## Resultado

- Estado del paso 9: **PASS**
- Incidencias: ninguna. `scheduleConfirmation.cy.ts`, que falló una vez en el cambio anterior, pasó a la primera.
