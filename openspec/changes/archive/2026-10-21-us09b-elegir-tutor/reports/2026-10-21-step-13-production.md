# Informe del paso 13 - Despliegue y comprobación en producción

- Fecha: 2026-10-21
- Cambio: us09b-elegir-tutor
- Agente: Claude Sonnet 5.5

## Despliegue

- PR #77 (`feature/us09b-elegir-tutor`), integrada por la persona usuaria en `main` (`2a3894f`, 2026-10-21 08:18 hora local).
- Ejecución de CI y despliegue sobre el commit de la integración (`39554585291`): **completada con éxito**. Lint, tests y build, E2E con Cypress y «Desplegar en producción» pasan (el E2E inestable de `session.cy.ts` no falló).
- Migraciones: «9 migrations found… No pending migrations to apply». Sin migraciones, como se esperaba.
- Despliegue con CDK, publicación del frontend en S3 e invalidación de `index.html` en CloudFront: correctos. Smoke test contra el dominio de producción: correcto.

## Comprobaciones con `curl` (sin crear ni borrar datos)

Contra `https://app.calendarschools.es`, sin cabecera `Authorization` ni cookies (con `--ssl-no-revoke`, como en comprobaciones anteriores, por la revocación del certificado desde la red del equipo):

| Petición | Respuesta |
|---|---|
| `GET /api/health` | `200` |
| `GET /cursos` y `GET /cursos/<id>/editar` | `200`, el `index.html` de la SPA (`id="root"`) |
| Cabecera `Content-Security-Policy` | Presente, con 10 directivas con fuentes y ninguna con `unsafe-` |
| Bundle principal desplegado (`assets/index-q9C5yE8d.js`) | `200`; contiene «Sin tutor», «Tutor de la clase», «ya es tutor de otra clase» y `PROFESSOR_ALREADY_TUTOR`: producción sirve el frontend nuevo |
| `PUT /api/courses/<id>` sin token | `401 INVALID_SESSION` |

## Comprobación con un navegador real

La hizo la persona usuaria, porque esta sesión no tiene acceso a producción. Se le pidió comprobar, en escritorio y en el móvil o con la ventana estrecha: en la edición de un curso con dos clases y algún profesor, asignar un tutor y verlo en «Tutores» de `/cursos`; cambiarlo; intercambiar los de dos clases en un guardado; quitarlo con «Sin tutor»; que un profesor que tutoriza una clase de otro curso no aparece; que no hay desplazamiento horizontal a 360 px; y que la consola no muestra violaciones de CSP. Confirmó que **todas las pruebas fueron bien**, sin indicar ninguna incidencia.

## Datos de prueba en producción

Esta sesión no creó ni borró ningún dato en producción.

## Resultado

- Estado del paso 13: PASA
- Problemas bloqueantes: ninguno
