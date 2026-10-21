# Informe del paso 12 - Despliegue y comprobación en producción

- Fecha: 2026-10-21
- Cambio: us12-editar-profesor
- Agente: Claude Sonnet 5.5

## Despliegue

- PR #84 (`feature/us12-editar-profesor`), integrada por la persona usuaria en `main` (`42fcda4`).
- Ejecución de CI y despliegue sobre el commit de la integración (`39589591533`): **completada con éxito**. Lint, tests y build, E2E con Cypress y «Desplegar en producción» pasan.
- Migraciones: «9 migrations found… No pending migrations to apply». Sin migraciones, como se esperaba.
- Despliegue del backend con CDK, publicación del frontend en S3 e invalidación de `index.html` en CloudFront: correctos. Smoke test contra el dominio de producción: correcto.

## Comprobaciones con `curl` (sin crear ni borrar datos)

Contra `https://app.calendarschools.es`, sin cabecera `Authorization` ni cookies (con `--ssl-no-revoke`, como en comprobaciones anteriores):

| Petición | Respuesta |
|---|---|
| `GET /api/health` | `200` |
| `GET /profesores/<id>/editar` | `200`, el `index.html` de la SPA (`id="root"`) |
| Cabecera `Content-Security-Policy` | Presente, con 10 directivas con fuentes y ninguna con `unsafe-` |
| Bundle principal desplegado (`assets/index-BU5cufwR.js`) | `200`; contiene «Editar profesor», «dejará de ser tutor», «ya no está disponible», «queda sin tutoría» y la ruta `/api/professors/`: producción sirve el frontend nuevo |
| `GET /api/professors/<id>` sin token | `401` |
| `PUT /api/professors/<id>` sin token | `401` |

## Comprobación con un navegador real

La hizo la persona usuaria, porque esta sesión no tiene acceso a producción. Se le pidió comprobar, en escritorio y en el móvil o con la ventana estrecha: desde «Editar» en `/profesores`, cambiar el nombre y el cargo; cambiar la tutoría a una clase libre y quitarla con «Sin clase»; elegir una clase de otro tutor (se ve «A · tutor: …» y el aviso previo) y comprobar que, tras guardar, el listado nombra al profesor que queda sin tutoría y `/cursos` lo refleja; abrir `/profesores/<id que no existe>/editar`; y que a 360 px no hay desplazamiento horizontal ni violaciones de CSP en la consola. Confirmó que **las pruebas fueron bien**, sin indicar ninguna incidencia.

## Datos de prueba en producción

Esta sesión no creó ni borró ningún dato en producción.

## Resultado

- Estado del paso 12: PASA
- Problemas bloqueantes: ninguno
