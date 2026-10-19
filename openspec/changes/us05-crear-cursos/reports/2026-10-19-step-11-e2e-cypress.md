# Informe del paso 11 - E2E con Cypress

- Fecha: 2026-10-19
- Cambio: us05-crear-cursos
- Agente: Claude Sonnet 5.5

## Qué se añadió

- **`frontend/cypress/e2e/courses.cy.ts`** (11 tests). Usan el alta por la API, la tarea `createUser` para el miembro y datos únicos por test:
  1. **Administrador, recorrido completo.** Tras registrarse entra en «Cursos» desde la navegación (`GET /api/courses` → `200`), ve «Todavía no hay cursos», pulsa «Crear curso», rellena «1º Primaria» con las clases `A` y `B` (añadiendo una fila) y guarda (`POST` → `201`). Vuelve a `/cursos` con el aviso «Curso «1º Primaria» creado» y ve el curso con `A — Sin tutor` y `B — Sin tutor`.
  2. **Caracteres especiales.** «Infantil 3 años - 2º ESO/ñ» con las clases `1ªA` y `Grupo Ñ` se acepta (`201`) y se ve en el listado (así queda probado de extremo a extremo que `º`, `ª`, `ñ` y los acentos viajan bien en UTF-8 desde el navegador).
  3. **Orden natural.** Con «10º Curso» y «2º Primaria» creados en ese orden, el listado muestra primero «2º Primaria».
  4. **Curso repetido.** Crear «  1º   PRIMARIA » cuando existe «1º Primaria» responde `409`, se queda en `/cursos/nuevo`, muestra el error bajo el nombre, marca el campo con `aria-invalid` y conserva lo escrito.
  5. **Validación en el navegador.** Guardar vacío muestra los errores del nombre y de la clase y pone el foco en el nombre; con las clases `A` y ` a ` muestra el error de clase repetida; en ambos casos no se envía ninguna petición (`@createCourse.all` vacío).
  6. **Máximo de clases.** Con 12 filas, «Añadir clase» queda deshabilitado.
  7. **Miembro.** Un `MEMBER` creado con `createUser` inicia sesión, ve «Cursos» y no «Usuarios» en la navegación, y crea un curso.
  8. **Aislamiento.** Un administrador de otro colegio ve el listado vacío.
  9. **Bienvenida sin cambios.** La tarjeta «Gestión de horarios» sigue «Próximamente», sin enlace ni botón.
  10. **Sin sesión.** `/cursos` y `/cursos/nuevo` llevan a `/login`.
  11. **360 px.** Sin desplazamiento horizontal con los errores del formulario y con un curso de seis clases en el listado.
- **Revisión de los E2E existentes (8.2):** no necesitaron cambios. Los que miran la navegación solo comprueban el enlace «Usuarios», que un `MEMBER` sigue sin ver.

## Comandos ejecutados

Desde la raíz, con PostgreSQL 17 en Docker Compose; el script compila ambos workspaces, migra la base de test, la vacía, arranca el backend (:3001) y `vite preview` (:4173) y ejecuta Cypress en modo headless:

- `npm run test:e2e -- --spec cypress/e2e/courses.cy.ts`
- `npm run test:e2e` (suite completa), con la salida a un fichero
- Limpieza al terminar: `cleanE2eData` de `scripts/e2eData.mjs` sobre el esquema `public` de `calendarschool_test`.

## Resultados

- **Spec nueva:** 11 de 11 a la primera. Se escribió con la implementación ya hecha, así que no se vio en rojo; lo que cubre ya tenía sus tests unitarios y de integración en rojo antes (paso 9).
- **Suite completa** (2 min 35 s de Cypress, 3 min 38 s en total, salida 0): 122 pasan, 0 fallan, 0 pendientes, en 14 ficheros (los 111 de antes más los 11 nuevos):

| Spec | Tests |
|---|---|
| `courses.cy.ts` | 11 |
| `csp.cy.ts` | 11 |
| `health.cy.ts` | 1 |
| `home.cy.ts` | 1 |
| `invitation-acceptance.cy.ts` | 4 |
| `invitations.cy.ts` | 2 |
| `login.cy.ts` | 21 |
| `logout.cy.ts` | 6 |
| `onboarding.cy.ts` | 4 |
| `password-reset.cy.ts` | 5 |
| `registration.cy.ts` | 33 |
| `session.cy.ts` | 13 |
| `users-management.cy.ts` | 4 |
| `users.cy.ts` | 6 |

- El script del E2E aplicó la migración `add_courses_and_classes` al esquema `public` de `calendarschool_test` (8 migraciones aplicadas).
- Los puertos 3000, 3001 y 4173 quedaron libres al terminar.
- Notas: sin tests inestables ni reintentos. Queda sin comprobar en un navegador real el contraste de los textos nuevos (`axe` en jsdom no lo mide), que se verá en la comprobación de producción.

## Base de datos de test

- Antes de la ejecución, `calendarschool_test.public` no tenía las tablas nuevas (se migró al arrancar el E2E).
- Tras la suite completa quedaban datos del E2E (los vacía el script al empezar, nunca al terminar): 93 usuarios, 78 colegios, 96 sesiones, 100 intentos, 13 enlaces de acceso, 8 cursos y 15 clases.
- Restauración: `cleanE2eData` los vació. Ahora `public` tiene todas las tablas de datos a 0 y `municipalities` a 542.
- `calendarschool` y los esquemas `test_1` a `test_4` son idénticos a la línea base del paso 9 (comparados con `diff`).

## Resultado

- Estado del paso 11: PASA
- Problemas bloqueantes: ninguno
