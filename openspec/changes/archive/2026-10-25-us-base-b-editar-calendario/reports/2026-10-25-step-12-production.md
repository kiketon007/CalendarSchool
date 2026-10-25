# Informe del paso 12 - Despliegue y comprobación en producción

- Fecha: 2026-10-25
- Cambio: us-base-b-editar-calendario
- Agente: Claude Sonnet 5.5

## Despliegue

| PR | Contenido | CI sobre `main` | Migraciones del despliegue |
|---|---|---|---|
| #107 | US-BASE_b: leer y editar un calendario base (backend, frontend, documentación) | Los tres jobs en éxito (E2E, lint/tests/build y «Desplegar en producción») | 11 encontradas; «No pending migrations to apply» (esta historia no añade ninguna) |

La CI de la PR pasó a la primera: antes de abrirla se repitieron `npm run lint`, `typecheck --workspaces` y `api:types:check` con el código de salida de cada comando.

## Comprobaciones con curl (sin crear datos)

- `GET /calendarios`, `GET /calendarios/<id>/editar` y `GET /api/health`: `200`.
- El bundle contiene los textos nuevos: «Editar el calendario», «Se quedará sin calendario», «Este calendario no existe o ya no está disponible» y «Solo los administradores pueden modificar calendarios».
- `GET /api/calendars/{id}` y `PUT /api/calendars/{id}` sin token: `401 INVALID_SESSION` con `www-authenticate: Bearer` y `cache-control: no-store`.
- El `404` de un calendario inexistente y el `403` de un `MEMBER` exigen sesión, así que no se pueden pedir sin crear una cuenta; los cubren la prueba en el navegador y las pruebas con `curl` del paso 9.

## Prueba en el navegador (persona usuaria)

Realizada sobre `https://app.calendarschools.es` con la versión de la PR #107 y comunicada como «las pruebas han ido bien»:

- Abrir la edición desde «Editar {nombre}» con «Guardar» deshabilitado, y «Cancelar».
- «Guardar» solo con cambios reales (un espacio de más o una hora cambiada y devuelta no cuentan).
- Renombrar, mover el recreo reajustando las sesiones, añadir y quitar sesiones, y el caso de añadir un recreo y moverlo por horas.
- Cursos: el aviso «Se quedará sin calendario» al desmarcar uno, el de «se moverá» al marcar uno de otro calendario y el resultado en el listado.
- Nombre repetido, calendario inexistente y vista de `MEMBER` sin «Editar» (con la URL de edición llevándolo a la bienvenida).
- Escritorio y móvil sin desplazamiento horizontal, y sin violaciones de CSP.

## Resultado

- Estado del paso 12: PASA
- Problemas bloqueantes: ninguno
