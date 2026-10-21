# Informe del paso 9 - Despliegue y comprobación en producción

- Fecha: 2026-10-21
- Cambio: us10-listado-profesores
- Agente: Claude Sonnet 5.5

## Despliegue

- PR #80 (`feature/us10-listado-profesores`), integrada por la persona usuaria en `main` (`d1dfe30`).
- Ejecución de CI y despliegue sobre el commit de la integración (`39563705993`): **completada con éxito**. Lint, tests y build, E2E con Cypress y «Desplegar en producción» pasan.
- Migraciones: «9 migrations found… No pending migrations to apply». Sin migraciones, como se esperaba (el cambio es solo de frontend).
- Publicación del frontend en S3 e invalidación de `index.html` en CloudFront: correctas. Smoke test contra el dominio de producción: correcto.

## Comprobaciones con `curl` (sin crear ni borrar datos)

Contra `https://app.calendarschools.es`, sin cabecera `Authorization` ni cookies (con `--ssl-no-revoke`, como en comprobaciones anteriores):

| Petición | Respuesta |
|---|---|
| `GET /api/health` | `200` |
| `GET /profesores` | `200`, el `index.html` de la SPA (`id="root"`) |
| Cabecera `Content-Security-Policy` | Presente, con 10 directivas con fuentes y ninguna con `unsafe-` |
| Bundle principal desplegado (`assets/index-cej_ch7-.js`) | `200`; contiene «Tutor de », «Sin tutoría», «Paginación de profesores» y «Página »: producción sirve el frontend nuevo |
| `GET /api/professors` sin token | `401` (la API no cambia) |

## Comprobación con un navegador real

La hizo la persona usuaria, porque esta sesión no tiene acceso a producción. Se le pidió comprobar, en escritorio y en el móvil o con la ventana estrecha: en `/profesores`, el total («N profesores»); la columna «Tutoría» con «Tutor de 1º Primaria A» o «Sin tutoría»; si el colegio tiene más de 20 profesores, la paginación («Página 1 de N», «Siguiente», «Anterior») con los botones deshabilitados en los extremos; sin desplazamiento horizontal a 360 px; y la consola sin violaciones de CSP. Confirmó que **las pruebas fueron bien**, sin indicar ninguna incidencia.

## Datos de prueba en producción

Esta sesión no creó ni borró ningún dato en producción.

## Resultado

- Estado del paso 9: PASA
- Problemas bloqueantes: ninguno
