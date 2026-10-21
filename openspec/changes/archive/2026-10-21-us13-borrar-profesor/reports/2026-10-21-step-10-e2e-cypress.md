# Informe del paso 10 - E2E con Cypress

- Fecha: 2026-10-21
- Cambio: us13-borrar-profesor
- Agente: Claude Sonnet 5.5

## Comandos ejecutados

- `npm run test:e2e -- --spec cypress/e2e/professors.cy.ts` (headless).
- `npm run test:e2e` completo.

## Resultados

- `professors.cy.ts`: **29** tests, todos pasan a la primera (6 nuevos en «deleting a professor»).
- Suite completa: 15 specs, **169** tests, todos pasan, sin reintentos.
- Casos nuevos:
  - Borrar un profesor sin clase: el diálogo no avisa de ninguna clase, el aviso final es «Profesor «Ana García» eliminado», la fila desaparece y el foco queda en el título.
  - Borrar uno con tutoría: el diálogo dice «Tutoriza 1º Primaria A: la clase quedará sin tutor.», el aviso final nombra la clase y en `/cursos` aparece la otra clase con su tutor y la liberada sin tutor.
  - Cancelar con Escape: no se borra nada y el foco vuelve al botón «Borrar».
  - Otra persona borra al profesor por la API antes de confirmar: aviso «Ese profesor ya no existe», diálogo cerrado y lista actualizada.
  - Búsqueda activa cuyo único resultado se borra: se mantiene el texto y se dice que nada coincide.
  - 360 px: se borra desde la tarjeta, con el diálogo abierto y sin desplazamiento horizontal.

## Base de datos de test

- Tras el E2E la base `calendarschool_test` conservaba los datos de la ejecución (el E2E solo limpia al empezar). Se restauró con `cleanE2eData` y los recuentos quedaron **idénticos** a la línea base (`diff` sin diferencias). Sin cambios en `scripts/` (el script temporal se eliminó).

## Resultado

- Estado del paso 10: PASA
- Problemas bloqueantes: ninguno
