## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/redirect-root-to-login` desde `main` actualizada, con los artefactos de este cambio.
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene eso y `.claude/settings.json`, que debe estar en Sonnet con esfuerzo medio para implementar.

## 1. Frontend: la redirección de la raíz (TDD)

- [x] 1.1 Tests que fallan en `App.test.tsx`:
  - `/` sin sesión acaba en `/login` con el formulario visible y sin avisos;
  - `/` con sesión acaba en `/onboarding`;
  - mientras la sesión se resuelve se ve el indicador de carga y no `home-page`;
  - la entrada `/` no queda en el historial.

  Sustituir el test «renders the home page at the root path without redirecting».
- [x] 1.2 Implementar: la ruta `/` pasa a `<Navigate to="/login" replace />` en `App.tsx`.
- [x] 1.3 Eliminar `HomePage.tsx` y `HomePage.test.tsx`, y las claves `home.*` de `es.json` y `en.json` (el test de paridad sigue en verde), sin dejar importaciones muertas.

## 2. Revisar y actualizar los tests existentes (MANDATORY)

- [x] 2.1 Revisar los tests que mencionan la página inicial o `home-page` y ajustarlos: `App.test.tsx`, los tests de i18n y los E2E `home.cy.ts` y `session.cy.ts`. `password-reset.cy.ts` visita `/` solo como «otra página» antes de abrir `/restablecer`: comprobar que sigue sirviendo.

## 3. Ejecutar los tests y verificar el estado de la base de datos (MANDATORY)

- [x] 3.1 Capturar la línea base de recuentos de `calendarschool` y `calendarschool_test`.
- [x] 3.2 Ejecutar los tests de los módulos cambiados.
- [x] 3.3 Ejecutar `npm test` con cobertura (80 % frontend), `npm run lint` y `typecheck`.
- [x] 3.4 Comprobar que la base queda como en la línea base y restaurarla si no.
- [x] 3.5 Crear `reports/YYYY-MM-DD-step-3-unit-test-and-db-verification.md` y marcar el paso solo con el informe creado.

## 4. Comprobación manual con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 4.1 El cambio no añade ni modifica endpoints, así que no hay peticiones nuevas que probar. Con la aplicación compilada y `vite preview` arrancado contra el backend de desarrollo: `GET /` responde `200` con la SPA (el mismo `index.html` que `/login`), `GET /api/health` responde `ok` y el bundle no contiene las claves `home.title` ni `home.description`.
- [x] 4.2 Parar los servidores y comprobar que los puertos quedan libres. Crear `reports/YYYY-MM-DD-step-4-curl-manual-testing.md`, indicando que la redirección en sí la cubren el test de `App` y el E2E, porque `curl` no ejecuta JavaScript.

## 5. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 5.1 Sustituir `home.cy.ts` por una spec de la redirección de la raíz:
  - `cy.visit('/')` sin sesión acaba en `/login` con `login-page` visible y sin errores de consola;
  - tras iniciar sesión, `cy.visit('/')` acaba en `/onboarding`;
  - «atrás» desde `/login` no vuelve a `/`.

  Ajustar `session.cy.ts` («does not show any error on the home page when there is no session») para que compruebe `/login`.
- [x] 5.2 Ejecutar la spec y la suite completa en modo headless (`npm run test:e2e`) y crear `reports/YYYY-MM-DD-step-5-e2e-cypress.md`.

## 6. Documentación técnica (MANDATORY)

- [x] 6.1 Actualizar con la skill `update-docs`:
  - `README.md`: el árbol de ficheros (`home.cy.ts`, `HomePage.tsx` y `HomePage.test.tsx`);
  - `CLAUDE.md` y `docs/frontend-standards.md`: el ejemplo de `vitest run` que apuntaba a `HomePage.test.tsx`;
  - `frontend/CLAUDE.md`: que `/` redirige a `/login`;
  - `docs/User_Stories_MVP.md`: una nota en la historia del inicio de sesión (US02) y el estado en el resumen del módulo.

  Las historias antiguas (US00 y el despliegue) describen cómo era entonces y no se tocan.
- [x] 6.2 Verificar que `.claude/settings.json` está en Sonnet con esfuerzo medio.
- [x] 6.3 Verificar con `openspec validate redirect-root-to-login --strict` que el cambio es válido.

## 7. Entrega y comprobación en producción

- [x] 7.1 Repetir `npm run lint`, `typecheck` y los tests, cada uno con su código de salida. Hacer commit, subir la rama y abrir la PR solo cuando la persona usuaria lo confirme. Tras integrar, verificar la CI del push a `main` y el despliegue.
- [x] 7.2 Comprobar en producción: con `curl`, `GET https://app.calendarschools.es/` responde `200` con la SPA y `/api/health` responde bien; la persona usuaria abre la raíz en una ventana sin sesión y comprueba que acaba en `/login`, y con sesión, en la bienvenida.
- [x] 7.3 Documentar el resultado en `reports/YYYY-MM-DD-step-7-production.md`.
