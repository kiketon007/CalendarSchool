## Why

Quien abre `https://app.calendarschools.es/` sin sesión se encuentra una página vacía (el marcador de posición de la US00, `HomePage`: solo un título y una descripción, sin enlaces ni botones), y para entrar tiene que escribir `/login` a mano. La persona usuaria pide que, sin sesión iniciada, `/` lleve directamente a `/login`.

La raíz no tiene contenido propio que merezca conservarse: con sesión, la página de inicio real es la de bienvenida (`/onboarding`).

## What Changes

- **`/` redirige a `/login`**, reemplazando la entrada del historial (`<Navigate to="/login" replace />`), sin pintar nada antes y sin guarda propia de sesión. `LoginPage` ya lleva a `/onboarding` a quien tiene sesión, así que:
  - sin sesión: se ve el formulario de inicio de sesión;
  - con sesión: se llega a `/onboarding`;
  - mientras la sesión se resuelve: `LoginPage` muestra su indicador de carga.
- **Se elimina `HomePage`** (el marcador de posición de la US00), su test, sus textos `home.*` de `es.json` y `en.json` y el E2E `home.cy.ts`, que pasa a comprobar la redirección.
- **No es una redirección HTTP:** CloudFront no puede saber si hay sesión (la cookie de renovación solo viaja a `/api/auth/*`), así que la redirección ocurre en el navegador al cargar la aplicación, antes del primer pintado de contenido. La dirección cambia a `/login` y la entrada `/` no queda en el historial.
- Sin cambios de backend, de contrato (`docs/api-spec.yml`), de base de datos ni de infraestructura.

## Capabilities

### New Capabilities
<!-- Ninguna. -->

### Modified Capabilities
- `frontend-shell`: la página inicial vacía deja de existir y `/` redirige a `/login`; la lista de rutas públicas y los escenarios que decían «página inicial» se ajustan.
- `captcha-verification`: el escenario del script de reCAPTCHA ya no menciona la página inicial.
- `cloud-deployment`: abrir el dominio carga la aplicación y, sin sesión, lleva a `/login`.
- `test-infrastructure`: el E2E de arranque comprueba que `/` lleva a `/login` en lugar de cargar la página inicial.

## Impact

- **Frontend:** `App.tsx`; se borran `pages/HomePage.tsx` y `pages/HomePage.test.tsx`; `i18n/es.json` y `i18n/en.json` (claves `home.*`); `App.test.tsx`; `cypress/e2e/home.cy.ts` y `cypress/e2e/session.cy.ts`.
- **Documentación:** `README.md` (árbol de ficheros), `CLAUDE.md` y `docs/frontend-standards.md` (ejemplo de `vitest run` que apuntaba a `HomePage.test.tsx`), y `frontend/CLAUDE.md` (la ruta `/`). Las historias antiguas de `docs/User_Stories_MVP.md` (US00 y el despliegue) describen cómo era la página entonces y se dejan como están.
- **Fuera de alcance:**
  - Cambiar la página `/login` o la de bienvenida.
  - Una redirección en CloudFront.
  - Una página de aterrizaje o de presentación de producto.
