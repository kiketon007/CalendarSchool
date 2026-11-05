## Why

Desde US-ALGO-RUN la aplicación genera un horario borrador, pero la persona usuaria solo ve «Horario borrador generado: N sesiones colocadas»: no puede comprobar si el horario es bueno, ni regenerarlo con criterio, ni juzgar más adelante si las preferencias (US-ALGO-RUN_b) lo mejoran. Esta historia, **US-ALGO-VIEW** (`docs/User_Stories_MVP.md`, «Ver el horario generado»), cubre la parte de ver de **PRD §3.6** («Tabla con el horario de cada grupo» y «Horarios individuales de cada especialista»), con los dos roles que el PRD permite («los miembros solo visualizan los horarios»).

## What Changes

- **Endpoint nuevo `GET /api/schedule/draft`** (`ADMIN` y `MEMBER`, `no-store`): devuelve el borrador del colegio de la sesión, o `null`, con todo lo que hace falta para pintarlo en una sola respuesta normalizada: cabecera (`id`, `status`, `generatedAt`, `placedSessions`), los cursos con entradas (con su calendario **actual** y sus clases con entradas), las asignaturas y los profesores de las entradas, y las entradas. Sin escrituras, sin evento, sin códigos de error nuevos y sin migración.
- **Página nueva `/horarios/borrador`** con tres vistas que se construyen en el navegador a partir de esa respuesta, sin más peticiones:
  - **por clase** (un selector agrupado por curso);
  - **por profesor** (una tabla por cada calendario en el que da clase);
  - **de todo el colegio** (un día elegido, con las clases de cada calendario en columnas).
  El estado (vista, clase, profesor, día) vive en la URL con ids y se escribe con `replace`.
- **Componente nuevo `ScheduleGrid`** (tabla de solo lectura): días en columnas, periodos del calendario actual en filas, recreos como separación, «Libre» en las franjas sin sesión, asignatura con su color y su nombre, y el profesor o la clase según la vista.
- **Desfases mínimos para no perder sesiones en silencio:** «Sin profesor» si se borró el profesor; un curso que se quedó sin calendario lista sus sesiones por día con las horas guardadas; las sesiones que ya no existen en el calendario actual se listan debajo de la tabla.
- **El panel de generación** (`ScheduleGenerationPanel`) ofrece «Ver horario» en el estado completado (para `ADMIN` y `MEMBER`) y deja de decir que verlo llega más adelante.

**Fuera de alcance:** exportar a Markdown o PDF (US-ALGO-VIEW_b); el aviso general de borrador desfasado; los accesos «Ver horario» desde `/cursos` y `/profesores`; editar, confirmar o descartar el horario (US-ALGO-CONFIRM); generaciones o borradores anteriores; la puntuación de las preferencias (US-ALGO-RUN_b); estilos de impresión.

## Capabilities

### New Capabilities
- `schedule-draft-view`: lectura del horario borrador (`GET /api/schedule/draft`) y la página `/horarios/borrador` con las vistas por clase, por profesor y de todo el colegio.

### Modified Capabilities
- `schedule-generation`: el estado completado del panel de generación ofrece «Ver horario» y ya no anuncia que verlo llegará más adelante.

## Impact

- **Contrato:** `docs/api-spec.yml` (ruta `GET /api/schedule/draft` y los esquemas `ScheduleDraft*`) y los tipos generados del frontend. Sin cambios en el modelo de datos: se leen `schedules` y `schedule_entries` (US-ALGO-RUN) con los índices que ya tienen.
- **Backend:** un caso de uso y un puerto de lectura en `application/schedule` y `domain/schedule`, su implementación en Prisma, la ruta en `scheduleRouter` y su cableado en `composeApp`.
- **Frontend:** servicio, utilidades puras para construir las vistas y leer la URL, `ScheduleGrid`, `ScheduleDraftPage`, la ruta en `App.tsx`, el enlace en `ScheduleGenerationPanel` y los textos `schedule.draft.*`.
- **Infraestructura:** ninguna.
- **Tests:** unitarios, de integración contra PostgreSQL, de componentes con `axe` a 1280 y 360 px, y E2E con Cypress.
- **Documentación:** `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `README.md`, `ARQUITECTURA_COMPLETA.md` (tabla de la sección 0) y la ficha de la historia.
