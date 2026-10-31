# Informe del paso 14 - Despliegue y comprobación en producción

- Fecha: 2026-10-31
- Cambio: us19-d-franjas-preferidas
- Agente: Claude Sonnet 5.5

## Integración y despliegue

- Antes de abrir la PR se repitieron `npm run lint`, `npm run typecheck --workspaces` y `npm run api:types:check -w frontend`, los tres con código de salida 0.
- PR #128 (commits `a3d0c27` y `e0d1a2c`, integrada en `main` como `01412cc`).
- **Primer E2E en CI:** falló «fits the grid with its break on a 360 px screen without horizontal scrolling» (362 frente a 345 px útiles). La causa era la tabla de la matriz de la carga, no la cuadrícula: con los dos enlaces de franjas la fila es más ancha. No se reprodujo con exactitud en local (sin barra de desplazamiento y con otras fuentes); se reprodujo ampliando el texto a 19 px. Siguiendo el flujo posterior a `apply`, primero se actualizaron los artefactos (requisito y escenario en `course-workload`, tarea 8.6) y luego se puso la tabla en un contenedor con desplazamiento propio (`Table responsive`). Tras el arreglo, el E2E pasó en CI.
- **CI de `main`** (run 41183275658): Lint, tests y build, E2E con Cypress y Desplegar en producción, los tres en verde. El smoke test del despliegue pasó. No hay migraciones.

## Comprobación con curl en `https://app.calendarschools.es`

- `/cursos/<id>/carga/<id>/preferidas` responde `200` con la SPA y la `Content-Security-Policy`.
- El bundle (`/assets/index-*.js`) contiene los textos nuevos («Franjas preferidas de…», «se ignorarán») y la ruta `preferred-slots`.
- `GET` y `PUT /api/courses/{id}/subjects/{id}/preferred-slots` sin token responden `401 INVALID_SESSION`, igual que `forbidden-slots` y la carga. (Un primer `403` del `GET` fue un error de la prueba: llevaba un cuerpo.)
- `GET /api/health` responde `{"status":"ok","database":"up"}`.

## Prueba de la persona usuaria con un navegador real

Confirmada («todo ok») en escritorio y en el móvil, sin violaciones de CSP:
- Marcar y guardar preferidas y ver el número en la matriz.
- Ver las prohibidas bloqueadas y el aviso de contradicción en rojo, y que desaparece al desmarcarla.
- Verlo todo como `MEMBER`, sin poder editar.
- La matriz de la carga sin desbordar la página en el móvil.

## Resultado

- Estado del paso 14: **PASS**
- Incidencias bloqueantes: ninguna.
