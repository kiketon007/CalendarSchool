## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us-algo-view-b` desde `main` actualizada, con los artefactos de este cambio, la ficha enriquecida de `docs/User_Stories_MVP.md` y el PRD actualizado (2026-11-05)
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene eso y `.claude/settings.json`, que debe estar en Sonnet con esfuerzo medio para implementar

## 1. Textos (i18n)

- [x] 1.1 Añadir `schedule.export.*` a `es.json` y `en.json`: botón, título y campos del diálogo, opciones de formato, de tipo y de «Cuál», la explicación sin profesores, títulos de los documentos («Horario de {{name}}», «Horarios de las clases», «Horarios de los profesores») y prefijos de fichero (`horario`, `horarios-clases`, `horarios-profesores`; en inglés, `timetable`, `timetables-classes`, `timetables-professors`)

## 2. Nombres de fichero y escapado (puros, TDD)

- [x] 2.1 Test que falla de `fileNameOf` en `utils/scheduleExport.test.ts`: `1º Primaria A` → `horario-1o-primaria-a.md`, `García-López, José María` → `horario-garcia-lopez-jose-maria.html`, todos con la fecha de generación local (`horarios-clases-2026-11-05.md`), `ª`, guiones repetidos y en los extremos, un nombre solo con símbolos (solo el prefijo y la fecha) y los prefijos en inglés
- [x] 2.2 Implementar `fileNameOf` en `utils/scheduleExport.ts` hasta que pase
- [x] 2.3 Test que falla de `escapeMarkdown` (`\ | * _ ` [ ] < >`, saltos de línea `\r\n`, `\n` y `\r` por un espacio) y de `escapeHtml` (`& < > " '`, y `&` primero para no escapar dos veces)
- [x] 2.4 Implementar `escapeMarkdown` y `escapeHtml` hasta que pasen

## 3. Contenido del documento (puro, TDD)

- [x] 3.1 Preparar en el test un borrador de prueba con `indexDraft`: dos cursos con calendarios distintos (uno con recreo), una clase con huecos libres, un profesor en dos calendarios, una entrada sin profesor, un curso sin calendario y una sesión fuera del calendario actual
- [x] 3.2 Test que falla del modelo intermedio de una clase y de todas las clases (título, fecha con `Intl.DateTimeFormat`, «N sesiones a la semana», una tabla, orden de cursos y clases, curso sin calendario con sus sesiones por día)
- [x] 3.3 Test que falla del modelo de un profesor y de todos los profesores (una tabla por calendario con su nombre, orden por apellidos y nombre, las entradas sin profesor fuera, sesiones en cursos sin calendario)
- [x] 3.4 Implementar el modelo intermedio sobre `classView` y `professorView` (design D2) hasta que pasen 3.2 y 3.3

## 4. Formato Markdown (puro, TDD)

- [x] 4.1 Test que falla de `toMarkdown`: `#`, `##` y `###` (solo con varios calendarios), cabecera `| Sesión | Lunes | … | Viernes |` y su separadora, filas de sesión «Sesión 1 (09:00–09:45)», fila de recreo con celdas vacías, celdas «Asignatura (COD) — profesor» o «— 1º Primaria · A», «Libre», «Sin profesor», la lista de fuera del calendario y la de sin calendario
- [x] 4.2 Test que falla de una asignatura `Lengua | <b>Taller</b>`: cada fila conserva sus seis columnas y el nombre sale escapado
- [x] 4.3 Implementar `toMarkdown` hasta que pasen

## 5. Formato HTML (puro, TDD)

- [x] 5.1 Test que falla de `toHtml`: `<!doctype html>`, `lang`, `charset`, `title`, un único `<style>` con `@page { size: A4 landscape }`, el salto de página entre apartados y `print-color-adjust: exact`; `caption`, `th scope="col"` y `th scope="row"`; el fondo y el texto de `SUBJECT_COLOR_STYLES` en cada celda con sesión
- [x] 5.2 Test que falla de seguridad: sin `<script`, `<link`, `<img`, `@import` ni `url(`; el nombre `Lengua | <b>Taller</b>` como `&lt;b&gt;` y sin elementos `<b>` al parsearlo con `DOMParser`
- [x] 5.3 Implementar `toHtml` hasta que pasen

## 6. Punto de entrada y descarga (TDD)

- [x] 6.1 Test que falla de `exportSchedule({ index, format, kind, target, t, locale })`: nombre, `mimeType` (`text/markdown;charset=utf-8` o `text/html;charset=utf-8`) y contenido para una clase, todas, un profesor y todos, en español y en inglés
- [x] 6.2 Implementar `exportSchedule` hasta que pase
- [x] 6.3 Test que falla de `utils/download.ts` (`downloadFile`): `Blob` con el tipo, `URL.createObjectURL` simulado, el `<a download>` con el nombre, `click`, el enlace quitado del DOM y `URL.revokeObjectURL` después
- [x] 6.4 Implementar `downloadFile` hasta que pase

## 7. Diálogo «Exportar horario» (TDD)

- [x] 7.1 Test que falla de `components/ScheduleExportModal.tsx`: los tres campos con `fieldset`/`legend`, el estado inicial desde las tres vistas, «Cuál» con «Todas las clases» y `optgroup` por curso o «Todos los profesores» y los profesores, el cambio de tipo hacia lo elegido en la página y «Por profesor» deshabilitado sin profesores
- [x] 7.2 Test que falla de las acciones: «Descargar» llama a la descarga con el documento que toca y cierra; «Cancelar» y Escape cierran sin descargar; nada en `localStorage`/`sessionStorage`
- [x] 7.3 Implementar el diálogo hasta que pasen
- [x] 7.4 Test de `axe` del diálogo abierto, por clase y por profesor

## 8. Página del borrador (TDD)

- [x] 8.1 Test que falla en `ScheduleDraftPage.test.tsx`: «Exportar» con borrador (`ADMIN` y `MEMBER`), sin él cuando no hay borrador, mientras carga o tras un fallo; abrir el diálogo desde cada vista con su estado inicial; exportar no hace peticiones (`fetch` llamado una sola vez); el foco vuelve a «Exportar» al cerrar
- [x] 8.2 Añadir el botón y el diálogo a `ScheduleDraftPage` (design D6) hasta que pasen
- [x] 8.3 Test a 360 px: el diálogo cabe y `axe` de la página con el diálogo abierto

## 9. Revisar y actualizar los tests existentes (MANDATORY)

- [x] 9.1 Revisar los tests de `ScheduleDraftPage`, `scheduleDraftViews` y `App` por si el botón nuevo cambia alguna consulta (`getAllByRole('button')`, nombres de grupo) y ajustarlos

## 10. Ejecutar los tests y verificar el estado de la base de datos (MANDATORY)

- [x] 10.1 Vaciar la base de test y capturar la línea base de recuentos (`calendarschool` y `calendarschool_test`)
- [x] 10.2 Ejecutar los tests de los módulos cambiados
- [x] 10.3 Ejecutar `npm test` con cobertura (90 % backend, 80 % frontend) y `npm run lint` y `typecheck`
- [x] 10.4 Comprobar que la base queda como en la línea base y restaurarla si no
- [x] 10.5 Crear `reports/YYYY-MM-DD-step-10-unit-test-and-db-verification.md` y marcar el paso solo con el informe creado

## 11. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 11.1 El backend no cambia: arrancarlo con el lanzador en memoria (sin las claves de reCAPTCHA), preparar un colegio con un nombre de asignatura con `|` y `<b>`, generar y comprobar que `GET /api/schedule/draft` devuelve los nombres tal cual (los escapa el frontend) y sigue respondiendo `200` a `ADMIN` y `MEMBER` y `401` sin token
- [x] 11.2 Restaurar la base, parar el backend, comprobar que el puerto 3000 queda libre y crear `reports/YYYY-MM-DD-step-11-curl-manual-testing.md`

## 12. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 12.1 Añadir `cypress/e2e/scheduleExport.cy.ts`: generar, abrir el borrador, exportar 1º Primaria A en Markdown y todos los profesores en HTML y leer los ficheros de `cypress/downloads` con `cy.readFile` (nombre, tabla, colores en el HTML); el estado inicial desde la vista por profesor; un `MEMBER`; el diálogo a 360 px; sin peticiones nuevas al exportar
- [x] 12.2 Ejecutar la spec y la suite completa en modo headless (`npm run test:e2e`)
- [x] 12.3 Crear `reports/YYYY-MM-DD-step-12-e2e-cypress.md`

## 13. Documentación técnica (MANDATORY)

- [x] 13.1 Actualizar con la skill `update-docs`:
  - `frontend/CLAUDE.md`: la exportación (módulo puro, formatos, escapado, nombres de fichero, diálogo y descarga);
  - `README.md` (módulo de generación) y `ARQUITECTURA_COMPLETA.md` (tabla de la sección 0: exportaciones);
  - el `CLAUDE.md` raíz (el borrador ya se exporta);
  - la ficha de US-ALGO-VIEW_b (estado: implementada) y el resumen de la épica.
- [x] 13.2 Verificar que `.claude/settings.json` está en Sonnet con esfuerzo medio
- [x] 13.3 Verificar con `openspec validate us-algo-view-b --strict` que el cambio es válido

## 14. Despliegue y comprobación en producción

- [x] 14.1 Repetir `npm run lint`, `typecheck` y `api:types:check`, cada uno con su código de salida, y abrir la PR con los grupos 0–13 tras la confirmación de la persona usuaria; tras integrarla, verificar el CI del push a `main`
- [x] 14.2 Comprobar en producción:
  - **Con `curl`:** el bundle contiene los textos nuevos de la exportación y `/api/health` responde bien;
  - **La persona usuaria, con un navegador real**, exporta una clase y todos los profesores en los dos formatos y abre los ficheros.
- [x] 14.3 Documentar el resultado en `reports/YYYY-MM-DD-step-14-production.md`
