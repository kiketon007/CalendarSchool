# Informe del paso 13 - Despliegue y comprobación en producción

- Fecha: 2026-10-22
- Cambio: us17-editar-alumno
- Agente: Claude Sonnet 5.5

## Despliegue

- PR #94 (`feature/us17-editar-alumno`), integrada por la persona usuaria en `main` (`876e89e`).
- Ejecución de CI y despliegue sobre el commit de la integración (`39825215043`): **completada con éxito**. Lint, tests y build, E2E con Cypress y «Desplegar en producción» pasan.
- Migraciones: «No pending migrations to apply». Sin migraciones, como se esperaba.
- Despliegue con CDK, publicación del frontend en S3 e invalidación de `index.html` en CloudFront: correctos. Smoke test contra el dominio de producción: correcto.

## Comprobaciones con `curl` (sin crear ni borrar datos)

Contra `https://app.calendarschools.es`, sin cabecera `Authorization` ni cookies (con `--ssl-no-revoke`, como en comprobaciones anteriores):

| Petición | Respuesta |
|---|---|
| `GET /api/health` | `200` |
| `GET /alumnos` | `200`, el `index.html` de la SPA |
| `GET /alumnos/<id>/editar` | `200`, el `index.html` de la SPA |
| Cabecera `Content-Security-Policy` | Presente, sin ninguna directiva con `unsafe-` |
| Bundle principal desplegado (`assets/index-BuYy5tJ3.js`) | `200`; contiene «Editar alumno», «Este alumno no existe o ya no está disponible.», «Este alumno no tiene curso. Elige uno para guardar.», «No se pudo guardar el alumno. Inténtalo de nuevo», «Cargando el alumno», «Alumno «{{name}}» actualizado» y `listSearch` |
| `GET /api/students/<id>` sin token | `401` |
| `PUT /api/students/<id>` sin token | `401` |
| `GET /api/students` sin token | `401` |

## Comprobación con un navegador real

La hizo la persona usuaria, porque esta sesión no tiene acceso a producción. Se le pidió comprobar, en escritorio y en el móvil o con la ventana a 360 px: el botón «Editar» en cada fila o tarjeta; el formulario precargado con todos los datos (también tipo de comida y observaciones) y «Guardar» deshabilitado; que «Guardar» se habilita al cambiar un dato y se deshabilita al deshacerlo; el guardado y la vuelta al listado con los mismos filtros y la misma página, con el aviso «Alumno «…» actualizado» y sin tipo de comida ni observaciones en el listado; el cambio de curso (la clase vuelve a «Sin clase»); el paso del comedor a «No» (desaparecen beca y tipo de comida y siguen vacíos al reabrir); un alumno sin curso (aviso, «Guardar» solo al cambiar algo y curso obligatorio con el foco); «Cancelar» sin preguntar y con los filtros; que recargar la página de edición conserva los filtros y que un enlace pegado en otra pestaña vuelve a `/alumnos` sin filtros; un `id` inexistente con «Este alumno no existe o ya no está disponible» y enlace a «Alumnos»; y que la consola no muestra violaciones de CSP ni hay desplazamiento horizontal a 360 px. Confirmó que **todo fue bien**, sin indicar ninguna incidencia.

## Datos de prueba en producción

Esta sesión no creó ni borró ningún dato en producción. Los alumnos usados en la prueba manual los gestionó la persona usuaria.

## Resultado

- Estado del paso 13: PASA
- Problemas bloqueantes: ninguno
