# Informe del paso 14 - Despliegue y comprobación en producción

- Fecha: 2026-10-20
- Cambio: us07-editar-curso
- Agente: Claude Sonnet 5.5

## Despliegue

- PR #68 (`feature/us07-editar-curso`), integrada por la persona usuaria en `main` (`20b1530`, 2026-10-20 11:35 hora local).
- Ejecución de CI y despliegue sobre el commit de la integración (`39401772970`): **completada con éxito**. Lint, tests y build, E2E con Cypress y «Desplegar en producción» pasan.
- Migraciones: el cambio no añade ninguna (usa las tablas e índices únicos de US05), así que el paso de migraciones de producción respondió `No pending migrations to apply` (8 migraciones, todas ya aplicadas).
- Despliegue con CDK, publicación del frontend en S3 e invalidación de `index.html` en CloudFront: correctos. No hay cambios de infraestructura: `/cursos/:id/editar` ya se servía con el `index.html` de la aplicación (la CloudFront Function de las rutas de la SPA).
- Smoke test (`scripts/smoke.mjs`) contra el dominio de producción: correcto.

## Comprobaciones con `curl` (sin crear datos)

Contra el dominio de producción, sin cabecera `Authorization` ni cookies:

| Petición | Respuesta |
|---|---|
| `GET /api/health` | `200` |
| `GET /cursos/<id>/editar`, `/cursos/nuevo` y `/cursos` | `200`, el `index.html` de la SPA (`id="root"`) |
| Cabecera `Content-Security-Policy` de esas respuestas | Presente, con 11 directivas y ninguna con `unsafe-` |
| Bundle principal desplegado | `200`; contiene «Este curso no existe o ya no está disponible», «Otra persona ha cambiado este curso», «actualizado», «Editar {{name}}» y la ruta `/cursos/:id/editar`: producción sirve el frontend nuevo |
| `GET /api/courses/<id>` y `PUT /api/courses/<id>` | `401 INVALID_SESSION`, con `WWW-Authenticate: Bearer` y `Cache-Control: no-store` |
| `GET /api/courses/abc` y `PUT /api/courses/abc` | `401 INVALID_SESSION` (la autenticación va antes de validar el id) |
| `GET /api/courses` y `GET /api/courses/<id>` con un token inválido | `401` |

Ninguna de estas peticiones crea ni cambia datos. Como en las comprobaciones anteriores, `curl` de Windows no puede comprobar la revocación del certificado de este host desde la red del equipo (`CRYPT_E_NO_REVOCATION_CHECK`); se usó `--ssl-no-revoke`, que solo omite esa consulta y sigue validando la cadena y el nombre del certificado.

## Comprobación con un navegador real

La hizo la persona usuaria, porque esta sesión no tiene acceso a producción. Se le pidió comprobar, con un curso que ya existiera: la columna «Acciones» con «Editar» en escritorio y el mismo enlace en cada tarjeta con la ventana estrecha o en el móvil; el formulario relleno con «Guardar» deshabilitado; un guardado que cambia el nombre, renombra una clase, añade otra y quita otra (vuelta a `/cursos` con «Curso «…» actualizado» y los cambios en el listado); un intercambio de nombres A↔B en un solo guardado; el error bajo el nombre al renombrar a un nombre que ya tiene otro curso; «Este curso no existe o ya no está disponible» con un id inexistente en la dirección; opcionalmente, el aviso de «curso cambiado» con «Recargar» abriendo el mismo curso en dos pestañas; y la consola sin violaciones de CSP. Confirmó que **sus pruebas fueron bien**, sin indicar ninguna incidencia.

## Datos de prueba en producción

- Esta sesión no creó ningún dato en producción. Las ediciones de la persona usuaria cambiaron cursos que ya existían (los de sus pruebas de US05 y US06) y los nombres y clases que dejó se quedan, como acordó para futuros tickets. No se ha borrado nada desde esta sesión.
- Si quisiera quitar todos los datos de prueba, el orden de borrado está en el informe del paso 13 de US05 (`courses` antes que `schools`; las clases se borran en cascada).

## Observaciones

- La edición de un curso se serializa con un bloqueo de fila del curso, así que dos personas que lo editan a la vez no se pisan a medias: la segunda ve el estado que dejó la primera, y si la primera quitó una clase que la segunda renombra, recibe el aviso de «curso cambiado».
- El aviso «Curso … actualizado» (y el de creación, de US05) viaja en el `history.state` del navegador y puede volver a verse tras recargar la página. No es un defecto de esta historia ni se ha cambiado; queda como posible mejora (limpiar el estado al mostrarlo).
- La columna «Tutores» sigue mostrando «Sin tutor» hasta que existan los profesores (US09); «Borrar» (US08), los alumnos (US14) y el horario (US-ALGO-VIEW) los añaden sus historias, y sus fichas ya recogen lo que heredan de esta (nota de US07).
- La documentación ya describe todo lo nuevo (grupo 13), así que no queda nada pendiente de documentar.

## Resultado

- Estado del paso 14: PASA
- Problemas bloqueantes: ninguno
