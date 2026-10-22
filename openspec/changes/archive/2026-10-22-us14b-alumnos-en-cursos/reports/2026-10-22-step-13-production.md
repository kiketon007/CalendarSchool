# Informe del paso 13 - Despliegue y comprobación en producción

- Fecha: 2026-10-22
- Cambio: us14b-alumnos-en-cursos
- Agente: Claude Sonnet 5.5

## Despliegue

- PR #90 (`feature/us14b-alumnos-en-cursos`), integrada por la persona usuaria en `main` (`c64b960`).
- Ejecución de CI y despliegue sobre el commit de la integración (`39750219446`): **completada con éxito**. Lint, tests y build, E2E con Cypress y «Desplegar en producción» pasan.
- Migraciones: «10 migrations found… No pending migrations to apply». Sin migraciones, como se esperaba.
- Despliegue con CDK, publicación del frontend en S3 e invalidación de `index.html` en CloudFront: correctos. Smoke test contra el dominio de producción: correcto.

## Comprobaciones con `curl` (sin crear ni borrar datos)

Contra `https://app.calendarschools.es`, sin cabecera `Authorization` ni cookies (con `--ssl-no-revoke`, como en comprobaciones anteriores):

| Petición | Respuesta |
|---|---|
| `GET /api/health` | `200` |
| `GET /cursos` y `GET /cursos/x/editar` | `200`, el `index.html` de la SPA |
| Cabecera `Content-Security-Policy` | Presente, sin ninguna directiva con `unsafe-` |
| Bundle principal desplegado (`assets/index-BfflidyZ.js`) | `200`; contiene «¿Quitar la clase», «sin clase», «Quitar clase» y «alumnos» |
| `GET /api/courses` y `GET /api/courses/{id}` sin token | `401` los dos |

## Comprobación con un navegador real

La hizo la persona usuaria, porque esta sesión no tiene acceso a producción. Se le pidió comprobar, en escritorio y en el móvil o con la ventana a 360 px: la columna «Alumnos» de `/cursos` con el total y «(N sin clase)» y el número de cada clase; «N alumnos» bajo las clases con alumnos al editar el curso; el diálogo «¿Quitar la clase A?» con el foco en «Cancelar», que al cancelar conserva la clase y devuelve el foco a su «Quitar» y al confirmar la quita del formulario con el foco en «Añadir clase», sin guardar nada todavía; que al guardar `/cursos` muestra «(N sin clase)» y `/alumnos` muestra a esos alumnos «Sin clase»; que quitar una clase sin alumnos o recién añadida no pregunta; y que la consola no muestra violaciones de CSP ni hay desplazamiento horizontal a 360 px. Confirmó que **las pruebas fueron bien**, sin indicar ninguna incidencia.

## Datos de prueba en producción

Esta sesión no creó ni borró ningún dato en producción. Los cursos y alumnos de la prueba manual los creó la persona usuaria.

## Resultado

- Estado del paso 13: PASA
- Problemas bloqueantes: ninguno
