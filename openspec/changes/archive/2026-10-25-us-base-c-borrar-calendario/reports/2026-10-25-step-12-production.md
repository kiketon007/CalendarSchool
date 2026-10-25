# Informe del paso 12 - Despliegue y comprobación en producción

- Fecha: 2026-10-25
- Cambio: us-base-c-borrar-calendario
- Agente: Claude Sonnet 5.5

## Integración y despliegue (12.1)

- **PR:** [#109](https://github.com/kiketon007/CalendarSchool/pull/109), integrada por la persona usuaria (commit de fusión `ebf0bed`). En la PR pasaron los dos jobs: «Lint, tests y build» (5 min 19 s) y «E2E con Cypress» (4 min 47 s); «Desplegar» quedó omitido, como corresponde a una PR.
- **CI de `main`** (run 40235288989): `success` en los tres jobs: «Lint, tests y build», «E2E con Cypress» y «Desplegar / Desplegar en producción».
- **Migraciones:** «11 migrations found in prisma/migrations» y «No pending migrations to apply» (esta historia no añade ninguna).
- **Smoke test del despliegue:** `OK` en `GET /`, `POST /api/auth/login` (llega al backend), `GET <execute-api>/api/health` sin `X-Origin-Verify` y `GET /api/health`.
- Antes de abrir la PR se repitieron `npm run lint`, `npm run typecheck --workspaces` y `npm run api:types:check -w frontend`, los tres con código de salida 0.

## Comprobaciones con curl en producción (12.2, parte automática)

Contra `https://app.calendarschools.es`, sin enviar credenciales ni tocar datos:

| Comprobación | Resultado |
|---|---|
| `GET /calendarios` | `200`, `text/html`: la función de rutas de CloudFront sirve la SPA |
| Cabeceras de seguridad de esa respuesta | `Content-Security-Policy` estricta (`default-src 'self'`, solo `google.com/recaptcha` y `gstatic.com/recaptcha` para scripts) y `Strict-Transport-Security` presentes |
| Bundle (`/assets/index-CJB5wZ5B.js`) | Contiene los textos nuevos en los dos idiomas: «Borrar calendario», «se quedarán sin calendario», «Ese calendario ya no existe», «Delete calendar» y «no longer exists» |
| `DELETE /api/calendars/{id}` sin token, con un `id` UUID | `401` con `{"success":false,"error":{"code":"INVALID_SESSION",…}}` |
| `DELETE /api/calendars/no-es-un-uuid` sin token | `401`, con `Cache-Control: no-store` y `WWW-Authenticate: Bearer` (la autenticación va antes que el `id`) |

Ninguna de estas peticiones puede borrar nada: todas fallan antes de llegar al repositorio.

## Comprobación con navegador real (12.2, parte de la persona usuaria)

La persona usuaria la hizo en un navegador real, en escritorio y en el móvil, con la consola abierta, y confirmó que todo fue bien:

- [x] Borrar un calendario **con cursos**: el diálogo lista los cursos, el aviso dice cuántos se quedan sin calendario, el foco queda en el título y los cursos siguen existiendo en `/cursos`.
- [x] Borrar un calendario **sin cursos**: el aviso es «Calendario «X» eliminado».
- [x] **Cancelar** (botón y Escape): no se borra nada y el foco vuelve a «Borrar».
- [x] Entrar como **`MEMBER`**: ve los calendarios sin «Borrar» ni «Editar».
- [x] Escritorio y móvil (el diálogo sin desplazamiento horizontal), sin violaciones de CSP (la persona usuaria no vio ninguna).

## Resultado

- Estado del paso 12: PASA. El despliegue, las comprobaciones con curl y la prueba manual en navegador (escritorio y móvil) son correctos.
- Problemas bloqueantes: ninguno
