# Informe del paso 11 - Despliegue y comprobación en producción

- Fecha: 2026-10-19
- Cambio: us06-listado-cursos
- Agente: Claude Sonnet 5.5

## Despliegue

- PR #65 (`feature/us06-listado-cursos`), integrada por la persona usuaria en `main` (`6b404f3`, 2026-10-19 20:43 UTC).
- Ejecución de CI y despliegue sobre el commit de la integración (`39321653950`): **completada con éxito**. Lint, tests y build, E2E con Cypress y «Desplegar en producción» pasan.
- Migraciones: el cambio no añade ninguna (`courses.created_at` ya existía), así que el paso de migraciones no encontró nada pendiente.
- Despliegue con CDK, publicación del frontend en S3 e invalidación de `index.html` en CloudFront: correctos. No hay cambios de infraestructura: `/cursos` ya se servía con el `index.html` de la aplicación (la CloudFront Function de las rutas de la SPA).
- Smoke test (`scripts/smoke.mjs`) contra `https://app.calendarschools.es`: correcto.

## Comprobaciones con `curl` (sin crear datos)

Contra `https://app.calendarschools.es`, sin cabecera `Authorization` ni cookies:

| Petición | Respuesta |
|---|---|
| `GET /cursos`, `/cursos/nuevo` y `/onboarding` | `200`, el `index.html` de la SPA (`id="root"`); la cabecera `Content-Security-Policy` es idéntica en las tres rutas y a la de antes del cambio |
| `GET /assets/index-CgYs4_LZ.js` (el bundle principal) | `200`, contiene «Buscar por nombre» y «Limpiar búsqueda»: producción sirve el frontend nuevo |
| `GET /api/courses` | `401 INVALID_SESSION` |
| `GET /api/courses?search=x&page=2` | `401 INVALID_SESSION` (la API sigue exigiendo sesión con parámetros) |
| `GET /api/health` | `200` |

Ninguna de estas peticiones crea ni cambia datos. Como en las comprobaciones anteriores, `curl` de Windows no puede comprobar la revocación del certificado de este host desde la red del equipo (`CRYPT_E_NO_REVOCATION_CHECK`); se usó `--ssl-no-revoke`, que solo omite esa consulta y sigue validando la cadena y el nombre del certificado.

## Comprobación con un navegador real

La hizo la persona usuaria, porque esta sesión no tiene acceso a producción, en `https://app.calendarschools.es`. Se le pidió comprobar: la tabla en escritorio con las columnas Curso, Clases, Tutores y Creado, «2 clases: A, B» (o «1 clase: A»), «Sin tutor» y la fecha de creación en castellano, también en los cursos ya existentes; las tarjetas con la ventana estrecha o en el móvil, con los mismos datos y sin desbordes; la búsqueda con «educacion» (sin acentos ni mayúsculas, con «Mostrando N de M cursos»), con «XYZ» (el mensaje sin resultados y «Limpiar búsqueda», que vacía el campo y devuelve el foco) y que escribir no cambia la URL; que no hay botones de editar, borrar ni horario ni columna de alumnos; la consola sin errores de CSP; y, si tenía un usuario `MEMBER` de prueba, que ve lo mismo. Confirmó que **sus pruebas fueron bien**, sin indicar ninguna incidencia.

Quedan comprobados a simple vista por la persona usuaria, en el navegador, los puntos que `axe` en jsdom no mide (el contraste de los textos nuevos).

## Datos de prueba en producción

- Esta sesión no creó ningún dato en producción, y esta historia no crea datos: solo muestra los cursos existentes. Los cursos que ya había (los de las pruebas de US05 de la persona usuaria) siguen ahí; el orden de borrado, si quiere quitarlos, está en el informe del paso 13 de US05 (`courses` antes que `schools`; las clases se borran en cascada).
- No se ha borrado nada en producción desde esta sesión.

## Observaciones

- La búsqueda filtra en el navegador sobre la lista completa del colegio. Es adecuada para decenas de cursos; si un colegio llegara a cientos, la paginación y la búsqueda en el servidor serían otra historia (el contrato ya admite añadir parámetros sin romper nada).
- La columna «Tutores» muestra «Sin tutor» hasta que existan los profesores (US09); US07 y US09 decidirán cómo se listan los nombres. «Editar» y «Borrar» (US07 y US08), los alumnos (US14) y el horario (US-ALGO-VIEW) los añaden sus historias.
- La documentación ya describe todo lo nuevo (tarea 10), así que no queda nada pendiente de documentar.

## Resultado

- Estado del paso 11: PASA
- Problemas bloqueantes: ninguno
