# Informe del paso 8 - Despliegue y comprobación en producción

- Fecha: 2026-10-21
- Cambio: us11-buscar-profesores
- Agente: Claude Sonnet 5.5

## Despliegue

- PR #82 (`feature/us11-buscar-profesores`), integrada por la persona usuaria en `main` (`f0594b0`).
- Ejecución de CI y despliegue sobre el commit de la integración (`39576428273`): **completada con éxito**. Lint, tests y build, E2E con Cypress y «Desplegar en producción» pasan.
- Migraciones: «9 migrations found… No pending migrations to apply». Sin migraciones, como se esperaba (el cambio es solo de frontend).
- Publicación del frontend en S3 e invalidación de `index.html` en CloudFront: correctas. Smoke test contra el dominio de producción: correcto.

## Comprobaciones con `curl` (sin crear ni borrar datos)

Contra `https://app.calendarschools.es`, sin cabecera `Authorization` ni cookies (con `--ssl-no-revoke`, como en comprobaciones anteriores):

| Petición | Respuesta |
|---|---|
| `GET /api/health` | `200` |
| `GET /profesores` | `200`, el `index.html` de la SPA (`id="root"`) |
| Cabecera `Content-Security-Policy` | Presente, con 10 directivas con fuentes y ninguna con `unsafe-` |
| Bundle principal desplegado (`assets/index-9BIMBe24.js`) | `200`; contiene «Buscar por nombre o apellidos», «Mostrando », «No hay profesores que coincidan» y «Limpiar búsqueda»: producción sirve el frontend nuevo |
| `GET /api/professors` sin token | `401` (la API no cambia) |

## Comprobación con un navegador real

La hizo la persona usuaria, porque esta sesión no tiene acceso a producción. Se le pidió comprobar, en escritorio y en el móvil o con la ventana estrecha, en `/profesores`: buscar con y sin acentos; con varias palabras en cualquier orden; un texto sin resultados y «Limpiar búsqueda» (el foco vuelve al campo); con más de 20 profesores, que la paginación vuelve a la página 1 al buscar; sin desplazamiento horizontal a 360 px y la consola sin violaciones de CSP. Confirmó que **todas las pruebas fueron bien**, sin indicar ninguna incidencia.

## Datos de prueba en producción

Esta sesión no creó ni borró ningún dato en producción.

## Resultado

- Estado del paso 8: PASA
- Problemas bloqueantes: ninguno
