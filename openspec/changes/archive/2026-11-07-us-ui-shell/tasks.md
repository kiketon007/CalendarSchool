## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us-ui-shell` desde `main` actualizada (`ce9c5a4`, con US-UI-THEME archivada), con los artefactos de este cambio
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene los artefactos de este cambio y `.claude/settings.json`, que debe volver a Sonnet con esfuerzo medio para la implementación

## 1. Piezas sueltas: iniciales, iconos, textos y estilos

- [x] 1.1 Tests que fallan de `src/utils/initials.test.ts` (nombre y apellidos simples, con tilde, con espacios alrededor, una parte vacía, un carácter fuera del plano básico) e implementación de `initialsOf` (D4)
- [x] 1.2 Crear los iconos de D6 en `src/components/icons/` (patrón de `IconProps`, `aria-hidden`, `focusable="false"`, comentario «Icono de Lucide (ISC)») y `LUCIDE-LICENSE.txt` con el texto de la licencia
- [x] 1.3 Añadir a `es.json` y `en.json` las claves `shell.*`:
  - `brandStart`, `brandEnd`, `menu`, `workspace`, `administration`, `home`;
  - `openMenu`, `closeMenu`, `userMenu` («Menú de {{name}}»), `skipToContent`;
  - `role.ADMIN` y `role.MEMBER`.

  Además, el valor de `header.calendars` pasa a «Calendarios» (en inglés, «Calendars»). `locales.test.ts` en verde.
- [x] 1.4 Tests que fallan en `src/styles/theme.test.ts` para las clases del marco (`.cs-sidebar` con 254 px y `sticky` desde `lg`, `.cs-topbar` `sticky`, `.cs-nav-link.active` con fondo `#eeefff`, color de marca y peso 700, `.cs-avatar`) y contraste del enlace activo y del secundario sobre blanco ≥ 4,5:1. Después, crear `src/styles/_shell.scss` (D2) e importarlo al final de `theme.scss` hasta que pasen

## 2. Menú de usuario

- [x] 2.1 Tests que fallan de `src/components/UserMenu.test.tsx`:
  - las iniciales en el botón, con el nombre accesible «Menú de …»;
  - al abrir, el nombre, el rol traducido y el colegio como texto plano;
  - «Cerrar sesión» llama a `onLogout` y está deshabilitada con `isClosing`;
  - Escape cierra y devuelve el foco;
  - `axe` abierto y cerrado.
- [x] 2.2 Implementar `src/components/UserMenu.tsx` (D4) hasta que pasen

## 3. Marco de la aplicación

- [x] 3.1 Tests que fallan de `src/components/AppShell.test.tsx` para la navegación, a 1280 y a 360 px (`installMatchMedia`):
  - los 8 enlaces en orden;
  - «Administración» solo para `ADMIN`;
  - un único `aria-current` en las subrutas, «Inicio» activo en `/onboarding` y la marca hacia `/onboarding` sin `aria-current`.
- [x] 3.2 Tests que fallan del panel a 360 px:
  - «Abrir menú» lo abre con el foco dentro y el nombre «Menú»;
  - Escape y «Cerrar menú» lo cierran con el foco de vuelta en «Abrir menú»;
  - elegir un enlace navega y lo cierra.

  A 1280 px, sin «Abrir menú».
- [x] 3.3 Tests que fallan de «Saltar al contenido»: es el primer enfocable y lleva el foco a `#contenido` sin cambiar la dirección.
- [x] 3.4 Pasar a `AppShell.test.tsx` los casos de cierre de sesión de `AppHeader.test.tsx`, que también fallan:
  - cierre correcto con `replace`;
  - una sola petición con dos pulsaciones;
  - fallo con la alerta bajo la cabecera;
  - reintento que limpia la alerta;
  - sin sesión o cargando, nada.

  Antes de pulsar «Cerrar sesión» se abre el menú.
- [x] 3.5 Implementar `src/components/AppShell.tsx` (D1, D2, D3 y D5) con `WORKSPACE_LINKS` y la lógica de cierre movida de `AppHeader`, hasta que pasen 3.1–3.4
- [x] 3.6 Tests de `axe` en `AppShell.test.tsx`: a 1280 y 360 px, con el panel cerrado y abierto y con el menú de usuario abierto; sin infracciones
- [x] 3.7 Cambiar `AuthenticatedLayout` para que pinte `<AppShell><Outlet /></AppShell>`; su test comprueba el marco y la página dentro de `#contenido`. Borrar `AppHeader.tsx` y `AppHeader.test.tsx`

## 4. Revisar y actualizar los tests unitarios existentes (MANDATORY)

