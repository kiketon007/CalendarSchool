# Informe del paso 13 - Despliegue y comprobación en producción

- Fecha: 2026-10-23
- Cambio: us18-borrar-alumno
- Agente: Claude Sonnet 5.5

## Despliegue

- PR #100 (`feature/us18-borrar-alumno`), integrada por la persona usuaria en `main` (`6bdf5b9`). La primera ejecución del check «Lint, tests y build» de la PR **falló**: 2 tests de `StudentsPage.test.tsx` (solo a 360 px) leían las filas con el diálogo todavía animando su cierre (ver el informe del paso 9). Se corrigieron en los tests (`8ca3fb1`) y la CI volvió a pasar antes de integrar.
- Ejecución de CI y despliegue sobre el commit de la integración (`39940776894`): **completada con éxito**. Lint, tests y build, E2E con Cypress y «Desplegar en producción» pasan.
- Migraciones: «10 migrations found… No pending migrations to apply». Sin migraciones, como se esperaba.
- Despliegue con CDK, publicación del frontend en S3 e invalidación de `index.html` en CloudFront: correctos. Smoke test contra el dominio de producción: correcto.

## Comprobaciones con `curl` (sin crear ni borrar datos)

Contra `https://app.calendarschools.es`, sin cabecera `Authorization` ni cookies (con `--ssl-no-revoke`, como en comprobaciones anteriores):

| Petición | Respuesta |
|---|---|
| `GET /api/health` | `200` |
| `GET /alumnos` y `GET /alumnos?comedor=si&pagina=2` | `200`, el `index.html` de la SPA |
| Cabecera `Content-Security-Policy` | Presente, una sola línea y sin ninguna directiva con `unsafe-` |
| Bundle principal desplegado (`assets/index-Bt3io06i.js`) | `200`; contiene «Esta acción no se puede deshacer», «Borrar alumno», «Borrando…», «No se pudo borrar el alumno. Inténtalo de nuevo», «Ese alumno ya no existe», «eliminado» y «Borrar {{name}}» |
| `DELETE /api/students/<uuid>` sin token | `401` |
| `DELETE /api/students/abc` sin token | `401` |
| `GET /api/students` sin token | `401` |

## Comprobación con un navegador real

La hizo la persona usuaria, porque esta sesión no tiene acceso a producción. Se le pidió comprobar, en escritorio y en el móvil o con la ventana a 360 px, con alumnos de prueba prescindibles (el borrado es real): el botón «Borrar» junto a «Editar» en cada fila y tarjeta; el diálogo «¿Borrar a Nombre Apellidos?» con «Esta acción no se puede deshacer», sin curso, tipo de comida ni observaciones y con el foco en «Cancelar»; cancelar con el botón y con Escape (el foco vuelve a «Borrar» de esa fila); confirmar: el alumno desaparece sin recargar, el total baja, sale «Alumno «…» eliminado», la URL con filtros y página y el texto de la búsqueda se conservan y el foco pasa al título; borrar al único alumno de la última página (se muestra la anterior); borrar al único alumno de un curso filtrado (el filtro y su opción se mantienen, con «No hay alumnos que coincidan con los filtros» y «Limpiar filtros»); un alumno que se borra desde otra pestaña antes de confirmar («Ese alumno ya no existe» y la lista se recarga); que al recargar siguen sin estar; y que la consola no muestra violaciones de CSP ni hay desplazamiento horizontal a 360 px. Confirmó que **las pruebas fueron bien**, sin indicar ninguna incidencia.

## Datos de prueba en producción

Esta sesión no creó ni borró ningún dato en producción. Los alumnos usados en la prueba manual los gestionó la persona usuaria.

## Observaciones

- Queda pendiente de decidir, fuera de esta historia, que al cargar `/alumnos` en el build servido por `vite preview` el navegador pide `GET /api/students` dos veces (ver el informe del paso 11). No se ha investigado ni se ha comprobado si ocurre en producción.

## Resultado

- Estado del paso 13: PASA
- Problemas bloqueantes: ninguno
