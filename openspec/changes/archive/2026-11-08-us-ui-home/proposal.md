## Why

La portada `/onboarding` es lo primero que ve cualquier usuario tras el registro o el login, y hoy está desfasada respecto a la aplicación. Saluda con «Te damos la bienvenida» y muestra solo dos tarjetas sin destino: «Gestión de horarios», como «Próximamente» aunque los horarios ya existen, y «Gestión de comedor», un módulo descartado del alcance. No ofrece ningún acceso a las siete secciones que ya funcionan. US-UI-HOME (`docs/User_Stories_MVP.md`, ficha y su concreción «US-UI-HOME concretada: `/onboarding`») la lleva al diseño de la maqueta y la convierte en el punto de partida hacia cada sección. Es la historia siguiente del orden THEME → SHELL → LISTS → HOME → REST, y la justifican el PRD §4 (interfaz responsive y WCAG 2.1 AA) y la decisión del 2026-11-06 de descartar Comedor.

## What Changes

- **Banner:** sustituye al `h1` suelto. Tiene fondo primario, texto blanco y decoración solo en CSS, y muestra la fecha de hoy en el idioma activo (`time` con `dateTime`), el saludo «Hola, {nombre}» como `h1` y «Aquí tienes todo lo de **{colegio}**», con los dos nombres como texto plano.
- **Secciones:** bajo el sobretítulo «Tu colegio» y el `h2` «¿Qué quieres gestionar hoy?», **siete tarjetas que son enlaces**: Horarios, Cursos, Profesores, Alumnos, Calendarios, Asignaturas y Reglas, con el nombre y el icono de la barra lateral, una frase y un tono. Las rutas deben coincidir con los enlaces de trabajo de la barra lateral, salvo «Inicio».
- **Administración:** se conserva para `ADMIN`, con la tarjeta «Usuarios» en el estilo nuevo.
- **Cuadrícula:** 1, 2 o 4 columnas (por debajo de 576 px, desde 576 px y desde 1200 px), en lugar de 1 o 2.
- **BREAKING (comportamiento de la spec):** se eliminan «Gestión de comedor», la insignia «Próximamente» y el caso de tarjeta no interactiva. `FeatureCard` siempre es un enlace y su ruta pasa a ser obligatoria.
- **Movimiento:** la elevación al pasar el ratón solo existe sin `prefers-reduced-motion`.
- **i18n:** cambian `onboarding.title`, `onboarding.message` y `onboarding.features.title`. Se añaden el sobretítulo y el nombre y la descripción de las seis secciones nuevas, cambia la descripción de `schedules` y se eliminan `onboarding.features.canteen.*` y `onboarding.comingSoon`.

**Fuera de alcance:** las cifras del colegio (clases, alumnos, profesores: necesitan un endpoint; otra historia), la tarjeta «¿Necesitas ayuda?», «Ver todos los módulos», el estado «Disponible» de cada tarjeta, el buscador, el saludo según la hora del día, que la fecha cambie a medianoche, cualquier otra pantalla (US-UI-REST) y la barra lateral, salvo mover su lista de enlaces a un módulo compartido. Sin cambios de backend.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `welcome-screen`: el saludo pasa a un banner con la fecha y el colegio en negrita; las funcionalidades pasan a ser siete secciones que siempre son enlaces y coinciden con la barra lateral (sin Comedor ni «Próximamente»); la cuadrícula pasa a 1, 2 o 4 columnas y la elevación respeta `prefers-reduced-motion`; el E2E recorre los enlaces en lugar de comprobar las tarjetas no interactivas.

## Impact

- **Frontend:**
  - Código: `pages/OnboardingPage.tsx` y `components/FeatureCard.tsx` con sus tests; `components/navigation.ts` (nuevo: recibe de `AppShell` su lista de enlaces) y `components/AppShell.tsx` (la importa); el icono nuevo `components/icons/ArrowRightIcon.tsx`, y se eliminan `CutleryIcon`, `CalendarIcon` y `UsersIcon` si nadie más los usa.
  - Estilos y textos: `styles/_home.scss` (importado por `theme.scss`) y `theme.test.ts`; `i18n/es.json` y `en.json`.
  - Otros tests: `App.test.tsx` (su caso de «Gestión de horarios» como próximamente); los E2E `onboarding.cy.ts` y `courses.cy.ts` (el mismo caso).
  - Documentación: `frontend/CLAUDE.md` y la ficha de US04.
- **Backend, infraestructura, `docs/api-spec.yml` y modelo de datos:** sin cambios. La CSP no cambia.
- **Presupuesto:** el CSS compilado debe seguir por debajo de 33,75 kB en gzip.