- [x] 4.1 Buscar referencias a `AppHeader`, `app-header` y al botón «Cerrar sesión» en los tests (`App.test.tsx` y las páginas) y ajustarlas al menú de usuario. Comprobar que ninguna página tiene un segundo `main` ni encabezados antes de su `h1` por el marco
- [x] 4.2 Ejecutar `npm run lint`, `npm run typecheck --workspaces` y `npm run api:types:check -w frontend`, cada uno con su código de salida

## 5. Ejecutar los tests y verificar el estado de la base de datos (MANDATORY)

- [x] 5.1 Capturar la línea base de recuentos de `calendarschool` y `calendarschool_test`
- [x] 5.2 Ejecutar los tests de los ficheros nuevos y cambiados (`initials`, `theme`, `UserMenu`, `AppShell`, `AuthenticatedLayout`, `locales`)
- [x] 5.3 Ejecutar `npm test` con cobertura (90 % backend, 80 % frontend)
- [x] 5.4 Comprobar que la base queda como en la línea base y restaurarla si no
- [x] 5.5 Crear `reports/YYYY-MM-DD-step-5-unit-test-and-db-verification.md` (con el tamaño del CSS y del JS del build frente a los de `main`) y marcar el paso solo con el informe creado

## 6. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 6.1 Servir el build con `vite preview` (puerto 4173) y comprobar con `curl` que la cabecera `Content-Security-Policy` es idéntica a la de `main` y que el CSS enlazado contiene `.cs-sidebar`, `.cs-topbar` y `.cs-nav-link`, sin URLs externas
- [x] 6.2 Comprobar con `curl` que `/cursos` y `/horarios/borrador` devuelven la SPA (la función de rutas no cambia)
- [x] 6.3 Parar `vite preview`, comprobar que los puertos 4173, 3000 y 3001 quedan libres y crear `reports/YYYY-MM-DD-step-6-curl-manual-testing.md`

## 7. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 7.1 Crear `cypress/support/shell.ts` (`openUserMenu()` y `logOutFromMenu()`) y cambiar las specs que pulsan «Cerrar sesión» (`logout`, `users`, `csp` y las que aparezcan al buscar) y `onboarding.cy.ts` (la marca en `[data-testid="app-sidebar"]`). Revisar las que bajan a 360 px y después navegan por la barra
- [x] 7.2 Crear `cypress/e2e/shell.cy.ts` con el recorrido de la spec `app-shell`:
  - a 1280 px, los enlaces de cada rol y el activo en `/cursos/<id>/carga`;
  - a 360 px, abrir el panel, cerrarlo con Escape (foco en «Abrir menú») y navegar desde él;
  - el menú de usuario y «Cerrar sesión»;
  - «Saltar al contenido» con el teclado;
  - sin desplazamiento horizontal a 360 y 1280 px en `/cursos`.
- [x] 7.3 Ejecutar la spec nueva y la suite completa en modo headless (`npm run test:e2e`), en dos tandas si la memoria lo exige
- [x] 7.4 Crear `reports/YYYY-MM-DD-step-7-e2e-cypress.md`

## 8. Documentación técnica (MANDATORY)

- [x] 8.1 Actualizar con la skill `update-docs`:
  - `frontend/CLAUDE.md`: las menciones a `AppHeader` pasan a `AppShell` y `UserMenu`, con un bullet «Marco» (Offcanvas `responsive="lg"`, grupos, `aria-current`, «Saltar al contenido», el apoyo de Cypress para el menú);
  - `README.md`: árbol de componentes e iconos de Lucide con su licencia;
  - la ficha de US-UI-SHELL y la fila del módulo «Interfaz de usuario» en `docs/User_Stories_MVP.md` (implementada).
- [x] 8.2 Verificar que `.claude/settings.json` está en Sonnet con esfuerzo medio
- [x] 8.3 Verificar con `openspec validate us-ui-shell --strict` que el cambio es válido

## 9. Despliegue y comprobación en producción

- [x] 9.1 Repetir `npm run lint`, `typecheck` y `api:types:check`, cada uno con su código de salida, y abrir la PR con los grupos 0–8 tras la confirmación de la persona usuaria. Tras integrarla, verificar el CI del push a `main` y el despliegue
- [x] 9.2 Comprobar en producción:
  - **Con `curl`:** el CSS publicado contiene `.cs-sidebar` y la cabecera `Content-Security-Policy` no ha cambiado; `/api/health` responde bien;
  - **La persona usuaria, con un navegador real**, recorre la barra lateral en escritorio y en móvil, el menú de usuario y «Cerrar sesión».
- [x] 9.3 Documentar el resultado en `reports/YYYY-MM-DD-step-9-production.md`
