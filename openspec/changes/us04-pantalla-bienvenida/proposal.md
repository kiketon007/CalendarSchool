## Why

Desde US01_c, el registro, el login y la guarda de rol llevan a una página `/onboarding` provisional que solo saluda y promete que «muy pronto» se podrá configurar el colegio. US04 (`docs/User_Stories_MVP.md`, ficha enriquecida) la convierte en la página de inicio definitiva: el PRD (§2, «tras el registro… una pantalla de bienvenida que indica con qué funcionalidad quieres trabajar: gestión de horarios, gestión de comedor, o ambas») pide que el usuario vea las dos funcionalidades principales del producto, y el administrador necesita un acceso directo a lo único ya construido para él, la gestión de usuarios. Cierra el módulo de Autenticación antes de empezar los módulos funcionales (US05 en adelante).

## What Changes

- `OnboardingPage` (`/onboarding`) deja de ser provisional: saludo con el nombre y el colegio, un bloque «Elige con qué quieres trabajar» con dos tarjetas, **Gestión de horarios** y **Gestión de comedor**, con icono, descripción e insignia **«Próximamente»**, que no son enlaces ni botones mientras no exista su módulo.
- Las funcionalidades se declaran como datos (clave, icono, ruta opcional): una con ruta se pinta como enlace sin la insignia. Es el punto de extensión que activarán las historias de cada módulo.
- Solo para `ADMIN`: sección «Administración» con una tarjeta **Usuarios** que enlaza a `/usuarios`.
- `AppHeader`: el nombre de la aplicación pasa a ser un enlace a `/onboarding` (página actual marcada con `aria-current`).
- Textos nuevos de `onboarding.*` en `es.json` y `en.json`; iconos en SVG en línea, sin dependencias nuevas.
- Se mantienen la ruta `/onboarding`, el `data-testid="onboarding-page"`, el saludo y el nombre del colegio (de ellos dependen el registro, el login, `RequireRole`, `UsersPage` y los E2E). No hay cambios incompatibles.

**Fuera de alcance:** `/welcome` y `/dashboard` (ninguna historia define un dashboard), persistir la elección del usuario o si ya vio la pantalla, una bienvenida distinta la primera vez, un asistente de configuración, los módulos de horarios y de comedor y sus rutas, y cualquier cambio en la API, en `docs/api-spec.yml` o en el modelo de datos.

## Capabilities

### New Capabilities
- `welcome-screen`: la página de inicio `/onboarding`: contenido, tarjetas de funcionalidades con su estado «Próximamente», punto de extensión para activarlas, atajo a Usuarios para el administrador, enlace de vuelta desde la cabecera, accesibilidad, responsive, i18n y su E2E.

### Modified Capabilities
- `frontend-shell`: el escenario «Ruta de Onboarding declarada» deja de hablar de una página provisional; `/onboarding` es la página de inicio definitiva de las páginas autenticadas.

## Impact

- **Frontend:** `pages/OnboardingPage.tsx`, `components/AppHeader.tsx`, `i18n/es.json`, `i18n/en.json`, comentarios de `routes/RequireRole.tsx`; tests de `OnboardingPage` y `AppHeader`; E2E nuevo `cypress/e2e/onboarding.cy.ts`.
- **Backend, infraestructura, API (`docs/api-spec.yml`) y modelo de datos:** sin cambios.
- **Dependencias:** ninguna nueva; la CSP no cambia.
- **Documentación:** `frontend/CLAUDE.md`, `README.md` y las referencias a «provisional hasta US04» de las fichas US01_c, US02 y US02_b1.
- **Riesgo de regresión:** 28 ficheros dependen de `/onboarding` y de `onboarding-page`; por eso no cambian la ruta, el identificador de test, el saludo ni la presencia del nombre del colegio.
