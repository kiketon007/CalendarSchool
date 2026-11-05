## Why

Con US-ALGO-VIEW el colegio ya ve su horario borrador, pero no puede sacarlo de la aplicación para repartirlo a los profesores o archivarlo. US-ALGO-VIEW_b (`docs/User_Stories_MVP.md`, ficha enriquecida el 2026-11-05) lo resuelve con una exportación a Markdown y a HTML, por clase o por profesor. Lo pide el PRD (§2 «Exportación de horarios en Markdown y en HTML», §3.2 y §5 «Exportación y legibilidad»), actualizado el 2026-11-05 con las decisiones de la persona usuaria: sin PDF y con la exportación también para los miembros.

## What Changes

- Botón «Exportar» en `/horarios/borrador` (solo cuando hay borrador, para `ADMIN` y `MEMBER`) que abre el diálogo «Exportar horario»: formato (Markdown o HTML), horarios (por clase o por profesor) y cuál (uno solo, o todas las clases o todos los profesores en un documento). El diálogo arranca con lo que se está viendo.
- Un módulo puro que convierte las tablas de las vistas (`classView`, `professorView`) en un documento Markdown (tablas GFM con los nombres escapados) o HTML **autónomo** (un único `<style>`, colores de las asignaturas, A4 horizontal y un salto de página por horario al imprimir, todo el texto escapado, sin scripts ni recursos externos).
- Los desfases se exportan tal cual, como en pantalla («Sin profesor», sesiones fuera del calendario actual, curso sin calendario).
- Nombres de fichero normalizados: `horario-1o-primaria-a.md`, `horario-garcia-ana.html`, `horarios-clases-AAAA-MM-DD.md` y `horarios-profesores-AAAA-MM-DD.html`, con la fecha de generación del borrador.
- La descarga se hace en el navegador (`Blob` y un `<a download>` temporal), sin peticiones a la API.

**Fuera de alcance:** PDF (el navegador lo guarda desde el HTML); exportar la vista del colegio por día; elegir varios horarios sueltos (es uno o todos); el aviso de borrador desfasado; exportar el horario oficial (US-ALGO-CONFIRM); generar el documento en el servidor; CSV o Excel.

## Capabilities

### New Capabilities

- `schedule-export`: exportar el horario borrador en Markdown o HTML, por clase o por profesor, uno o todos: el diálogo, el contenido y el formato de cada documento, el escapado, los nombres de fichero y la descarga en el navegador.

### Modified Capabilities

- `schedule-draft-view`: la página del borrador deja de ser solo de lectura sin acciones: ofrece «Exportar» a los dos roles cuando hay borrador.

## Impact

- **Frontend:** `utils/scheduleExport.ts` y `utils/download.ts` (nuevos), `components/ScheduleExportModal.tsx` (nuevo), `pages/ScheduleDraftPage.tsx` (botón y diálogo), `i18n/es.json` y `en.json` (`schedule.export.*`), tests unitarios y un E2E nuevo.
- **Backend, infraestructura, contrato (`docs/api-spec.yml`) y modelo de datos:** sin cambios. Se reutiliza `GET /api/schedule/draft`.
- **Dependencias y CSP:** sin cambios.
- **Documentación:** `frontend/CLAUDE.md`, `README.md`, `ARQUITECTURA_COMPLETA.md` (sección 0), la ficha de US-ALGO-VIEW_b y el resumen de la épica. El PRD ya está actualizado.
