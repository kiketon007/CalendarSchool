## Why

US-UI-THEME a US-UI-HOME dejaron el tema, la barra lateral, los listados y la portada con el diseño de la maqueta. `/horarios` («Generar horarios») sigue con la presentación anterior: un `h1` suelto, un panel `card card-body` y problemas en `li` sueltos. Es la pantalla central del producto (comprueba, genera y confirma el horario) y la única de las pendientes para la que ya hay maqueta (`docsMIO/horarios.png`). US-UI-REST se ha partido en cinco historias por pantallas (`docs/User_Stories_MVP.md`, nota de la ficha y «US-UI-REST_a concretada») y esta es la primera. La justifica el PRD §4 (interfaz responsive y WCAG 2.1 AA).

## What Changes

- **Cabecera:** `PageHeader` con el sobretítulo «Planificación académica», el `h1` «Generar horarios» y la descripción corta de la maqueta; `Container fluid="xxl"` como el resto de páginas.
- **Veredicto:** el texto de hoy dentro de un círculo con el icono (menta si se puede generar, rojo suave si no).
- **Panel de la generación:** pasa a una tarjeta del tema con una franja de degradado en CSS, un sobretítulo y una **insignia de estado** con texto (en curso, mejorando, borrador listo, horario oficial, ya no vigente, sin horario o cancelada). Cuando está completada, la línea «Horario borrador generado: N sesiones colocadas» resalta «N sesiones colocadas», el desglose pasa a dos columnas con las cifras en negrita, un recuadro tintado reúne «Ver horario» y «Confirmar como oficial», y «Generar horarios» y «Generar de nuevo» llevan un icono de calendario y una sombra suave.
- **Tarjetas de cifras (nuevas):** con una generación completada y con puntuación, debajo del panel, tres tarjetas repiten «Huecos de profesores», «Asignaturas consecutivas» y «Penalización actual». Son decorativas para los lectores de pantalla (`aria-hidden`), porque repiten el desglose.
- **Problemas:** «Impiden generar» y «Avisos» pasan a bloques de listado (`ListSection`) con filas `li.cs-list-item`; el texto y los enlaces de cada problema no cambian.
- **i18n:** sobretítulos, insignias, etiquetas de las tarjetas y una descripción más corta; el resaltado y la negrita parciales pasan por `Trans`.

**Sin cambios de comportamiento:** la comprobación, el sondeo cada 2 s, la cancelación, la mejora, la confirmación, el descarte, el foco, los permisos por rol, los `data-testid` y el marcado interno de `ScheduleScoreSummary` (lo comparte la página del borrador).

**Fuera de alcance:** del diseño, el chip y la tarjeta «Curso 2026 / 2027» (datos fijos), el botón «···» y «Configuración»; el resto de pantallas de horarios (`/horarios/borrador`, `/oficial`, `/anteriores`: US-UI-REST_b), los formularios (_c), la carga horaria y la disponibilidad (_d) y las pantallas públicas (_e). Sin cambios de backend. Los estados en curso, fallida y cancelada y las listas de problemas no están en la maqueta: se deducen del patrón del tema.

## Capabilities

### New Capabilities

- `schedule-page-layout`: la presentación de `/horarios` (cabecera, veredicto, tarjeta del panel con insignia de estado, resultado de la generación, tarjetas de cifras y bloques de problemas), con su accesibilidad, su comportamiento adaptable y su presupuesto de CSS.

### Modified Capabilities

Ninguna: los requisitos de `schedule-readiness`, `schedule-generation`, `schedule-score` y `schedule-confirmation` describen comportamiento, que no cambia; esta capacidad solo añade la presentación.

## Impact

- **Frontend:**
  - Páginas y componentes: `pages/ScheduleReadinessPage.tsx`, `components/ScheduleGenerationPanel.tsx`, `components/ScheduleScoreSummary.tsx`, `components/ReadinessIssueItem.tsx` y `components/OfficialScheduleSummary.tsx`, con sus tests.
  - Componente nuevo: `components/ScheduleScoreStats.tsx`, con su test.
  - Utilidad nueva: `utils/generationStatus.ts` (el tipo de una generación completada y su insignia), con su test.
  - Icono nuevo: `components/icons/CircleAlertIcon.tsx`.
  - Estilos: `styles/_schedule.scss` (nuevo, importado por `theme.scss`) y `theme.test.ts`.
  - Textos: `i18n/es.json` y `en.json`.
  - E2E: `scheduleReadiness.cy.ts` y, si buscan algo que cambie, `scheduleGeneration.cy.ts`, `scheduleConfirmation.cy.ts`, `scheduleDraft.cy.ts` y `scheduleExport.cy.ts`.
  - Documentación: `frontend/CLAUDE.md`.
- **Backend, infraestructura, `docs/api-spec.yml` y modelo de datos:** sin cambios. La CSP no cambia.
- **Presupuesto:** el CSS compilado debe seguir por debajo de 33,75 kB en gzip (hoy 31,79 kB).
