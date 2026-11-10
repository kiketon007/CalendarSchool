## Context

- `App.tsx` declara `/` como una ruta pública con `HomePage`, un marcador de posición de la US00 (título y descripción, sin enlaces). `/login` es otra ruta pública: `LoginPage` muestra su indicador de carga mientras la sesión se resuelve, redirige a `/onboarding` si hay sesión (`<Navigate to="/onboarding" replace />`) y pinta el formulario si no la hay.
- CloudFront sirve `index.html` para `/` y para cualquier ruta de la SPA (la CloudFront Function de rutas). No conoce la sesión: la cookie `refresh_token` tiene `path=/api/auth` y no viaja a `/`.
- Un E2E (`home.cy.ts`) y otro (`session.cy.ts`, «does not show any error on the home page when there is no session») dependen de `data-testid="home-page"`.

## Goals / Non-Goals

**Goals:**
- Que abrir `/` sin sesión lleve a `/login` sin pintar antes ninguna página intermedia.
- Que abrir `/` con sesión acabe en `/onboarding`, como ya hace `/login`.
- No dejar código muerto: se elimina el marcador de posición.

**Non-Goals:**
- Una redirección HTTP en CloudFront (no puede saber si hay sesión).
- Cambiar `/login`, `/onboarding` o el resto de rutas.
- Una página de aterrizaje.

## Decisions

### D1. `/` es un `<Navigate to="/login" replace />`, sin guarda propia
`LoginPage` ya cubre los tres estados de la sesión (cargando, anónima y autenticada), así que `/` no necesita repetirlos. Con `replace`, la entrada `/` no queda en el historial y «atrás» no provoca un bucle. Es la regla única: quien decide a dónde va una sesión autenticada es `/login`.

**Alternativas descartadas:**
- **Un componente `RootRedirect` con la sesión** (anónima → `/login`, autenticada → `/onboarding`): evita un salto cuando hay sesión, pero duplica una regla que ya tiene `LoginPage` y obliga a mantener las dos a la vez. El salto extra es instantáneo y no se ve.
- **Mover `/` dentro de `AuthenticatedLayout`** (que ya redirige a `/login` sin sesión) con `/onboarding` como destino: un visitante sin sesión también acabaría en `/login`, pero el layout pintaría el indicador de carga de las páginas autenticadas y habría que dar a `/` un hijo propio.
- **Redirigir en CloudFront (302):** el borde no conoce la sesión y mandaría a `/login` también a quien sí la tiene.

### D2. Se elimina `HomePage` y sus textos
Ya nada la enlaza ni la muestra. Se borran `HomePage.tsx`, su test, las claves `home.*` de `es.json` y `en.json` (el test de paridad de claves exige que las dos coincidan) y se sustituye `home.cy.ts` por una comprobación de la redirección.

### D3. Las comprobaciones
- **Unitarias (`App.test.tsx`):** `/` sin sesión acaba en `/login` (formulario visible); con sesión, en `/onboarding`; mientras la sesión se resuelve, el indicador de carga y no `home-page`; y «atrás» no vuelve a `/`.
- **E2E:** `home.cy.ts` pasa a comprobar que `/` lleva a `/login` sin errores de consola, y `session.cy.ts` que no se muestra ningún aviso al llegar sin sesión.
- **Producción:** `curl` a `https://app.calendarschools.es/` devuelve la SPA (`200`); la redirección la comprueba la persona usuaria en el navegador, porque `curl` no ejecuta JavaScript.

## Risks / Trade-offs

- **[Un marcador, enlace o prueba externa que apunte a `/` esperando la página vacía]** → No hay ninguno en el repositorio (el smoke test del despliegue solo comprueba que `GET /` responde `200` con la SPA, y sigue siéndolo).
- **[Un parpadeo del formulario antes de que se sepa si hay sesión]** → `LoginPage` ya muestra un indicador de carga mientras la sesión se resuelve, así que no se pinta el formulario hasta saber que no hay sesión.
- **[Quien tenga `/` guardada en favoritos]** → Es justo el caso pedido: ahora lleva a iniciar sesión (o a la bienvenida, si ya hay sesión).

## Migration Plan

Despliegue normal con el push a `main` (frontend estático en S3 más la invalidación de `index.html`). Sin migraciones ni cambios de infraestructura. **Rollback:** revertir el commit y volver a desplegar.

## Open Questions

Ninguna.
