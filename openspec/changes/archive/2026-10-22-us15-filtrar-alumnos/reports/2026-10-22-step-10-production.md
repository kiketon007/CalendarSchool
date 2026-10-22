# Informe del paso 10 - Despliegue y comprobación en producción

- Fecha: 2026-10-22
- Cambio: us15-filtrar-alumnos
- Agente: Claude Sonnet 5.5

## Despliegue

- PR #92 (`feature/us15-filtrar-alumnos`), integrada por la persona usuaria en `main` (`169b344`). La primera ejecución del check «Lint, tests y build» de la PR **falló** (ver el informe del paso 6): 16 errores sin capturar en los tests de `StudentsPage` (`scrollIntoView` no existe en jsdom) hacían terminar `vitest run --coverage` con código 1 aunque los 103 tests pasaban. Se corrigió en los tests (`79569ad`) y la CI volvió a pasar antes de integrar.
- Ejecución de CI y despliegue sobre el commit de la integración (`39769343083`): **completada con éxito**. Lint, tests y build, E2E con Cypress y «Desplegar en producción» pasan.
- Migraciones: «10 migrations found… No pending migrations to apply». Sin migraciones, como se esperaba.
- Despliegue con CDK, publicación del frontend en S3 e invalidación de `index.html` en CloudFront: correctos. Smoke test contra el dominio de producción: correcto.

## Comprobaciones con `curl` (sin crear ni borrar datos)

Contra `https://app.calendarschools.es`, sin cabecera `Authorization` ni cookies (con `--ssl-no-revoke`, como en comprobaciones anteriores):

| Petición | Respuesta |
|---|---|
| `GET /api/health` | `200` |
| `GET /alumnos` y `GET /alumnos?curso=x&comedor=si&pagina=2` | `200`, el `index.html` de la SPA |
| Cabecera `Content-Security-Policy` | Presente, sin ninguna directiva con `unsafe-` |
| Bundle principal desplegado (`assets/index-CR4Fs25-.js`) | `200`; contiene «Buscar por nombre o apellidos», «Limpiar filtros», «No hay alumnos que coincidan con los filtros», «Come en el comedor», «Todas las clases» y «Paginación de alumnos» |
| `GET /api/students` sin token | `401` |

## Comprobación con un navegador real

La hizo la persona usuaria, porque esta sesión no tiene acceso a producción. Se le pidió comprobar, en escritorio y en el móvil o con la ventana a 360 px: la barra de búsqueda y filtros con Clase y Beca desactivadas y explicadas; la búsqueda por palabras en cualquier orden y sin acentos, con «Mostrando N de M alumnos» y la dirección sin cambios; el filtro por curso (que escribe `?curso=…`), clase y «Sin clase» y el reinicio de la clase al cambiar de curso; comedor y beca; la combinación de búsqueda, curso y comedor; «No hay alumnos que coincidan con los filtros» y «Limpiar filtros» con el foco en la búsqueda; la paginación con `?pagina=2`, que se conserva al recargar y vuelve a la primera al cambiar un filtro; que una dirección copiada en otra pestaña muestra los mismos filtros y que un curso inventado se ignora sin error; y que la consola no muestra violaciones de CSP ni hay desplazamiento horizontal a 360 px. Confirmó que **las pruebas fueron bien**, sin indicar ninguna incidencia.

## Datos de prueba en producción

Esta sesión no creó ni borró ningún dato en producción. Los alumnos usados en la prueba manual los gestionó la persona usuaria.

## Resultado

- Estado del paso 10: PASA
- Problemas bloqueantes: ninguno
